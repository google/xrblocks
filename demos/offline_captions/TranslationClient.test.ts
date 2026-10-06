// @vitest-environment node
import {describe, expect, it} from 'vitest';

import {TranslationClient} from './TranslationClient.js';

type Request = {id: number; type: string} & Record<string, unknown>;

class FakeWorker {
  requests: Request[] = [];
  terminated = false;
  onmessage: ((event: {data: unknown}) => void) | null = null;
  onerror: ((event: {message?: string}) => void) | null = null;
  onmessageerror: (() => void) | null = null;
  postMessage(request: Request) {
    this.requests.push(request);
  }
  terminate() {
    this.terminated = true;
  }
  reply(data: unknown) {
    this.onmessage?.({data});
  }
  last() {
    return this.requests.at(-1)!;
  }
}

function setup() {
  const workers: FakeWorker[] = [];
  const client = new TranslationClient({
    createWorker: () => {
      const worker = new FakeWorker();
      workers.push(worker);
      return worker as unknown as Worker;
    },
  });
  return {client, workers};
}

async function loaded(language = 'es') {
  const context = setup();
  const load = context.client.load(language);
  const worker = context.workers[0];
  worker.reply({type: 'result', id: worker.last().id, result: {loadMs: 1}});
  await load;
  return {...context, worker};
}

describe('TranslationClient', () => {
  it('downloads and loads a named language', async () => {
    const {client, workers} = setup();
    const progress: unknown[] = [];
    const download = client.download('fr', {
      onProgress: (e) => progress.push(e),
    });
    const worker = workers[0];
    expect(worker.last()).toEqual({id: 1, type: 'download', language: 'fr'});
    worker.reply({
      type: 'progress',
      id: 1,
      event: {loaded: 1, total: 2, file: 'a'},
    });
    worker.reply({type: 'result', id: 1, result: {downloadedBytes: 2}});
    await expect(download).resolves.toEqual({downloadedBytes: 2});
    expect(progress).toEqual([{loaded: 1, total: 2, file: 'a'}]);
    const load = client.load('fr');
    expect(worker.last()).toEqual({id: 2, type: 'load', language: 'fr'});
    worker.reply({type: 'result', id: 2, result: {loadMs: 3}});
    await load;
    expect(client.loaded).toBe(true);
    expect(client.language).toBe('fr');
    await expect(client.load('de')).rejects.toThrow(/already loaded/);
  });

  it('translates text and validates the result', async () => {
    const {client, worker} = await loaded();
    expect(() => client.translate('  ')).toThrow(/Invalid text/);
    const ok = client.translate('Hello.');
    expect(worker.last()).toMatchObject({type: 'translate', text: 'Hello.'});
    expect(client.state).toBe('translating');
    worker.reply({
      type: 'result',
      id: worker.last().id,
      result: {text: 'Hola.', language: 'es', translateMs: 9},
    });
    await expect(ok).resolves.toEqual({
      text: 'Hola.',
      language: 'es',
      translateMs: 9,
    });
    expect(client.state).toBe('ready');
    const bad = client.translate('Again.');
    worker.reply({type: 'result', id: worker.last().id, result: {text: 1}});
    await expect(bad).rejects.toThrow(/Malformed translation/);
    expect(client.loaded).toBe(false);
    expect(worker.terminated).toBe(true);
  });

  it('requires a loaded model before translating', () => {
    const {client} = setup();
    expect(() => client.translate('Hello.')).toThrow(/Load a translation/);
  });

  it('unloads in the same worker so switching works offline', async () => {
    const {client, workers, worker} = await loaded('es');
    const unloading = client.unload();
    expect(client.loaded).toBe(false);
    expect(client.language).toBeNull();
    await Promise.resolve();
    expect(worker.last()).toMatchObject({type: 'unload'});
    const load = client.load('de');
    worker.reply({type: 'result', id: worker.last().id, result: {}});
    await unloading;
    await Promise.resolve();
    expect(worker.last()).toMatchObject({type: 'load', language: 'de'});
    worker.reply({type: 'result', id: worker.last().id, result: {loadMs: 1}});
    await load;
    expect(client.language).toBe('de');
    expect(workers).toHaveLength(1);
    expect(worker.terminated).toBe(false);
    expect(client.resets).toBe(0);
  });

  it('waits for an in-flight translation before unloading', async () => {
    const {client, worker} = await loaded('es');
    const pending = client.translate('Hello.');
    const translateId = worker.last().id;
    const unloading = client.unload();
    expect(client.unload()).toBe(unloading);
    expect(worker.last().type).toBe('translate');
    worker.reply({
      type: 'result',
      id: translateId,
      result: {text: 'Hola.', language: 'es', translateMs: 9},
    });
    await expect(pending).resolves.toMatchObject({language: 'es'});
    await Promise.resolve();
    expect(worker.last()).toMatchObject({type: 'unload'});
    worker.reply({type: 'result', id: worker.last().id, result: {}});
    await unloading;
    expect(client.state).toBe('idle');
    expect(client.loaded).toBe(false);
  });

  it('resets the worker if unloading fails, and skips it with no worker', async () => {
    const {client, worker} = await loaded('es');
    const unloading = client.unload();
    await Promise.resolve();
    worker.reply({
      type: 'error',
      id: worker.last().id,
      message: 'nope',
      fatal: false,
    });
    await unloading;
    expect(worker.terminated).toBe(true);
    expect(client.resets).toBe(1);
    const fresh = setup();
    await fresh.client.unload();
    expect(fresh.workers).toHaveLength(0);
  });

  it('recovers from a worker crash', async () => {
    const {client, workers, worker} = await loaded();
    const pending = client.translate('Hello.');
    worker.onerror?.({message: 'boom'});
    await expect(pending).rejects.toThrow('boom');
    expect(client.loaded).toBe(false);
    expect(client.language).toBeNull();
    void client.load('es').catch(() => {});
    expect(workers).toHaveLength(2);
  });
});
