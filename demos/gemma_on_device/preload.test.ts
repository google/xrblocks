import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';

import {bindPreload} from './preload.js';

describe('pre-XR model loading', () => {
  let scene;
  let panel: HTMLElement;
  let load: HTMLButtonElement;
  let cancel: HTMLButtonElement;
  let status: HTMLElement;
  let ready: HTMLElement;
  let binding;

  beforeEach(() => {
    const html = readFileSync(
      resolve(import.meta.dirname, 'index.html'),
      'utf8'
    );
    document.body.innerHTML = new DOMParser().parseFromString(
      html,
      'text/html'
    ).body.innerHTML;
    panel = document.getElementById('model-preload')!;
    load = document.getElementById('preload-load') as HTMLButtonElement;
    cancel = document.getElementById('preload-cancel') as HTMLButtonElement;
    status = document.getElementById('startup')!;
    ready = document.getElementById('preload-ready')!;
    scene = {
      loadButton: {label: 'Download Gemma 4 (~2 GB)', disabled: false},
      stopButton: {label: 'Stop', disabled: true},
      status: {text: 'Model not loaded.'},
      client: {state: 'idle'},
      loadModel: vi.fn(async () => {}),
      stop: vi.fn(async () => {}),
      showError: vi.fn((error) => {
        scene.status.text = `Error: ${error.message}`;
      }),
    };
    binding = bindPreload(scene, panel);
  });

  afterEach(() => {
    binding?.dispose();
    vi.doUnmock('xrblocks');
    vi.doUnmock('./GemmaScene.js');
    document.body.innerHTML = '';
  });

  it('starts with explicit ~2 GB consent and no automatic loading', () => {
    expect(load.textContent).toBe('Download Gemma 4 (~2 GB)');
    expect(load.disabled).toBe(false);
    expect(scene.loadModel).not.toHaveBeenCalled();
    expect(cancel.hidden).toBe(true);
    expect(ready.hidden).toBe(true);
    expect(status.getAttribute('role')).toBe('status');
    expect(status.getAttribute('aria-live')).toBe('polite');
  });

  it('calls the existing scene loader once and mirrors progress/cancel controls', async () => {
    let finish!: () => void;
    scene.loadModel.mockImplementationOnce(() => {
      scene.loadButton.disabled = true;
      scene.stopButton = {label: 'Cancel download', disabled: false};
      scene.status.text = 'Downloading: 0.50 / 2.01 GB (25%)';
      return new Promise<void>((resolve) => (finish = resolve));
    });
    load.click();
    load.click();
    expect(scene.loadModel).toHaveBeenCalledOnce();
    expect(load.disabled).toBe(true);
    expect(status.textContent).toContain('25%');
    expect(cancel.hidden).toBe(false);
    cancel.click();
    expect(scene.stop).toHaveBeenCalledOnce();
    scene.status.text = 'Download canceled. You can retry.';
    scene.loadButton.disabled = false;
    scene.stopButton = {label: 'Stop', disabled: true};
    finish();
    await Promise.resolve();
    binding.refresh();
    expect(status.textContent).toContain('Download canceled');
    expect(load.disabled).toBe(false);
    expect(cancel.hidden).toBe(true);
  });

  it('reuses cached loading and announces readiness without entering XR automatically', async () => {
    scene.loadButton.label = 'Load cached Gemma 4';
    binding.refresh();
    expect(load.textContent).toBe('Load cached Gemma 4');
    scene.loadModel.mockImplementationOnce(async () => {
      scene.loadButton.disabled = true;
      scene.client.state = 'ready';
      scene.status.text = 'Ready. Inference stays on this device.';
    });
    load.click();
    await Promise.resolve();
    binding.refresh();
    expect(scene.loadModel).toHaveBeenCalledOnce();
    expect(ready.hidden).toBe(false);
    expect(ready.textContent).toContain('ENTER XR');
    expect(load.disabled).toBe(true);
  });

  it('shows initialization and errors while preserving the scene retry policy', async () => {
    scene.client.state = 'loading';
    scene.loadButton.disabled = true;
    scene.status.text = 'Initializing Gemma 4 in a WebGPU worker…';
    binding.refresh();
    expect(status.textContent).toContain('Initializing');
    expect(cancel.hidden).toBe(true);
    expect(ready.hidden).toBe(true);
    scene.client.state = 'error';
    scene.loadButton.disabled = false;
    scene.status.text = 'Error: Quota exceeded.';
    binding.refresh();
    expect(load.disabled).toBe(false);
    expect(status.textContent).toContain('Quota exceeded');
    scene.loadModel.mockRejectedValueOnce(new Error('Worker unavailable'));
    load.click();
    await vi.waitFor(() =>
      expect(status.textContent).toContain('Worker unavailable')
    );
    expect(scene.showError).toHaveBeenCalledOnce();
  });

  it('keeps unsupported loading disabled and releases event handlers on disposal', () => {
    scene.loadButton.disabled = true;
    scene.status.text = 'Unsupported: requires WebGPU.';
    binding.refresh();
    load.click();
    expect(scene.loadModel).not.toHaveBeenCalled();
    expect(status.textContent).toContain('Unsupported');
    scene.loadButton.disabled = false;
    binding.refresh();
    binding.dispose();
    load.click();
    cancel.click();
    expect(scene.loadModel).not.toHaveBeenCalled();
    expect(scene.stop).not.toHaveBeenCalled();
  });

  it('does not rewrite unchanged live status on every refresh', () => {
    const changes = new MutationObserver(() => {});
    changes.observe(status, {childList: true});
    binding.refresh();
    binding.refresh();
    expect(changes.takeRecords()).toHaveLength(0);
    changes.disconnect();
  });

  it('mounts beside existing XR entry controls and follows public script lifecycle', async () => {
    binding.dispose();
    vi.resetModules();
    const wrapper = document.createElement('div');
    const enterXR = document.createElement('button');
    const enter = vi.fn();
    enterXR.textContent = 'ENTER XR';
    enterXR.onclick = enter;
    wrapper.append(enterXR);
    document.body.append(wrapper);
    const scripts: Array<{
      init?: () => void;
      onXRSessionStarted?: () => void;
      onXRSessionEnded?: () => void;
      onSimulatorStarted?: () => void;
      dispose?: () => void;
    }> = [];
    const createScene = vi.fn(function () {
      return scene;
    });
    vi.doMock('./GemmaScene.js', () => ({GemmaScene: createScene}));
    vi.doMock('xrblocks', () => ({
      Script: class {},
      Options: class {
        xrButton = {};
        enableSceneContext() {
          return this;
        }
        enableHands() {
          return this;
        }
      },
      core: {xrButton: {domElement: wrapper}},
      add: (...values: typeof scripts) => scripts.push(...values),
      init: async () => {
        for (const script of scripts) script.init?.();
      },
    }));

    await import('./main.js');
    expect(createScene).toHaveBeenCalledOnce();
    expect(scripts[0]).toBe(scene);
    expect(wrapper.firstElementChild).toBe(panel);
    expect(enterXR.disabled).toBe(false);
    expect(enterXR.onclick).toBe(enter);
    expect(enter).not.toHaveBeenCalled();
    expect(scene.loadModel).not.toHaveBeenCalled();
    scripts[1].onXRSessionStarted?.();
    expect(panel.hidden).toBe(true);
    scripts[1].onXRSessionEnded?.();
    expect(panel.hidden).toBe(false);
    scripts[1].onSimulatorStarted?.();
    expect(panel.hidden).toBe(true);
    scripts[1].dispose?.();
    expect(panel.isConnected).toBe(false);
    load.click();
    expect(scene.loadModel).not.toHaveBeenCalled();
  });
});
