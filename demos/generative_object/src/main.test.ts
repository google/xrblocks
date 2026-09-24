import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import * as xb from 'xrblocks';

import {GenerativeObjects} from './GenerativeObjects.js';
import {GenerativeObjectDemo, start} from './main.js';

vi.mock('../../../src/singletons', async () => {
  const {Scene} = await import('three');
  return {
    core: {scene: new Scene(), sound: {speechRecognizer: null}},
    add: vi.fn(),
    init: vi.fn().mockResolvedValue(undefined),
  };
});

function setup() {
  const generative = new GenerativeObjects();
  vi.spyOn(generative, 'isSupported', 'get').mockReturnValue(true);
  const imagine = vi.spyOn(generative, 'imagine').mockResolvedValue(null);
  const clear = vi.spyOn(generative, 'clearObjects');
  const recognizer = new xb.SpeechRecognizer(new xb.SoundSynthesizer());
  const start = vi.spyOn(recognizer, 'start').mockImplementation(() => {});
  const stop = vi.spyOn(recognizer, 'stop').mockImplementation(() => {});
  const add = vi.spyOn(recognizer, 'addEventListener');
  const remove = vi.spyOn(recognizer, 'removeEventListener');
  xb.core.sound.speechRecognizer = recognizer;
  const demo = new GenerativeObjectDemo(generative);
  demo.init();
  const buttons = Array.from(document.querySelectorAll('button'));
  const card = demo.children.find((child) => child instanceof xb.UICard)!;
  return {
    generative,
    imagine,
    clear,
    recognizer,
    start,
    stop,
    add,
    remove,
    demo,
    buttons,
    card,
  };
}

