import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {beforeEach, describe, expect, it, vi} from 'vitest';

import {bindPreload} from './preload.js';

const html = readFileSync(resolve(import.meta.dirname, 'index.html'), 'utf8');

function createScene() {
  const scene = {
    cached: false,
    busy: false,
    supported: true,
    stopping: false,
    operation: undefined as undefined | {type: string},
    client: {loaded: false},
    status: {text: 'Download the model once.'},
    loadButton: {label: 'Download captions model (~94 MB)'},
    refreshControls: vi.fn(),
    showError: vi.fn((error: Error) => {
      scene.status.text = `Error: ${error.message}`;
    }),
    loadModel: vi.fn(async (_options: {allowDownload: boolean}) => {
      scene.client.loaded = true;
    }),
    cancelLoad: vi.fn(async () => {}),
    language: null as null | string,
    translationCached: false,
    translationOperation: undefined as undefined | {language: string},
    translateButton: {label: 'Choose a language', disabled: true},
    selectLanguage: vi.fn(async (code: string | null) => {
      scene.language = code;
      scene.translateButton = {
        label: 'Download Spanish (~119 MB)',
        disabled: false,
      };
    }),
    loadTranslation: vi.fn(async (_options: {allowDownload: boolean}) => {}),
    cancelTranslation: vi.fn(async () => {}),
  };
  return scene;
}

let panel: HTMLElement;
beforeEach(() => {
  document.body.innerHTML = new DOMParser()
    .parseFromString(html, 'text/html')
    .body.innerHTML.replace(/<script[\s\S]*?<\/script>/g, '');
  panel = document.getElementById('model-preload')!;
});

const $ = (id: string) => panel.querySelector<HTMLButtonElement>(`#${id}`)!;
const select = () =>
  panel.querySelector<HTMLSelectElement>('#translate-language')!;

describe('preload panel', () => {
  it('mirrors the scene and loads with download consent from the click', async () => {
    const scene = createScene();
    const controls = bindPreload(scene, panel);
    expect($('preload-load').disabled).toBe(false);
    expect($('preload-load').textContent).toBe(scene.loadButton.label);
    expect($('startup').textContent).toBe('Download the model once.');
    $('preload-load').click();
    expect(scene.loadModel).toHaveBeenCalledWith({allowDownload: true});
    await vi.waitFor(() => expect($('preload-ready').hidden).toBe(false));
    expect($('preload-load').disabled).toBe(true);
    controls.dispose();
  });

  it('loads cached models without download consent', () => {
    const scene = createScene();
    scene.cached = true;
    scene.loadButton.label = 'Load cached captions model';
    bindPreload(scene, panel);
    $('preload-load').click();
    expect(scene.loadModel).toHaveBeenCalledWith({allowDownload: false});
  });

  it('shows Cancel only while loading and keeps the load label', () => {
    const scene = createScene();
    const controls = bindPreload(scene, panel);
    scene.operation = {type: 'loading'};
    scene.loadButton.label = 'Cancel';
    controls.refresh();
    expect($('preload-stop').hidden).toBe(false);
    expect($('preload-load').disabled).toBe(true);
    expect($('preload-load').textContent).toBe(
      'Download captions model (~94 MB)'
    );
    $('preload-stop').click();
    expect(scene.cancelLoad).toHaveBeenCalled();
  });

  it('hides itself for the simulator and detaches listeners on dispose', () => {
    const scene = createScene();
    const controls = bindPreload(scene, panel);
    $('preload-continue').hidden = false;
    $('preload-continue').click();
    expect(panel.hidden).toBe(true);
    controls.dispose();
    panel.hidden = false;
    $('preload-load').click();
    $('preload-continue').click();
    expect(scene.loadModel).not.toHaveBeenCalled();
    expect(panel.hidden).toBe(false);
  });

  it('picks a language without downloading, then downloads on a click', async () => {
    const scene = createScene();
    const controls = bindPreload(scene, panel);
    expect([...select().options].map(({value, text}) => [value, text])).toEqual(
      [
        ['', 'Off'],
        ['es', 'Spanish'],
        ['fr', 'French'],
        ['de', 'German'],
      ]
    );
    expect(select().disabled).toBe(false);
    expect($('translate-load').hidden).toBe(true);
    select().value = 'es';
    select().dispatchEvent(new Event('change'));
    expect(scene.selectLanguage).toHaveBeenCalledWith('es');
    await vi.waitFor(() => expect($('translate-load').hidden).toBe(false));
    expect(scene.loadTranslation).not.toHaveBeenCalled();
    expect($('translate-load').textContent).toBe('Download Spanish (~119 MB)');
    $('translate-load').click();
    expect(scene.loadTranslation).toHaveBeenCalledWith({allowDownload: true});
    select().value = '';
    select().dispatchEvent(new Event('change'));
    expect(scene.selectLanguage).toHaveBeenLastCalledWith(null);
    controls.dispose();
  });

  it('loads a cached language without consent and cancels from the button', () => {
    const scene = createScene();
    scene.language = 'fr';
    scene.translationCached = true;
    scene.translateButton = {label: 'Load cached French', disabled: false};
    const controls = bindPreload(scene, panel);
    expect(select().value).toBe('fr');
    $('translate-load').click();
    expect(scene.loadTranslation).toHaveBeenCalledWith({allowDownload: false});
    scene.translationOperation = {language: 'fr'};
    scene.translateButton = {label: 'Cancel', disabled: false};
    controls.refresh();
    expect(select().disabled).toBe(true);
    $('translate-load').click();
    expect(scene.cancelTranslation).toHaveBeenCalled();
    controls.dispose();
    scene.translationOperation = undefined;
    $('translate-load').click();
    expect(scene.loadTranslation).toHaveBeenCalledTimes(1);
  });

  it('reports load errors in the status line', async () => {
    const scene = createScene();
    scene.loadModel.mockRejectedValueOnce(new Error('quota'));
    bindPreload(scene, panel);
    $('preload-load').click();
    await vi.waitFor(() =>
      expect($('startup').textContent).toBe('Error: quota')
    );
  });
});
