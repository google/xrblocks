import {Blob as NodeBlob} from 'node:buffer';
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import * as xb from 'xrblocks';

import {GenerativeObjects} from './GenerativeObjects.js';
import {GenerativeObjectDemo, start} from './main.js';

vi.mock('../../../src/singletons', async () => {
  const {Scene} = await import('three');
  return {
    core: {scene: new Scene(), ai: undefined},
    add: vi.fn(),
    init: vi.fn().mockResolvedValue(undefined),
  };
});

class TestRecorder {
  static isTypeSupported = () => true;
  state = 'inactive';
  ondataavailable: ((event: {data: NodeBlob}) => void) | null = null;
  onstop: (() => void) | null = null;
  onerror: (() => void) | null = null;
  start() {
    this.state = 'recording';
    this.ondataavailable?.({data: new NodeBlob([new Uint8Array([1, 2, 3])])});
  }
  stop() {
    this.state = 'inactive';
    const onstop = this.onstop;
    queueMicrotask(() => onstop?.());
  }
}

/** Stubs the microphone, MediaRecorder and a configured Gemini client. */
function stubVoice() {
  const track = Object.assign(new EventTarget(), {stop: vi.fn()});
  const stream = {getTracks: () => [track], getAudioTracks: () => [track]};
  const getUserMedia = vi.fn().mockResolvedValue(stream);
  Object.defineProperty(navigator, 'mediaDevices', {
    configurable: true,
    value: {getUserMedia},
  });
  vi.stubGlobal('MediaRecorder', TestRecorder);
  vi.stubGlobal('Blob', NodeBlob);
  const gemini = new xb.Gemini(new xb.GeminiOptions());
  const generateContent = vi
    .fn()
    .mockResolvedValue({text: '{"transcript":"a red chair"}'});
  gemini.ai = {models: {generateContent}} as unknown as xb.Gemini['ai'];
  const ai = new xb.AI();
  ai.options = new xb.AIOptions();
  ai.model = gemini;
  vi.spyOn(ai, 'isAvailable').mockReturnValue(true);
  xb.core.ai = ai;
  return {track, getUserMedia, generateContent};
}

const status = () => document.getElementById('status')!.textContent;

function setup() {
  const generative = new GenerativeObjects();
  vi.spyOn(generative, 'isSupported', 'get').mockReturnValue(true);
  const imagine = vi.spyOn(generative, 'imagine').mockResolvedValue(null);
  const clear = vi.spyOn(generative, 'clearObjects');
  const demo = new GenerativeObjectDemo(generative);
  demo.init();
  const buttons = Array.from(document.querySelectorAll('button'));
  const card = demo.children.find((child) => child instanceof xb.UICard)!;
  return {generative, imagine, clear, demo, buttons, card};
}

beforeEach(() => {
  document.body.innerHTML = '<div id="status"></div>';
  xb.core.scene.clear();
  vi.spyOn(console, 'log').mockImplementation(() => {});
});