beforeEach(() => {
  document.body.innerHTML = '<div id="status"></div>';
  xb.core.scene.clear();
  vi.spyOn(console, 'log').mockImplementation(() => {});
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('GenerativeObjectDemo lifecycle', () => {
  it('disconnects speech, controls, lights and generated work on disposal', () => {
    const s = setup();
    s.buttons[1].click();
    expect(s.start).toHaveBeenCalledOnce();
    s.demo.dispose();

    expect(s.stop).toHaveBeenCalledOnce();
    expect(s.remove.mock.calls.map(([type]) => type).sort()).toEqual([
      'end',
      'error',
      'result',
    ]);
    expect(document.querySelectorAll('button')).toHaveLength(0);
    expect(xb.core.scene.children).toHaveLength(0);
    expect(s.clear).toHaveBeenCalledOnce();
  });

  it('ignores retained DOM, spatial and keyboard callbacks after removal', async () => {
    const s = setup();
    const spatial: xb.UIButton[] = [];
    s.card.traverse((child) => {
      if (child instanceof xb.UIButton) spatial.push(child);
    });
    const previousOptions = {...s.generative.options};
    s.demo.dispose();
    const status = document.getElementById('status')!.textContent;
    const calls = s.clear.mock.calls.length;
    for (const button of s.buttons) button.click();
    for (const button of spatial) button.onClick?.();
    s.demo.onKeyDown(new KeyboardEvent('keydown', {code: 'KeyG'}));
    s.demo.onKeyDown(new KeyboardEvent('keydown', {code: 'KeyR'}));
    await Promise.resolve();

    expect(s.imagine).not.toHaveBeenCalled();
    expect(s.start).not.toHaveBeenCalled();
    expect(s.clear).toHaveBeenCalledTimes(calls);
    expect(s.generative.options).toEqual(previousOptions);
    expect(document.getElementById('status')!.textContent).toBe(status);
  });

  it('does not overwrite Clear status when an older request completes', async () => {
    const s = setup();
    let resolve!: (object: null) => void;
    s.imagine.mockReturnValue(
      new Promise((done) => {
        resolve = done;
      })
    );
    s.buttons[0].click();
    s.buttons[3].click();
    const status = document.getElementById('status')!.textContent;
    resolve(null);
    await Promise.resolve();
    await Promise.resolve();

    expect(document.getElementById('status')!.textContent).toBe(status);
  });

  it('ignores the previous instance completion after a replacement starts', async () => {
    const first = setup();
    let resolve!: (object: null) => void;
    first.imagine.mockReturnValue(
      new Promise((done) => {
        resolve = done;
      })
    );
    first.buttons[0].click();
    first.demo.dispose();
    const second = setup();
    const status = document.getElementById('status')!.textContent;
    resolve(null);
    await Promise.resolve();
    await Promise.resolve();
    expect(document.getElementById('status')!.textContent).toBe(status);
    expect(document.querySelectorAll('button')).toHaveLength(4);
    second.demo.dispose();
  });

  it('releases child UI through the normal lifecycle on removal and recreation', async () => {
    const s = setup();
    const manager = new xb.ScriptsManager(async () => {});
    const disposed: xb.Script[] = [];
    manager.afterDispose = (script) => {
      disposed.push(script);
    };
    xb.core.scene.add(s.demo);
    await manager.syncScriptsWithScene(xb.core.scene);
    s.demo.removeFromParent();
    await manager.syncScriptsWithScene(xb.core.scene);

    expect(disposed).toContain(s.card);
    expect(document.querySelectorAll('button')).toHaveLength(0);
    expect(xb.core.scene.children).toHaveLength(0);
    const replacement = setup();
    xb.core.scene.add(replacement.demo);
    await manager.syncScriptsWithScene(xb.core.scene);
    replacement.demo.removeFromParent();
    await manager.syncScriptsWithScene(xb.core.scene);
    expect(document.querySelectorAll('button')).toHaveLength(0);
    expect(xb.core.scene.children).toHaveLength(0);
    await manager.dispose();
  });

  it('attempts later releases even when stopping speech throws', () => {
    const s = setup();
    s.buttons[1].click();
    const failure = new Error('stop failed');
    s.stop.mockImplementation(() => {
      throw failure;
    });
    vi.spyOn(console, 'error').mockImplementation(() => {});

    expect(() => s.demo.dispose()).toThrow(failure);
    expect(s.remove).toHaveBeenCalledTimes(3);
    expect(document.querySelectorAll('button')).toHaveLength(0);
    expect(xb.core.scene.children).toHaveLength(0);
    expect(s.clear).toHaveBeenCalledOnce();
    expect(() => s.demo.dispose()).not.toThrow();
  });

  it('keeps controls usable with current semantic UI components', () => {
    const s = setup();
    expect(s.card).toBeInstanceOf(xb.UICard);
    expect(
      s.card.children.some((child) => child instanceof xb.FollowHead)
    ).toBe(true);
    expect(
      s.card.children.some((child) => child instanceof xb.FaceCamera)
    ).toBe(true);
    s.buttons[0].click();
    expect(s.imagine).toHaveBeenCalledWith('a small friendly red dragon');
    s.demo.dispose();
  });

  it('waits for key resolution and passes the result through Gemini options', async () => {
    window.localStorage.clear();
    vi.mocked(xb.init).mockClear();
    vi.mocked(xb.add).mockClear();
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(new Response(null, {status: 404}))
    );
    document.body.innerHTML = `
      <div id="keyOverlay" style="display:none">
        <input id="keyInput"><button id="keySave">start</button>
      </div>`;
    const pending = start();
    await vi.waitFor(() =>
      expect(document.getElementById('keyOverlay')!.style.display).toBe('flex')
    );
    expect(xb.init).not.toHaveBeenCalled();
    expect(xb.add).not.toHaveBeenCalled();
    document.querySelector('input')!.value = 'startup-fixture';
    document.querySelector('button')!.click();
    await pending;
    expect(xb.add).toHaveBeenCalledTimes(2);
    expect(xb.init).toHaveBeenCalledOnce();
    const options = vi.mocked(xb.init).mock.calls[0][0]!;
    expect(options.ai.gemini.apiKey).toBe('startup-fixture');
    expect(window.location.search).not.toContain('key=');
    // Placement raycasts the downsampled depth mesh, so the hidden
    // full-resolution mesh does not need per-frame updates.
    expect(options.depth.depthMesh.enabled).toBe(true);
    expect(options.depth.depthMesh.useDownsampledGeometry).toBe(true);
    expect(options.depth.depthMesh.updateFullResolutionGeometry).toBe(false);
  });
});
