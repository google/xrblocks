import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';

import {bindPreload} from './preload.js';

function deferred() {
  let resolve!: () => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<void>((done, fail) => {
    resolve = done;
    reject = fail;
  });
  return {promise, resolve, reject};
}

function fakeScene() {
  return {
    loadButton: {label: 'Download Gemma 4 (~3.4 GB)', disabled: false},
    stopButton: {disabled: true},
    status: {text: 'Model not loaded.'},
    busy: false,
    cached: false,
    modelKey: 'gemma',
    selectModel: vi.fn(function (this: {modelKey: string}, key: string) {
      this.modelKey = key;
    }),
    client: {loaded: false, state: 'idle'},
    loadModel: vi.fn(async (_options: {allowDownload: boolean}) => {}),
    stop: vi.fn(async () => {}),
    refreshControls: vi.fn(),
  };
}

describe('pre-XR model controls', () => {
  let scene: ReturnType<typeof fakeScene>;
  let panel: HTMLElement;
  let load: HTMLButtonElement;
  let stop: HTMLButtonElement;
  let status: HTMLElement;
  let ready: HTMLElement;
  let binding: ReturnType<typeof bindPreload>;

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
    stop = document.getElementById('preload-stop') as HTMLButtonElement;
    status = document.getElementById('startup')!;
    ready = document.getElementById('preload-ready')!;
    scene = fakeScene();
    binding = bindPreload(scene, panel);
  });

  afterEach(() => {
    binding?.dispose();
    document.body.innerHTML = '';
    vi.restoreAllMocks();
  });

  it('requires explicit consent and does not start a model load or timer', () => {
    const setInterval = vi.spyOn(globalThis, 'setInterval');
    const setTimeout = vi.spyOn(globalThis, 'setTimeout');
    binding.dispose();
    binding = bindPreload(scene, panel);
    binding.refresh();
    expect(scene.loadModel).not.toHaveBeenCalled();
    expect(setInterval).not.toHaveBeenCalled();
    expect(setTimeout).not.toHaveBeenCalled();
    expect(load.textContent).toBe('Download Gemma 4 (~3.4 GB)');
    expect(load.disabled).toBe(false);
    expect(stop.hidden).toBe(true);
    expect(ready.hidden).toBe(true);
    expect(status.getAttribute('role')).toBe('status');
    expect(status.getAttribute('aria-live')).toBe('polite');
    expect(panel.getAttribute('aria-labelledby')).toBe('preload-title');
  });

  it('starts only one download even before the scene publishes busy state', async () => {
    const pending = deferred();
    scene.loadModel.mockReturnValueOnce(pending.promise);
    load.click();
    binding.refresh();
    load.click();
    expect(scene.loadModel).toHaveBeenCalledExactlyOnceWith({
      allowDownload: true,
    });
    expect(load.disabled).toBe(true);
    pending.resolve();
    await Promise.resolve();
    expect(load.disabled).toBe(false);
  });

  it('snapshots cache-only intent even if the scene discovers an evicted file', async () => {
    scene.cached = true;
    scene.loadButton.label = 'Load cached Gemma 4';
    binding.refresh();
    expect(load.textContent).toBe('Load cached Gemma 4');
    scene.loadModel.mockImplementationOnce(async () => {
      scene.cached = false;
      throw new Error('A cached file is missing. Choose Download to retry.');
    });
    load.click();
    await Promise.resolve();
    expect(scene.loadModel).toHaveBeenCalledExactlyOnceWith({
      allowDownload: false,
    });
    expect(status.textContent).toContain('cached file is missing');
    binding.refresh();
    expect(scene.loadModel).toHaveBeenCalledOnce();
    load.click();
    await Promise.resolve();
    expect(scene.loadModel).toHaveBeenLastCalledWith({allowDownload: true});
  });

  it('mirrors progress, compilation and readiness without automatic XR entry', () => {
    scene.busy = true;
    scene.client.state = 'loading';
    scene.loadButton.disabled = true;
    scene.stopButton.disabled = false;
    scene.status.text = 'Downloading 1.70 / 3.40 GB (50%)';
    binding.refresh();
    expect(status.textContent).toContain('50%');
    expect(load.disabled).toBe(true);
    expect(stop.disabled).toBe(false);
    expect(stop.hidden).toBe(false);
    expect(stop.textContent).toBe('Cancel loading');
    scene.status.text = 'Compiling Gemma 4 on WebGPU…';
    binding.refresh();
    expect(status.textContent).toContain('Compiling');
    expect(ready.hidden).toBe(true);
    scene.busy = false;
    scene.client.state = 'ready';
    scene.client.loaded = true;
    scene.stopButton.disabled = true;
    scene.status.text = 'Ready. Inference stays on this device.';
    binding.refresh();
    expect(ready.hidden).toBe(false);
    expect(ready.textContent).toContain('ENTER');
    expect(panel.hidden).toBe(false);
    expect(scene.loadModel).not.toHaveBeenCalled();
    expect(scene.refreshControls).toHaveBeenCalled();
  });

  it('never labels an unsaved load as cached', () => {
    scene.client.loaded = true;
    scene.client.state = 'ready';
    scene.cached = false;
    scene.status.text = 'Loaded for this session; model was not fully saved.';
    binding.refresh();
    expect(ready.hidden).toBe(false);
    expect(status.textContent).toContain('not fully saved');
    expect(scene.cached).toBe(false);
    expect(ready.textContent).not.toMatch(/saved|cached/i);
  });

  it('keeps a final persistence warning visible even when the cache is complete', async () => {
    const warning =
      'Storage persistence was denied; the browser may evict the model.';
    scene.loadModel.mockImplementationOnce(async () => {
      scene.client.loaded = true;
      scene.client.state = 'ready';
      scene.cached = true;
      scene.status.text = `Ready. Model cached. ${warning}`;
    });
    load.click();
    await Promise.resolve();
    binding.refresh();
    binding.refresh();
    expect(ready.hidden).toBe(false);
    expect(status.textContent).toContain(warning);
    expect(scene.status.text).toContain(warning);
  });

  it('cancels through the same scene once and mirrors recovery', async () => {
    const pending = deferred();
    scene.stopButton.disabled = false;
    scene.busy = true;
    scene.client.state = 'loading';
    scene.stop.mockReturnValueOnce(pending.promise);
    binding.refresh();
    stop.click();
    binding.refresh();
    stop.click();
    expect(scene.stop).toHaveBeenCalledOnce();
    expect(stop.disabled).toBe(true);
    scene.busy = false;
    scene.stopButton.disabled = true;
    scene.client.state = 'idle';
    scene.status.text = 'Loading canceled. Reload to continue.';
    pending.resolve();
    await Promise.resolve();
    expect(status.textContent).toContain('canceled');
    expect(stop.hidden).toBe(true);
    expect(load.disabled).toBe(false);
  });

  it('shows rejected actions and leaves retry policy with the scene', async () => {
    scene.loadModel.mockRejectedValueOnce(
      new Error('Insufficient browser storage')
    );
    load.click();
    await Promise.resolve();
    expect(status.textContent).toContain('Insufficient browser storage');
    expect(load.disabled).toBe(false);
    expect(ready.hidden).toBe(true);
    scene.stopButton.disabled = false;
    scene.stop.mockRejectedValueOnce(new Error('Worker reset'));
    binding.refresh();
    stop.click();
    await Promise.resolve();
    expect(status.textContent).toContain('Worker reset');
  });

  it('keeps unsupported, busy and already-loaded scene controls disabled', () => {
    scene.loadButton.disabled = true;
    scene.status.text = 'Unsupported: WebGPU is required.';
    binding.refresh();
    load.click();
    expect(status.textContent).toContain('WebGPU');
    expect(scene.loadModel).not.toHaveBeenCalled();
    scene.loadButton.disabled = false;
    scene.busy = true;
    binding.refresh();
    load.click();
    expect(scene.loadModel).not.toHaveBeenCalled();
    scene.busy = false;
    scene.client.loaded = true;
    scene.loadButton.disabled = true;
    binding.refresh();
    load.click();
    expect(scene.loadModel).not.toHaveBeenCalled();
  });

  it('selects a model through the scene and mirrors its choice', () => {
    const model = panel.querySelector('#preload-model') as HTMLSelectElement;
    expect([...model.options].map((option) => option.value)).toEqual([
      'gemma',
      'lite',
    ]);
    expect(model.value).toBe('gemma');
    model.value = 'lite';
    model.dispatchEvent(new Event('change'));
    expect(scene.selectModel).toHaveBeenCalledWith('lite');
    expect(scene.modelKey).toBe('lite');
    expect(scene.loadModel).not.toHaveBeenCalled();
    scene.modelKey = 'gemma';
    binding.refresh();
    expect(model.value).toBe('gemma');
    scene.busy = true;
    binding.refresh();
    expect(model.disabled).toBe(true);
    scene.busy = false;
    scene.client.state = 'generating';
    binding.refresh();
    expect(model.disabled).toBe(true);
    scene.client.state = 'ready';
    binding.refresh();
    expect(model.disabled).toBe(false);
    binding.dispose();
    model.value = 'lite';
    model.dispatchEvent(new Event('change'));
    expect(scene.selectModel).toHaveBeenCalledOnce();
  });

  it('does not rewrite unchanged live status or interpret output as HTML', () => {
    const observer = new MutationObserver(() => {});
    observer.observe(status, {childList: true, subtree: true});
    binding.refresh();
    binding.refresh();
    expect(observer.takeRecords()).toHaveLength(0);
    scene.status.text = '<img src="https://example.invalid/tracking">';
    binding.refresh();
    expect(status.textContent).toBe(scene.status.text);
    expect(status.children).toHaveLength(0);
    observer.disconnect();
  });

  it('removes event listeners and does not refresh after disposal', () => {
    const removeListener = vi.spyOn(
      panel.querySelector('#preload-load')!,
      'removeEventListener'
    );
    scene.stopButton.disabled = false;
    binding.refresh();
    const previousStatus = status.textContent;
    binding.dispose();
    load.click();
    stop.click();
    scene.status.text = 'Should not render';
    binding.refresh();
    expect(removeListener).toHaveBeenCalledWith('click', expect.any(Function));
    expect(scene.loadModel).not.toHaveBeenCalled();
    expect(scene.stop).not.toHaveBeenCalled();
    expect(status.textContent).toBe(previousStatus);
  });

  it('ignores a pending action rejection after disposal', async () => {
    const pending = deferred();
    scene.loadModel.mockReturnValueOnce(pending.promise);
    load.click();
    const previousStatus = scene.status.text;
    binding.dispose();
    pending.reject(new Error('Late error'));
    await Promise.resolve();
    expect(scene.status.text).toBe(previousStatus);
    expect(status.textContent).toBe(previousStatus);
  });

  it('continues in the already-running simulator without loading a model', () => {
    const continueButton = panel.querySelector(
      '#preload-continue'
    ) as HTMLButtonElement;
    expect(continueButton).not.toBeNull();
    expect(continueButton.hidden).toBe(true);
    continueButton.click();
    expect(panel.hidden).toBe(false);
    continueButton.hidden = false;
    continueButton.click();
    expect(panel.hidden).toBe(true);
    expect(scene.loadModel).not.toHaveBeenCalled();
    expect(scene.stop).not.toHaveBeenCalled();
    panel.hidden = false;
    binding.dispose();
    continueButton.click();
    expect(panel.hidden).toBe(false);
  });
});