afterEach(() => {
  delete (navigator as {mediaDevices?: unknown}).mediaDevices;
  xb.core.ai = undefined as unknown as xb.AI;
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('GenerativeObjectDemo lifecycle', () => {
  it('releases the microphone, controls, lights and generated work on disposal', async () => {
    const voice = stubVoice();
    const s = setup();
    s.buttons[1].click();
    await vi.waitFor(() => expect(status()).toContain('listening'));
    s.demo.dispose();

    expect(voice.track.stop).toHaveBeenCalledOnce();
    expect(document.querySelectorAll('button')).toHaveLength(0);
    expect(xb.core.scene.children).toHaveLength(0);
    expect(s.clear).toHaveBeenCalledOnce();
    await Promise.resolve();
    expect(voice.generateContent).not.toHaveBeenCalled();
  });

  it('records on Speak and summons what Gemini transcribes on the second tap', async () => {
    const voice = stubVoice();
    const s = setup();
    const speak = s.buttons[1];
    speak.click();
    await vi.waitFor(() =>
      expect(status()).toBe("listening... tap speak again when you're done.")
    );
    expect(speak.textContent).toBe('🔴 Tap to send');
    expect(voice.generateContent).not.toHaveBeenCalled();

    speak.click();
    expect(voice.track.stop).toHaveBeenCalledOnce();
    await vi.waitFor(() =>
      expect(s.imagine).toHaveBeenCalledWith('a red chair')
    );
    expect(voice.generateContent).toHaveBeenCalledOnce();
    expect(speak.textContent).toBe('🎙️ Speak');
    s.demo.dispose();
  });

  it('explains a blocked microphone instead of listening forever', async () => {
    const voice = stubVoice();
    voice.getUserMedia.mockRejectedValue(
      Object.assign(new Error('native'), {name: 'NotAllowedError'})
    );
    const s = setup();
    s.buttons[1].click();
    await vi.waitFor(() => expect(status()).toContain('microphone blocked'));
    expect(s.buttons[1].textContent).toBe('🎙️ Speak');
    expect(s.imagine).not.toHaveBeenCalled();
    s.demo.dispose();
  });

  it('asks for Gemini before using the microphone', async () => {
    const s = setup();
    s.buttons[1].click();
    await vi.waitFor(() => expect(status()).toContain('voice needs Gemini'));
    expect(s.buttons[1].textContent).toBe('🎙️ Speak');
    s.demo.dispose();
  });

  it('says so instead of dropping a transcript while another summon runs', async () => {
    stubVoice();
    const s = setup();
    s.imagine.mockReturnValue(new Promise(() => {}));
    s.buttons[0].click();
    s.buttons[1].click();
    await vi.waitFor(() => expect(status()).toContain('listening'));
    s.buttons[1].click();
    await vi.waitFor(() =>
      expect(status()).toBe(
        'heard "a red chair", but a summon is still running.'
      )
    );
    expect(s.imagine).toHaveBeenCalledOnce();
    s.demo.dispose();
  });

  it('stops an active recording on Clear so it is never sent', async () => {
    const voice = stubVoice();
    const s = setup();
    s.buttons[1].click();
    await vi.waitFor(() => expect(status()).toContain('listening'));
    s.buttons[3].click();

    expect(voice.track.stop).toHaveBeenCalledOnce();
    expect(s.buttons[1].textContent).toBe('🎙️ Speak');
    expect(status()).toBe('cleared. summon something new.');
    // The next tap starts a fresh recording instead of sending the old one.
    s.buttons[1].click();
    await vi.waitFor(() => expect(voice.getUserMedia).toHaveBeenCalledTimes(2));
    await new Promise((done) => setTimeout(done, 0));
    expect(voice.generateContent).not.toHaveBeenCalled();
    expect(s.imagine).not.toHaveBeenCalled();
    s.demo.dispose();
  });

  it('discards a pending transcription on Clear', async () => {
    const voice = stubVoice();
    let resolve!: (response: {text: string}) => void;
    voice.generateContent.mockReturnValue(
      new Promise((done) => {
        resolve = done;
      })
    );
    const s = setup();
    s.buttons[1].click();
    await vi.waitFor(() => expect(status()).toContain('listening'));
    s.buttons[1].click();
    await vi.waitFor(() => expect(voice.generateContent).toHaveBeenCalled());
    s.buttons[3].click();
    resolve({text: '{"transcript":"a late chair"}'});
    await new Promise((done) => setTimeout(done, 0));

    expect(s.imagine).not.toHaveBeenCalled();
    expect(status()).toBe('cleared. summon something new.');
    expect(s.buttons[1].textContent).toBe('🎙️ Speak');
    s.demo.dispose();
  });

  it('ignores retained DOM, spatial and keyboard callbacks after removal', async () => {
    const voice = stubVoice();
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
    expect(voice.getUserMedia).not.toHaveBeenCalled();
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

  it('attempts later releases even when releasing the microphone throws', async () => {
    const voice = stubVoice();
    const s = setup();
    s.buttons[1].click();
    await vi.waitFor(() => expect(status()).toContain('listening'));
    const failure = new Error('stop failed');
    voice.track.stop.mockImplementation(() => {
      throw failure;
    });
    vi.spyOn(console, 'error').mockImplementation(() => {});

    expect(() => s.demo.dispose()).toThrow(failure);
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
    expect(options.sound.speechRecognizer.enabled).toBe(false);
    // Reticles point at the panel; depth grounds objects and occludes them.
    expect(options.reticles.enabled).toBe(true);
    expect(options.depth.enabled).toBe(true);
    expect(options.depth.depthTexture.enabled).toBe(true);
    expect(options.depth.occlusion.enabled).toBe(true);
    // Placement raycasts the downsampled depth mesh, so the hidden
    // full-resolution mesh does not need per-frame updates.
    expect(options.depth.depthMesh.enabled).toBe(true);
    expect(options.depth.depthMesh.useDownsampledGeometry).toBe(true);
    expect(options.depth.depthMesh.updateFullResolutionGeometry).toBe(false);
  });
});