type Lifecycle = {
  init?(): void;
  update?(): void;
  onXRSessionStarted?(): void;
  onXRSessionEnded?(): void;
  onSimulatorStarted?(): void;
  dispose?(): void;
};

describe('landing panel script lifecycle', () => {
  let scene: ReturnType<typeof fakeScene>;
  let panel: HTMLElement;
  let wrapper: HTMLElement;
  let scripts: Lifecycle[];
  let core: {
    xrButton: {domElement: HTMLElement} | undefined;
    simulatorRunning: boolean;
  };
  let autostart: boolean;
  let startupError: Error | undefined;

  beforeEach(() => {
    vi.resetModules();
    scene = fakeScene();
    const html = readFileSync(
      resolve(import.meta.dirname, 'index.html'),
      'utf8'
    );
    document.body.innerHTML = new DOMParser().parseFromString(
      html,
      'text/html'
    ).body.innerHTML;
    panel = document.getElementById('model-preload')!;
    wrapper = document.createElement('div');
    wrapper.id = 'XRButtonWrapper';
    const enter = document.createElement('button');
    enter.textContent = 'ENTER XR';
    wrapper.append(enter);
    document.body.append(wrapper);
    scripts = [];
    core = {xrButton: {domElement: wrapper}, simulatorRunning: false};
    autostart = false;
    startupError = undefined;
    vi.doMock('./GemmaVisionDemo.js', () => ({
      GemmaVisionDemo: vi.fn(function () {
        return scene;
      }),
    }));
    vi.doMock('xrblocks', () => ({
      Script: class {},
      Options: class {
        xrButton = {};
        enableCamera() {
          return this;
        }
      },
      core,
      add: (...values: Lifecycle[]) => scripts.push(...values),
      init: async () => {
        for (const script of scripts) script.init?.();
        if (autostart) {
          core.simulatorRunning = true;
          scripts[1].onSimulatorStarted?.();
          wrapper.remove();
          core.xrButton = undefined;
        }
        if (startupError) {
          for (const script of scripts) script.dispose?.();
          throw startupError;
        }
      },
    }));
  });

  afterEach(() => {
    for (const script of scripts) script.dispose?.();
    vi.doUnmock('./GemmaVisionDemo.js');
    vi.doUnmock('xrblocks');
    vi.restoreAllMocks();
    document.body.innerHTML = '';
  });

  it('mounts one shared scene above XR entry and restores the panel after XR', async () => {
    await import('./main.js');
    expect(scripts).toHaveLength(2);
    expect(scripts[0]).toBe(scene);
    expect(wrapper.firstElementChild).toBe(panel);
    expect(scene.loadModel).not.toHaveBeenCalled();
    scripts[1].onXRSessionStarted?.();
    expect(panel.hidden).toBe(true);
    scripts[1].onXRSessionEnded?.();
    expect(panel.hidden).toBe(false);
    expect(
      (panel.querySelector('#preload-continue') as HTMLElement).hidden
    ).toBe(true);
  });

  it('keeps the landing panel visible through automatic desktop simulator startup', async () => {
    autostart = true;
    await import('./main.js');
    expect(panel.isConnected).toBe(true);
    expect(panel.parentElement).toBe(document.body);
    expect(panel.hidden).toBe(false);
    const continueButton = panel.querySelector(
      '#preload-continue'
    ) as HTMLButtonElement;
    expect(continueButton.hidden).toBe(false);
    expect(scene.loadModel).not.toHaveBeenCalled();
    continueButton.click();
    expect(panel.hidden).toBe(true);
    expect(scene.loadModel).not.toHaveBeenCalled();
  });

  it('restores an inert error panel after initialization disposes its scripts', async () => {
    autostart = true;
    startupError = new Error('Simulator initialization failed');
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    await expect(import('./main.js')).resolves.toBeDefined();
    expect(panel.isConnected).toBe(true);
    expect(panel.parentElement).toBe(document.body);
    expect(panel.hidden).toBe(false);
    expect(panel.querySelector('#startup')?.textContent).toContain(
      startupError.message
    );
    for (const control of panel.querySelectorAll('button, select')) {
      expect((control as HTMLButtonElement).disabled).toBe(true);
      (control as HTMLElement).click();
    }
    expect(scene.loadModel).not.toHaveBeenCalled();
    expect(log).toHaveBeenCalledWith(
      'Gemma vision initialization failed',
      startupError
    );
  });

  it('rescues an already-mounted panel before the SDK disposes XRButton', async () => {
    await import('./main.js');
    expect(panel.parentElement).toBe(wrapper);
    core.simulatorRunning = true;
    scripts[1].onSimulatorStarted?.();
    wrapper.remove();
    core.xrButton = undefined;
    expect(panel.isConnected).toBe(true);
    expect(panel.parentElement).toBe(document.body);
    expect(panel.hidden).toBe(false);
    scripts[1].onXRSessionStarted?.();
    expect(panel.hidden).toBe(true);
    scripts[1].onXRSessionEnded?.();
    expect(panel.hidden).toBe(false);
    expect(
      (panel.querySelector('#preload-continue') as HTMLElement).hidden
    ).toBe(false);
    scripts[1].dispose?.();
    expect(panel.isConnected).toBe(false);
  });

  it('refreshes through the frame loop at most 10 Hz and skips hidden panels', async () => {
    const now = vi.spyOn(performance, 'now').mockReturnValue(0);
    await import('./main.js');
    scene.refreshControls.mockClear();
    now.mockReturnValue(99);
    scripts[1].update?.();
    expect(scene.refreshControls).not.toHaveBeenCalled();
    now.mockReturnValue(100);
    scripts[1].update?.();
    now.mockReturnValue(150);
    scripts[1].update?.();
    expect(scene.refreshControls).toHaveBeenCalledOnce();
    panel.hidden = true;
    now.mockReturnValue(300);
    scripts[1].update?.();
    expect(scene.refreshControls).toHaveBeenCalledOnce();
  });
});
