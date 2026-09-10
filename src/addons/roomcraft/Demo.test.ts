import * as THREE from 'three';
import {readFileSync} from 'node:fs';
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';

import {Roomcraft} from './Roomcraft';
import {AI} from '../../ai/AI';
import {World} from '../../world/World';
import {AIOptions} from '../../ai/AIOptions';
import {Gemini} from '../../ai/Gemini';
import type {SceneLayout} from './SceneTypes';

// @ts-expect-error The executable browser demo is a JavaScript consumer.
import {RoomcraftConsole} from '../../../demos/roomcraft/main.js';
// @ts-expect-error The handcrafted example layouts are JavaScript data.
import {
  STARTER_SCENES,
  MINIATURE_CITY,
} from '../../../demos/roomcraft/scenes.js';

const {mockCore, mockVoiceFormat} = vi.hoisted(() => ({
  mockVoiceFormat: vi.fn(),
  mockCore: {
    ai: {
      options: undefined,
      isAvailable: vi.fn(),
      initializeModel: vi.fn(),
    },
    sound: {
      speechRecognizer: undefined,
      soundSynthesizer: {playTone: vi.fn(), audioContext: undefined},
      categoryVolumes: {getEffectiveVolume: vi.fn()},
    },
  },
}));

vi.mock('../../../demos/roomcraft/GeminiVoice.js', () => {
  class VoiceInput {
    state = 'idle';
    constructor(
      readonly callbacks: {
        onStateChange: (state: string) => void;
        onTranscript: (
          transcript: string,
          options: {requiresReview: boolean}
        ) => void;
        onError: (error: Error) => void;
      }
    ) {}
    setState(state: string) {
      this.state = state;
      this.callbacks.onStateChange(state);
    }
    start = vi.fn(async () => this.setState('recording'));
    finish = vi.fn(() => this.setState('transcribing'));
    cancel = vi.fn(() => {
      if (this.state === 'idle') return false;
      this.setState('idle');
      return true;
    });
    dispose = vi.fn(() => this.cancel());
    complete(transcript: string, options = {requiresReview: false}) {
      this.setState('idle');
      this.callbacks.onTranscript(transcript, options);
    }
    fail(error: Error) {
      this.setState('idle');
      this.callbacks.onError(error);
    }
  }
  return {
    GeminiVoiceInput: VoiceInput,
    VOICE_MAX_DURATION_MS: 30_000,
    getVoiceFormat: mockVoiceFormat,
  };
});

vi.mock('xrblocks', async () => ({
  ...(await import('../../core/Script')),
  ...(await import('../../ai/AI')),
  ...(await import('../../ai/Gemini')),
  ...(await import('../../world/World')),
  ...(await import('../../sound/SoundSynthesizer')),
  ...(await import('../../utils/ThreeDisposal')),
  ...(await import('../../utils/ObjectPlacement')),
  ...(await import('../../utils/ModelLoader')),
  ...(await import('../../ui/components/UICard')),
  ...(await import('../../ui/components/UIButton')),
  ...(await import('../../ui/components/UIText')),
  ...(await import('../../ui/components/UIPanel')),
  core: mockCore,
  user: {height: 1.5},
  getUrlParameter: () => null,
}));

interface SpeechEvents extends THREE.Object3DEventMap {
  result: {isFinal: boolean; transcript: string};
  error: {error: string};
  end: object;
}

class TestSpeech extends THREE.EventDispatcher<SpeechEvents> {
  recognition: object | undefined = {};
  start = vi.fn();
  stop = vi.fn();
}

const html = readFileSync('demos/roomcraft/index.html', 'utf8');

let room: Roomcraft;
let consoleScript: InstanceType<typeof RoomcraftConsole>;
let speech: TestSpeech;
let options: AIOptions;
let camera: THREE.PerspectiveCamera;
let renderer: {
  xr: {isPresenting: boolean; getReferenceSpace: () => object | null};
};

function element(id: string) {
  const node = document.getElementById(id);
  if (!node) throw new Error(`Missing demo element "${id}".`);
  return node;
}

function input() {
  const node = element('prompt');
  if (!(node instanceof HTMLTextAreaElement))
    throw new Error('Expected a multiline prompt.');
  return node;
}

function button(id: string) {
  const node = element(id);
  if (!(node instanceof HTMLButtonElement))
    throw new Error(`Expected "${id}" to be a button.`);
  return node;
}

const robotStarter = STARTER_SCENES.find(
  (starter: {id: string}) => starter.id === 'robot-example'
);

/** A minimal compound design, standing in for one live generation result. */
function littleRobot(id: string) {
  return {
    id,
    name: 'Little robot',
    position: [0, 0, -0.5],
    rotation: 0,
    scale: [1, 1, 1],
    color: '#ffffff',
    parts: [
      {
        id: 'body',
        name: 'Body',
        shape: 'box',
        parent: null,
        position: [0, 0.3, 0],
        rotation: [0, 0, 0],
        size: [0.3, 0.4, 0.2],
        color: '#8fa3b0',
      },
      {
        id: 'head',
        name: 'Head',
        shape: 'sphere',
        parent: 'body',
        position: [0, 0.32, 0],
        rotation: [0, 0, 0],
        size: [0.2, 0.2, 0.2],
        color: '#c9c2b6',
      },
    ],
  };
}

function countMeshes(object: THREE.Object3D) {
  let meshes = 0;
  object.traverse((child) => {
    if (child instanceof THREE.Mesh) meshes++;
  });
  return meshes;
}

function expectFramedBox(bounds: THREE.Box3) {
  camera.updateWorldMatrix(true, false);
  const center = bounds.getCenter(new THREE.Vector3()).project(camera);
  expect(center.x).toBeCloseTo(0, 8);
  expect(center.y).toBeCloseTo(0, 8);
  for (const x of [bounds.min.x, bounds.max.x]) {
    for (const y of [bounds.min.y, bounds.max.y]) {
      for (const z of [bounds.min.z, bounds.max.z]) {
        const projected = new THREE.Vector3(x, y, z).project(camera);
        expect(Math.abs(projected.x)).toBeLessThan(1);
        expect(Math.abs(projected.y)).toBeLessThan(1);
        expect(projected.z).toBeGreaterThan(-1);
        expect(projected.z).toBeLessThan(1);
      }
    }
  }
}

function expectFramed(object: THREE.Object3D) {
  object.updateWorldMatrix(true, false);
  expectFramedBox(new THREE.Box3().setFromObject(object));
}

beforeEach(async () => {
  document.body.innerHTML = html.match(/<body>([\s\S]*)<\/body>/)![1];
  const media = Object.assign(new EventTarget(), {matches: false});
  vi.stubGlobal('matchMedia', () => media);
  options = new AIOptions();
  mockVoiceFormat.mockReturnValue({
    record: 'audio/webm;codecs=opus',
    upload: 'audio/webm',
  });
  speech = new TestSpeech();
  camera = new THREE.PerspectiveCamera(50, 16 / 9, 0.01, 100);
  camera.position.set(0, 1.5, 2);
  camera.lookAt(0, 0.5, -1);
  renderer = {
    xr: {
      isPresenting: false,
      getReferenceSpace: vi.fn<() => object | null>(() => ({})),
    },
  };
  Object.assign(mockCore, {camera, renderer});
  Object.assign(mockCore.ai, {options, model: new Gemini(options.gemini)});
  Object.assign(mockCore.sound, {speechRecognizer: speech});
  Object.assign(mockCore.sound.soundSynthesizer, {audioContext: undefined});
  mockCore.sound.soundSynthesizer.playTone.mockReset();
  mockCore.sound.categoryVolumes.getEffectiveVolume.mockReturnValue(0.035);
  mockCore.ai.isAvailable.mockReturnValue(true);
  mockCore.ai.initializeModel.mockResolvedValue(undefined);
  room = new Roomcraft({repairInvalidPlans: true});
  consoleScript = new RoomcraftConsole(room);
  consoleScript.init();
  await consoleScript.start();
});

afterEach(() => {
  consoleScript.dispose();
  room.dispose();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe('Roomcraft demo integration', () => {
  it.each([false, true])(
    'shows one correction on both surfaces without replacing the current world (fails=%s)',
    async (fails) => {
      vi.spyOn(console, 'error').mockImplementation(() => {});
      options.gemini.apiKey = 'local-test-fixture';
      const correction = Promise.withResolvers<{text: string}>();
      const ai = new AI();
      const query = vi
        .spyOn(ai, 'query')
        .mockResolvedValueOnce({text: '{"title":"Market","edits":['})
        .mockReturnValueOnce(correction.promise);
      room.init({ai, world: new World(), camera});
      const before = room.layout;
      consoleScript.setPrompt('Create a market.');
      const pending = consoleScript.generate();
      await vi.waitFor(() => expect(query).toHaveBeenCalledTimes(2));
      expect(button('generate').textContent).toBe('Correcting...');
      expect(button('generate').disabled).toBe(true);
      expect(consoleScript.xrGenerate.label).toBe('Correcting...');
      expect(consoleScript.xrStatusText.text).toContain(
        'trying one correction'
      );
      expect(room.layout).toEqual(before);
      correction.resolve({
        text: fails ? '{"title":' : '{"title":"Market","edits":[]}',
      });
      await pending;
      expect(button('generate').textContent).toBe('Generate');
      expect(consoleScript.isBusy()).toBe(false);
      if (fails) {
        expect(input().value).toBe('Create a market.');
        expect(room.layout).toEqual(before);
        expect(consoleScript.xrStatusText.text).toContain(
          'corrected scene plan is still invalid'
        );
      } else {
        expect(room.layout.title).toBe('Market');
      }
    }
  );

  it('plays one quiet click for desktop and spatial buttons, including keyboard keys', () => {
    const play = mockCore.sound.soundSynthesizer.playTone;
    expect(play).not.toHaveBeenCalled();
    button('toggleConsole').click();
    expect(play).toHaveBeenCalledTimes(1);
    expect(play).toHaveBeenLastCalledWith(1500, 0.02, 0.035, 'triangle');
    consoleScript.xrType.onClick();
    expect(play).toHaveBeenCalledTimes(2);
    consoleScript.xrKeyboard.getObjectByName('KeyboardKey:a').onClick();
    expect(play).toHaveBeenCalledTimes(3);
    expect(input().value).toBe('a');
  });

  it('respects the SDK UI mute and does not sound for disabled buttons or disposed controls', () => {
    const play = mockCore.sound.soundSynthesizer.playTone;
    mockCore.sound.categoryVolumes.getEffectiveVolume.mockReturnValue(0);
    button('toggleConsole').click();
    expect(play).not.toHaveBeenCalled();
    mockCore.sound.categoryVolumes.getEffectiveVolume.mockReturnValue(0.035);
    consoleScript.xrGenerate.disabled = true;
    consoleScript.xrGenerate.onClick();
    expect(play).not.toHaveBeenCalled();
    consoleScript.dispose();
    button('toggleConsole').click();
    consoleScript.playButtonSound();
    expect(play).not.toHaveBeenCalled();
  });

  it('resumes suspended audio during activation and leaves button actions working if it fails', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const resume = vi.fn().mockRejectedValue(new Error('Audio blocked.'));
    Object.assign(mockCore.sound.soundSynthesizer, {
      audioContext: {state: 'suspended', resume},
    });
    consoleScript.xrType.onClick();
    expect(resume).toHaveBeenCalledTimes(1);
    expect(consoleScript.keyboardOpen).toBe(true);
    await vi.waitFor(() => expect(warn).toHaveBeenCalledTimes(1));
    mockCore.sound.soundSynthesizer.playTone.mockImplementation(() => {
      throw new Error('Audio device unavailable.');
    });
    consoleScript.xrType.onClick();
    expect(consoleScript.keyboardOpen).toBe(false);
    expect(warn).toHaveBeenCalledTimes(2);
    expect(element('error').hidden).toBe(true);
  });

  it('shows pending operations immediately in both interfaces and clears them on completion', async () => {
    const pending = Promise.withResolvers<void>();
    const operation = consoleScript.run(
      'Loading a scene.',
      () => pending.promise
    );
    expect(element('console').getAttribute('aria-busy')).toBe('true');
    expect(button('generate').textContent).toBe('Working...');
    expect(consoleScript.xrGenerate.label).toBe('Working...');
    expect(consoleScript.xrGenerate.disabled).toBe(true);
    consoleScript.update(0);
    const firstOpacity = consoleScript.xrGenerate.style.opacity;
    consoleScript.update(400);
    expect(consoleScript.xrGenerate.style.opacity).not.toBe(firstOpacity);

    const duplicate = vi.fn();
    await consoleScript.run('Duplicate.', duplicate);
    expect(duplicate).not.toHaveBeenCalled();
    pending.resolve();
    await operation;
    expect(element('console').getAttribute('aria-busy')).toBe('false');
    expect(consoleScript.xrGenerate.label).toBe('Generate');
    expect(consoleScript.xrGenerate.style.opacity).toBe(1);
  });

  it('keeps an explicit busy label without pulsing when reduced motion is requested', async () => {
    const pending = Promise.withResolvers<void>();
    const operation = consoleScript.run(
      'Loading a scene.',
      () => pending.promise
    );
    consoleScript.reducedMotion = true;
    consoleScript.update(400);
    expect(consoleScript.xrGenerate.style.opacity).toBe(1);
    expect(consoleScript.xrGenerate.label).toBe('Working...');
    pending.resolve();
    await operation;
  });

  it('clears the loading indicator after a failed operation', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    await consoleScript.run('Loading a scene.', async () => {
      throw new Error('Scene loading failed.');
    });
    expect(element('console').getAttribute('aria-busy')).toBe('false');
    expect(consoleScript.xrGenerate.label).toBe('Generate');
    expect(consoleScript.isBusy()).toBe(false);
    expect(element('error').textContent).toContain('Scene loading failed.');
  });

  it('starts with real geometry, no provider call, and no microphone activation', () => {
    expect(room.layout.title).toBe('Reading nook');
    expect(room.layout.objects).toHaveLength(11);
    expect(room.children).toHaveLength(11);
    expect(mockCore.ai.initializeModel).not.toHaveBeenCalled();
    expect(speech.start).not.toHaveBeenCalled();
    expect(element('status').textContent).toContain('handcrafted');
    expect(consoleScript.card.visible).toBe(false);
  });

  it('keeps the default page free of virtual environment behavior', () => {
    expect(consoleScript.virtual).toBe(false);
    expect(room.layout.environment).toBeUndefined();
    expect(JSON.stringify(room.layout)).not.toContain('environment');
    expect(element('environmentSection').hidden).toBe(true);
    expect(element('tagline').textContent).toContain('Speak a scene');
    expect(button('newDesign').textContent!.trim()).toBe('New design');
    expect(button('place').disabled).toBe(false);
    expect(element('placement').textContent).not.toContain('own ground');
    // No virtual-only spatial widget is built for this page.
    expect(consoleScript.xrEnvironmentText).toBeUndefined();
    expect(consoleScript.xrMoonlight).toBeUndefined();
    expect(consoleScript.xrSunrise).toBeUndefined();
    expect(consoleScript.xrEnterWorld).toBeUndefined();
  });

  it('loads all documented starters through the real scene runtime', async () => {
    for (const starter of STARTER_SCENES) {
      await consoleScript.applyStarter(starter);
      expect(room.layout.title).toBe(starter.layout.title);
      expect(room.layout.objects).toHaveLength(starter.layout.objects.length);
      expect(new THREE.Box3().setFromObject(room).isEmpty()).toBe(false);
    }
    await room.applyLayout(MINIATURE_CITY);
    const dimensions = new THREE.Box3()
      .setFromObject(room)
      .getSize(new THREE.Vector3());
    expect(dimensions.x).toBeLessThanOrEqual(1.21);
    expect(dimensions.z).toBeLessThanOrEqual(0.88);
    expect(dimensions.y).toBeLessThan(0.8);
  });

  it('continues offline without an error when the key prompt was cancelled', async () => {
    await consoleScript.connectGemini();
    expect(mockCore.ai.initializeModel).toHaveBeenCalledOnce();
    expect(element('aiStatus').textContent).toContain('Not connected');
    expect(element('connect').textContent).toBe('Connect Gemini');
    expect(consoleScript.xrStatusText.text).toContain('without AI');
    expect(element('error').hidden).toBe(true);
    expect(consoleScript.isGeminiReady()).toBe(false);
  });

  it('does not treat missing credentials during automatic setup as a cancelled dialog', async () => {
    await consoleScript.connectGemini(false);
    expect(consoleScript.isGeminiReady()).toBe(false);
    expect(element('error').hidden).toBe(false);
    expect(consoleScript.xrStatusText.text).toContain('valid API key');
  });

  it('distinguishes local key configuration from verified authentication', async () => {
    mockCore.ai.initializeModel.mockImplementation(async () => {
      options.gemini.apiKey = 'local-test-fixture';
    });
    await consoleScript.connectGemini();
    expect(element('aiStatus').textContent).toContain(
      'Authentication and quota'
    );
    expect(consoleScript.isGeminiReady()).toBe(true);
    expect(element('connect').textContent).toBe('Reconnect Gemini');
  });

  it('blocks microphone activation without a configured provider and mirrors errors in XR', () => {
    consoleScript.toggleListening();
    expect(speech.start).not.toHaveBeenCalled();
    expect(element('error').textContent).toContain('Configure Gemini');
    expect(consoleScript.xrStatusText.text).toBe(element('error').textContent);
  });

  it('gives the prompt eight lines with its action buttons in a separate row', () => {
    const field = input();
    expect(field.rows).toBe(8);
    expect(field.maxLength).toBe(4000);
    expect(field.parentElement).toBe(field.closest('section'));
    expect(button('generate').parentElement).not.toBe(field.parentElement);
    expect(field.getAttribute('aria-describedby')).toBe('promptHelp');
    expect(element('promptHelp').textContent).toContain('Shift+Enter');
  });

  it('submits Enter once while leaving line breaks and IME confirmation to the textarea', () => {
    const generate = vi
      .spyOn(consoleScript, 'generate')
      .mockResolvedValue(undefined);
    const field = input();
    const composing = new KeyboardEvent('keydown', {
      key: 'Enter',
      isComposing: true,
      cancelable: true,
    });
    field.dispatchEvent(composing);
    expect(generate).not.toHaveBeenCalled();
    expect(composing.defaultPrevented).toBe(false);
    const newline = new KeyboardEvent('keydown', {
      key: 'Enter',
      shiftKey: true,
      cancelable: true,
    });
    field.dispatchEvent(newline);
    expect(generate).not.toHaveBeenCalled();
    expect(newline.defaultPrevented).toBe(false);
    const submit = new KeyboardEvent('keydown', {
      key: 'Enter',
      cancelable: true,
    });
    field.dispatchEvent(submit);
    expect(generate).toHaveBeenCalledOnce();
    expect(submit.defaultPrevented).toBe(true);
    const repeat = new KeyboardEvent('keydown', {
      key: 'Enter',
      repeat: true,
      cancelable: true,
    });
    field.dispatchEvent(repeat);
    expect(generate).toHaveBeenCalledOnce();
    expect(repeat.defaultPrevented).toBe(true);
  });

  it('keeps multiline drafts intact through the shared keyboard and request path', async () => {
    options.gemini.apiKey = 'local-test-fixture';
    const request = vi.spyOn(room, 'request').mockResolvedValue(room.layout);
    const draft = 'Create a moonlit garden.\nKeep the path clear.';
    input().value = draft;
    input().dispatchEvent(new Event('input'));
    expect(consoleScript.xrKeyboard.value).toBe(draft);

    input().dispatchEvent(
      new KeyboardEvent('keydown', {key: 'Enter', cancelable: true})
    );

    await vi.waitFor(() => expect(request).toHaveBeenCalledWith(draft));
    expect(request).toHaveBeenCalledOnce();
  });

  it('submits one completed Gemini transcript and never starts browser recognition', async () => {
    options.gemini.apiKey = 'local-test-fixture';
    const request = vi.spyOn(room, 'request').mockResolvedValue(room.layout);
    consoleScript.toggleListening();
    expect(consoleScript.voice.start).toHaveBeenCalledOnce();
    expect(speech.start).not.toHaveBeenCalled();
    expect(element('mic').getAttribute('aria-pressed')).toBe('true');
    expect(button('mic').textContent).toBe('Finish');
    expect(button('mic').disabled).toBe(false);
    expect(element('cancelVoice').hidden).toBe(false);
    expect(consoleScript.xrCancelVoice.style.display).toBe('flex');
    speech.dispatchEvent({
      type: 'result',
      isFinal: false,
      transcript: 'make this',
    });
    expect(request).not.toHaveBeenCalled();
    consoleScript.toggleListening();
    expect(consoleScript.voice.finish).toHaveBeenCalledOnce();
    expect(button('mic').disabled).toBe(true);
    expect(consoleScript.xrGenerate.label).toBe('Transcribing...');
    consoleScript.voice.complete('make this blue');
    consoleScript.voice.complete('duplicate transcript');
    await vi.waitFor(() =>
      expect(request).toHaveBeenCalledWith('make this blue')
    );
    expect(request).toHaveBeenCalledOnce();
    expect(speech.stop).not.toHaveBeenCalled();
    expect(element('mic').getAttribute('aria-pressed')).toBe('false');
    expect(element('cancelVoice').hidden).toBe(true);
    await vi.waitFor(() =>
      expect(element('status').textContent).toContain('No scene changes')
    );
  });

  it('uses Gemini voice without SpeechRecognition and keeps Keyboard available without recording support', async () => {
    speech.recognition = undefined;
    mockVoiceFormat.mockReturnValue(null);
    consoleScript.refresh();
    expect(element('mic').textContent).toBe('No mic');
    expect(button('mic').title).toContain('cannot record microphone audio');
    expect(consoleScript.xrProviderText.text).toContain(
      'Microphone recording is unavailable here; use Keyboard.'
    );
    expect(consoleScript.xrType.disabled).toBe(false);
    mockVoiceFormat.mockReturnValue({
      record: 'audio/webm',
      upload: 'audio/webm',
    });
    options.gemini.apiKey = 'local-test-fixture';
    consoleScript.refresh();
    expect(element('mic').textContent).toBe('Talk');
    expect(button('mic').disabled).toBe(false);
    expect(button('mic').title).toContain('sends it to Gemini');
    const request = vi.spyOn(room, 'request').mockResolvedValue(room.layout);
    consoleScript.toggleListening();
    consoleScript.toggleListening();
    consoleScript.voice.complete('Add a lamp');
    await vi.waitFor(() => expect(request).toHaveBeenCalledOnce());
    expect(speech.start).not.toHaveBeenCalled();
    expect(speech.stop).not.toHaveBeenCalled();
  });

  it('keeps time-limit transcripts for review until Generate is explicitly pressed', async () => {
    options.gemini.apiKey = 'local-test-fixture';
    const request = vi.spyOn(room, 'request').mockResolvedValue(room.layout);
    consoleScript.toggleListening();
    consoleScript.voice.setState('transcribing');
    consoleScript.voice.complete('Add a floor lamp.', {requiresReview: true});
    expect(input().value).toBe('Add a floor lamp.');
    expect(consoleScript.xrPromptText.text).toBe('Add a floor lamp.');
    expect(consoleScript.xrStatusText.text).toContain('press Generate');
    expect(request).not.toHaveBeenCalled();
    expect(button('generate').disabled).toBe(false);
    expect(consoleScript.voiceSubmissionPending).toBe(false);

    button('generate').click();
    await vi.waitFor(() =>
      expect(request).toHaveBeenCalledExactlyOnceWith('Add a floor lamp.')
    );
  });

  it('shows speech denial and provider failures on both desktop and XR surfaces', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    options.gemini.apiKey = 'local-test-fixture';
    consoleScript.toggleListening();
    consoleScript.voice.fail(new Error('Microphone permission was denied.'));
    expect(consoleScript.xrStatusText.text).toContain('permission was denied');
    expect(consoleScript.voice.state).toBe('idle');
    expect(element('mic').getAttribute('aria-pressed')).toBe('false');
    const before = room.layout;
    vi.spyOn(room, 'request').mockRejectedValue(new Error('Quota exceeded'));
    input().value = 'Add a lamp';
    await consoleScript.generate();
    expect(room.layout).toEqual(before);
    expect(element('error').textContent).toBe('Quota exceeded');
    expect(consoleScript.xrStatusText.text).toBe('Quota exceeded');
  });

  it('keeps Cancel available while microphone permission is pending', () => {
    options.gemini.apiKey = 'local-test-fixture';
    consoleScript.voice.start.mockImplementation(async () =>
      consoleScript.voice.setState('starting')
    );
    consoleScript.toggleListening();
    expect(button('mic').disabled).toBe(true);
    expect(element('cancelVoice').hidden).toBe(false);
    expect(consoleScript.xrCancelVoice.style.display).toBe('flex');
    button('cancelVoice').click();
    expect(consoleScript.voice.state).toBe('idle');
    expect(element('cancelVoice').hidden).toBe(true);
    expect(consoleScript.isBusy()).toBe(false);
  });

  it.each(['desktop', 'spatial', 'Escape'])(
    'offers a draft replacement warning before capture and keeps the draft through %s cancellation',
    (surface) => {
      options.gemini.apiKey = 'local-test-fixture';
      consoleScript.setPrompt('Add a floor lamp.');
      consoleScript.toggleListening();
      expect(consoleScript.voice.start).not.toHaveBeenCalled();
      expect(button('mic').textContent).toBe('Replace draft');
      expect(consoleScript.xrTalk.label).toBe('Replace draft');
      expect(button('cancelVoice').textContent).toBe('Keep draft');
      expect(consoleScript.xrCancelVoice.label).toBe('Keep draft');
      expect(consoleScript.xrCancelVoice.ariaLabel).toBe('Keep existing draft');
      expect(consoleScript.xrStatusText.text).toContain('Nothing is recording');
      if (surface === 'desktop') button('cancelVoice').click();
      else if (surface === 'spatial') consoleScript.xrCancelVoice.onClick();
      else
        document.dispatchEvent(new KeyboardEvent('keydown', {key: 'Escape'}));
      expect(consoleScript.voice.start).not.toHaveBeenCalled();
      expect(input().value).toBe('Add a floor lamp.');
      expect(button('mic').textContent).toBe('Talk');
      expect(element('cancelVoice').hidden).toBe(true);
      expect(consoleScript.xrCancelVoice.style.display).toBe('none');
    }
  );

  it.each([false, true])(
    'replaces an existing draft only after confirmation and successful transcription (review=%s)',
    async (requiresReview) => {
      options.gemini.apiKey = 'local-test-fixture';
      consoleScript.setPrompt('Add a floor lamp.');
      const request = vi.spyOn(room, 'request').mockResolvedValue(room.layout);
      consoleScript.toggleListening();
      consoleScript.xrTalk.onClick();
      expect(consoleScript.voice.start).toHaveBeenCalledTimes(1);
      expect(input().value).toBe('Add a floor lamp.');
      consoleScript.toggleListening();
      consoleScript.voice.complete('Make the selected chair brass.', {
        requiresReview,
      });
      if (requiresReview) {
        expect(input().value).toBe('Make the selected chair brass.');
        expect(request).not.toHaveBeenCalled();
      } else {
        await vi.waitFor(() =>
          expect(request).toHaveBeenCalledExactlyOnceWith(
            'Make the selected chair brass.'
          )
        );
      }
    }
  );

  it('requires a new replacement decision if the draft changes before recording', () => {
    options.gemini.apiKey = 'local-test-fixture';
    consoleScript.setPrompt('First draft');
    consoleScript.toggleListening();
    consoleScript.setPrompt('New draft');
    expect(button('mic').textContent).toBe('Talk');
    consoleScript.toggleListening();
    expect(button('mic').textContent).toBe('Replace draft');
    expect(consoleScript.voice.start).not.toHaveBeenCalled();
    expect(input().value).toBe('New draft');
  });

  it('dismisses a replacement decision on XR entry without starting the microphone', () => {
    options.gemini.apiKey = 'local-test-fixture';
    consoleScript.setPrompt('Keep this draft during XR entry.');
    consoleScript.toggleListening();
    consoleScript.onXRSessionStarted();
    expect(consoleScript.voice.start).not.toHaveBeenCalled();
    expect(input().value).toBe('Keep this draft during XR entry.');
    expect(consoleScript.xrTalk.label).toBe('Talk');
    expect(consoleScript.xrCancelVoice.style.display).toBe('none');
  });

  it.each(['cancel', 'error'])(
    'keeps the confirmed replacement draft if recording ends with %s',
    (outcome) => {
      vi.spyOn(console, 'error').mockImplementation(() => {});
      options.gemini.apiKey = 'local-test-fixture';
      consoleScript.setPrompt('Keep this typed instruction.');
      consoleScript.toggleListening();
      consoleScript.toggleListening();
      if (outcome === 'cancel') consoleScript.stopListening();
      else consoleScript.voice.fail(new Error('Microphone permission denied.'));
      expect(input().value).toBe('Keep this typed instruction.');
      expect(button('mic').textContent).toBe('Talk');
      expect(element('cancelVoice').hidden).toBe(true);
    }
  );

  it('dismisses the voice decision when the existing draft is generated instead', async () => {
    options.gemini.apiKey = 'local-test-fixture';
    consoleScript.setPrompt('Generate this typed instruction.');
    const request = vi.spyOn(room, 'request').mockResolvedValue(room.layout);
    consoleScript.toggleListening();
    await consoleScript.generate();
    expect(request).toHaveBeenCalledExactlyOnceWith(
      'Generate this typed instruction.'
    );
    expect(consoleScript.voice.start).not.toHaveBeenCalled();
    expect(button('mic').textContent).toBe('Talk');
    expect(element('cancelVoice').hidden).toBe(true);
  });

  it.each(['desktop', 'spatial'])(
    'cancels voice when the %s draft changes and ignores a late transcript',
    (surface) => {
      options.gemini.apiKey = 'local-test-fixture';
      consoleScript.setPrompt('Existing draft');
      const request = vi.spyOn(room, 'request');
      consoleScript.toggleListening();
      consoleScript.toggleListening();
      consoleScript.toggleListening();
      if (surface === 'desktop') {
        input().value = 'New typed draft';
        input().dispatchEvent(new Event('input'));
      } else {
        consoleScript.xrKeyboard.pressKey('a');
      }
      const draft = input().value;
      expect(consoleScript.voice.state).toBe('idle');
      consoleScript.voice.complete('Stale voice instruction');
      expect(input().value).toBe(draft);
      expect(request).not.toHaveBeenCalled();
    }
  );

  it('cancels transcription if its selected target or scene changes', async () => {
    options.gemini.apiKey = 'local-test-fixture';
    const request = vi.spyOn(room, 'request');
    consoleScript.toggleListening();
    consoleScript.toggleListening();
    room.select(room.layout.objects[0].id);
    expect(consoleScript.voice.state).toBe('idle');
    consoleScript.voice.complete('Stale selected edit');
    expect(request).not.toHaveBeenCalled();
    consoleScript.toggleListening();
    consoleScript.toggleListening();
    await room.applyLayout(STARTER_SCENES[1].layout);
    expect(consoleScript.voice.state).toBe('idle');
    consoleScript.voice.complete('Stale scene edit');
    expect(request).not.toHaveBeenCalled();
  });

  it.each(['page hidden', 'page left', 'XR ended', 'XR hidden', 'Escape'])(
    'cancels voice when %s without submitting a late result',
    (reason) => {
      options.gemini.apiKey = 'local-test-fixture';
      const session = Object.assign(new EventTarget(), {
        visibilityState: 'visible',
      });
      Object.assign(renderer.xr, {getSession: () => session});
      consoleScript.onXRSessionStarted();
      const request = vi.spyOn(room, 'request');
      consoleScript.toggleListening();
      consoleScript.toggleListening();
      if (reason === 'page hidden') {
        vi.spyOn(document, 'hidden', 'get').mockReturnValue(true);
        document.dispatchEvent(new Event('visibilitychange'));
      } else if (reason === 'page left') {
        window.dispatchEvent(new Event('pagehide'));
      } else if (reason === 'XR ended') {
        consoleScript.onXRSessionEnded();
      } else if (reason === 'XR hidden') {
        session.visibilityState = 'hidden';
        session.dispatchEvent(new Event('visibilitychange'));
      } else {
        document.dispatchEvent(new KeyboardEvent('keydown', {key: 'Escape'}));
      }
      expect(consoleScript.voice.state).toBe('idle');
      consoleScript.voice.complete('Late hidden-page instruction');
      expect(request).not.toHaveBeenCalled();
    }
  );

  it('does not cancel the microphone permission flow when XR is only visible-blurred', () => {
    options.gemini.apiKey = 'local-test-fixture';
    const session = Object.assign(new EventTarget(), {
      visibilityState: 'visible',
    });
    Object.assign(renderer.xr, {getSession: () => session});
    consoleScript.onXRSessionStarted();
    consoleScript.voice.start.mockImplementation(async () =>
      consoleScript.voice.setState('starting')
    );
    consoleScript.toggleListening();
    session.visibilityState = 'visible-blurred';
    session.dispatchEvent(new Event('visibilitychange'));
    expect(consoleScript.voice.state).toBe('starting');
  });

  it.each(['starting', 'recording', 'transcribing'])(
    'cancels %s voice before XR entry hides the desktop controls',
    (state) => {
      options.gemini.apiKey = 'local-test-fixture';
      consoleScript.setSpatialTab('examples');
      consoleScript.toggleListening();
      consoleScript.voice.setState(state);
      consoleScript.voice.cancel.mockClear();
      const request = vi.spyOn(room, 'request');

      consoleScript.onXRSessionStarted();

      expect(consoleScript.voice.cancel).toHaveBeenCalledTimes(1);
      expect(consoleScript.voice.state).toBe('idle');
      expect(consoleScript.voiceSubmissionPending).toBe(false);
      expect(consoleScript.card.visible).toBe(false);
      expect(element('console').classList.contains('rc-hidden')).toBe(true);
      expect(element('status').textContent).toContain('XR started');
      consoleScript.voice.complete('Late instruction after entering XR');
      expect(request).not.toHaveBeenCalled();
    }
  );

  it.each(['desktop controls', 'spatial controls', 'author tab'])(
    'cancels a recording when hiding its %s',
    (surface) => {
      options.gemini.apiKey = 'local-test-fixture';
      if (surface !== 'desktop controls') consoleScript.toggleSpatialStudio();
      consoleScript.toggleListening();
      if (surface === 'desktop controls') consoleScript.toggleConsole(false);
      else if (surface === 'spatial controls')
        consoleScript.toggleSpatialStudio();
      else consoleScript.setSpatialTab('examples');
      expect(consoleScript.voice.state).toBe('idle');
      expect(speech.start).not.toHaveBeenCalled();
    }
  );

  it('invalidates a placement fit after editing instead of claiming a stale fit', async () => {
    vi.spyOn(room, 'placeOnSurface').mockResolvedValue(true);
    await consoleScript.placeOnSurface();
    expect(element('placement').textContent).toContain('fits a detected');
    await room.applyPlan({
      title: room.layout.title,
      edits: [{op: 'update', id: 'nook-sofa', changes: {position: [0, 0, 1]}}],
    });
    expect(element('placement').textContent).toContain('Preview only');
    expect(consoleScript.placed).toBe(false);
  });

  it('keeps spatial buttons synchronized with scene operation state', async () => {
    let finish!: (value: unknown) => void;
    const planner = new Promise<unknown>((resolve) => {
      finish = resolve;
    });
    const pending = new Roomcraft({planner: () => planner});
    const other = new RoomcraftConsole(pending);
    consoleScript.dispose();
    other.init();
    const request = pending.request('Add a lamp');
    expect(other.xrTalk.disabled).toBe(true);
    expect(other.xrPlace.disabled).toBe(true);
    expect(other.xrUndo.disabled).toBe(true);
    expect(other.xrRedo.disabled).toBe(true);
    expect(button('frameScene').disabled).toBe(true);
    expect(button('focusSelected').disabled).toBe(true);
    expect(
      other.spatialStarters.every(
        (button: {disabled: boolean}) => button.disabled
      )
    ).toBe(true);
    finish({title: 'Empty scene', edits: []});
    await request;
    expect(
      other.spatialStarters.every(
        (button: {disabled: boolean}) => !button.disabled
      )
    ).toBe(true);
    other.dispose();
    pending.dispose();
  });

  describe('Roomcraft demo history and framing', () => {
    it('wires desktop redo and mirrors its availability in XR without an AI call', async () => {
      const request = vi.spyOn(room, 'request');
      expect(button('redo').disabled).toBe(true);
      expect(consoleScript.xrRedo.disabled).toBe(true);
      await consoleScript.newDesign();
      await consoleScript.undo();
      expect(button('redo').disabled).toBe(false);
      expect(consoleScript.xrRedo.disabled).toBe(false);
      button('redo').click();
      await vi.waitFor(() => expect(room.layout.title).toBe('Object workshop'));
      expect(room.layout.objects).toHaveLength(0);
      expect(button('redo').disabled).toBe(true);
      expect(consoleScript.xrRedo.disabled).toBe(true);
      expect(request).not.toHaveBeenCalled();
      expect(mockCore.ai.initializeModel).not.toHaveBeenCalled();
    });

    it('disables stale redo on both interfaces when a manipulation finishes', async () => {
      await room.applyPlan({
        title: room.layout.title,
        edits: [{op: 'update', id: 'nook-lamp', changes: {color: '#2244aa'}}],
      });
      await consoleScript.undo();
      expect(button('redo').disabled).toBe(false);
      room.getObject('nook-lamp')!.position.x += 0.5;
      room.dispatchEvent({type: 'change', layout: room.layout});
      expect(button('redo').disabled).toBe(true);
      expect(consoleScript.xrRedo.disabled).toBe(true);
    });

    it('frames a selection and the whole scene from their respective buttons', async () => {
      expect(button('focusSelected').disabled).toBe(true);
      expect(button('frameScene').disabled).toBe(false);
      room.select('nook-lamp');
      const direction = camera.quaternion.clone();
      button('focusSelected').click();
      await vi.waitFor(() =>
        expect(element('status').textContent).toContain('Framed the selected')
      );
      expectFramed(room.getObject('nook-lamp')!);
      const selectedView = camera.position.clone();
      button('frameScene').click();
      await vi.waitFor(() =>
        expect(element('status').textContent).toContain('Framed the scene')
      );
      expectFramed(room);
      expect(camera.position.equals(selectedView)).toBe(false);
      expect(camera.quaternion.equals(direction)).toBe(true);
    });

    it.each([
      {aspect: 0.5, zoom: 1},
      {aspect: 2.4, zoom: 1},
      {aspect: 1.6, zoom: 2.5},
    ])('fits the viewport with aspect $aspect and zoom $zoom', async (view) => {
      camera.aspect = view.aspect;
      camera.zoom = view.zoom;
      camera.updateProjectionMatrix();
      await consoleScript.frame();
      expectFramed(room);
    });

    it.each([true, false])(
      'handles transformed scene and camera parents (selection only: %s)',
      async (selectedOnly) => {
        const sceneParent = new THREE.Group();
        sceneParent.position.set(3, 0.8, -4);
        sceneParent.rotation.set(0.1, 0.6, -0.2);
        sceneParent.scale.set(1.2, 0.8, 1.5);
        sceneParent.add(room);
        room.position.set(0.5, 0.4, -1);
        const cameraParent = new THREE.Group();
        cameraParent.position.set(-2, 1, 3);
        cameraParent.rotation.set(0.2, -0.3, 0.1);
        cameraParent.scale.set(1.5, 0.75, 1.1);
        cameraParent.add(camera);
        room.select('nook-lamp');
        const direction = camera.quaternion.clone();
        await consoleScript.frame(selectedOnly);
        expectFramed(selectedOnly ? room.getObject('nook-lamp')! : room);
        expect(camera.quaternion.equals(direction)).toBe(true);
      }
    );

    it('leaves the scene, selected owner, placement fit, and redo branch intact', async () => {
      room.position.set(1, 0.3, -2);
      room.rotation.y = 0.6;
      await room.applyPlan({
        title: room.layout.title,
        edits: [{op: 'update', id: 'nook-lamp', changes: {color: '#2244aa'}}],
      });
      await consoleScript.undo();
      room.select('nook-lamp');
      consoleScript.placed = true;
      const before = room.layout;
      const owner = room.getObject('nook-lamp');
      const position = room.position.clone();
      const rotation = room.quaternion.clone();
      const history = [room.canUndo, room.canRedo];
      await consoleScript.frame(true);
      await consoleScript.frame();
      expect(room.layout).toEqual(before);
      expect(room.getObject('nook-lamp')).toBe(owner);
      expect(room.position.equals(position)).toBe(true);
      expect(room.quaternion.equals(rotation)).toBe(true);
      expect(room.selectedId).toBe('nook-lamp');
      expect([room.canUndo, room.canRedo]).toEqual(history);
      expect(room.canRedo).toBe(true);
      expect(consoleScript.placed).toBe(true);
    });

    it('keeps the target beyond the near plane', async () => {
      camera.near = 8;
      camera.updateProjectionMatrix();
      await consoleScript.frame();
      expectFramed(room);
    });

    it('reports an empty scene or missing selection without moving the camera', async () => {
      vi.spyOn(console, 'error').mockImplementation(() => {});
      const before = camera.position.clone();
      await consoleScript.frame(true);
      expect(element('error').textContent).toContain('Select an object');
      expect(camera.position.equals(before)).toBe(true);
      await consoleScript.newDesign();
      expect(button('frameScene').disabled).toBe(true);
      expect(button('focusSelected').disabled).toBe(true);
      await consoleScript.frame();
      expect(element('error').textContent).toContain('nothing to frame');
      expect(camera.position.equals(before)).toBe(true);
    });

    it('does not move the camera if the target cannot fit its clipping range', async () => {
      vi.spyOn(console, 'error').mockImplementation(() => {});
      const before = camera.position.clone();
      camera.far = 1;
      camera.updateProjectionMatrix();
      await consoleScript.frame();
      expect(element('error').textContent).toContain('clipping range');
      expect(camera.position.equals(before)).toBe(true);
    });

    it.each(['callback', 'renderer'])(
      'blocks camera framing during XR through the %s state',
      async (source) => {
        vi.spyOn(console, 'error').mockImplementation(() => {});
        room.select('nook-lamp');
        const before = camera.position.clone();
        if (source === 'callback') consoleScript.onXRSessionStarted();
        else renderer.xr.isPresenting = true;
        consoleScript.refresh();
        expect(button('frameScene').disabled).toBe(true);
        expect(button('focusSelected').disabled).toBe(true);
        await consoleScript.frame();
        await consoleScript.frame(true);
        expect(element('error').textContent).toContain('desktop only');
        expect(camera.position.equals(before)).toBe(true);
        if (source === 'callback') consoleScript.onXRSessionEnded();
        else renderer.xr.isPresenting = false;
        consoleScript.refresh();
        expect(button('frameScene').disabled).toBe(false);
        expect(button('focusSelected').disabled).toBe(false);
      }
    );

    it.each(['connecting', 'planning'])(
      'blocks framing while %s',
      async (phase) => {
        room.select('nook-lamp');
        const before = camera.position.clone();
        if (phase === 'connecting') consoleScript.connecting = true;
        else vi.spyOn(room, 'busy', 'get').mockReturnValue(true);
        consoleScript.refresh();
        expect(button('frameScene').disabled).toBe(true);
        expect(button('focusSelected').disabled).toBe(true);
        await consoleScript.frame();
        expect(element('error').textContent).toContain('still working');
        expect(camera.position.equals(before)).toBe(true);
      }
    );

    it.each([true, false])(
      'frames the full motion envelope rather than one pose (selection only: %s)',
      async (selectedOnly) => {
        await consoleScript.applyStarter(robotStarter);
        room.select('example-robot');
        const owner = room.getObject('example-robot')!;
        owner.updateWorldMatrix(true, false);
        const envelope = room.getWorldBounds(
          selectedOnly ? 'example-robot' : undefined
        );
        const pose = new THREE.Box3().setFromObject(owner);
        expect(envelope.clone().expandByScalar(1e-6).containsBox(pose)).toBe(
          true
        );
        expect(envelope.equals(pose)).toBe(false);
        await consoleScript.frame(selectedOnly);
        expect(element('error').hidden).toBe(true);
        expectFramedBox(
          room.getWorldBounds(selectedOnly ? 'example-robot' : undefined)
        );
      }
    );
  });

  it('builds the handcrafted example as one compound object under a single owner', async () => {
    await consoleScript.applyStarter(robotStarter);
    expect(room.layout.objects).toHaveLength(1);
    expect(room.children).toHaveLength(1);
    const [object] = room.layout.objects;
    expect(object.asset).toBeUndefined();
    expect(object.parts).toHaveLength(17);
    const owner = room.getObject('example-robot')!;
    expect(owner.xb?.manipulation).toBeDefined();
    expect(countMeshes(owner)).toBe(17);
    expect(owner.getObjectByName('antenna-tip')?.parent?.name).toBe('antenna');
    const bounds = new THREE.Box3().setFromObject(owner);
    expect(bounds.min.y).toBeCloseTo(0, 2);
    expect(bounds.max.y).toBeGreaterThan(0.8);
    expect(element('status').textContent).toContain('handcrafted');
  });

  it('describes the selected design and lists its parts as plain text', async () => {
    await consoleScript.applyStarter(robotStarter);
    room.select('example-robot');
    expect(element('design').textContent).toContain('17 parts');
    const parts = element('parts');
    expect((parts as HTMLElement).hidden).toBe(false);
    expect(parts.children).toHaveLength(17);
    expect(parts.children[0].textContent).toBe('Torso (box)');
    expect(parts.querySelector('script')).toBeNull();
    expect(consoleScript.xrSelectionText.text).toBe(
      'Selected: Handcrafted clockwork robot - 17 parts, 4 moving'
    );
    room.select(null);
    expect(element('design').textContent).toBe('Nothing selected.');
    expect((parts as HTMLElement).hidden).toBe(true);
    await consoleScript.applyStarter(STARTER_SCENES[0]);
    room.select('nook-sofa');
    expect(element('design').textContent).toContain('catalog object');
    expect((element('parts') as HTMLElement).hidden).toBe(true);
  });

  it('clears the scene for a new design and restores it with undo', async () => {
    await consoleScript.newDesign();
    expect(room.layout).toEqual({title: 'Object workshop', objects: []});
    expect(room.children).toHaveLength(0);
    expect(element('sceneSummary').textContent).toContain('empty');
    expect(element('status').textContent).toContain('Describe one object');
    expect(button('newDesign').disabled).toBe(true);
    expect(button('undo').disabled).toBe(false);
    await consoleScript.undo();
    expect(room.layout.title).toBe('Reading nook');
    expect(room.layout.objects).toHaveLength(11);
    expect(room.children).toHaveLength(11);
    expect(button('newDesign').disabled).toBe(false);
  });

  it('synchronizes desktop and spatial playback controls without scene edits', async () => {
    expect(button('motion').disabled).toBe(true);
    expect(consoleScript.xrMotion.disabled).toBe(true);
    await consoleScript.applyStarter(robotStarter);
    room.select('example-robot');
    await room.applyPlan({
      title: room.layout.title,
      edits: [{op: 'update', id: 'example-robot', changes: {color: '#2244aa'}}],
    });
    await room.undo();
    consoleScript.placed = true;
    const before = room.layout;
    const request = vi.spyOn(room, 'request');
    expect(button('motion').disabled).toBe(false);
    expect(consoleScript.xrMotion.disabled).toBe(false);
    expect(element('design').textContent).toContain('4 parts move');
    expect(element('parts').querySelectorAll('.rc-moving')).toHaveLength(4);
    button('motion').click();
    expect(room.motionPaused).toBe(true);
    expect(button('motion').getAttribute('aria-pressed')).toBe('true');
    expect(consoleScript.xrMotion.label).toBe('Resume');
    expect(element('motionNote').textContent).toContain('current pose');
    consoleScript.xrMotion.onClick();
    expect(room.motionPaused).toBe(false);
    expect(button('motion').textContent).toBe('Pause motion');
    expect(consoleScript.xrMotion.label).toBe('Pause');
    expect(room.layout).toEqual(before);
    expect(room.selectedId).toBe('example-robot');
    expect(room.canRedo).toBe(true);
    expect(consoleScript.placed).toBe(true);
    expect(request).not.toHaveBeenCalled();
    expect(speech.start).not.toHaveBeenCalled();
    await consoleScript.newDesign();
    expect(button('motion').disabled).toBe(true);
    expect(consoleScript.xrMotion.disabled).toBe(true);
  });

  it('keeps playback controls available during a pending generation', async () => {
    consoleScript.dispose();
    room.dispose();
    let finish!: (value: unknown) => void;
    const result = new Promise<unknown>((resolve) => {
      finish = resolve;
    });
    room = new Roomcraft({planner: () => result});
    consoleScript = new RoomcraftConsole(room);
    consoleScript.init();
    await consoleScript.applyStarter(robotStarter);
    options.gemini.apiKey = 'local-test-fixture';
    consoleScript.setPrompt('Make its arms blue');
    const pending = consoleScript.generate();
    expect(room.busy).toBe(true);
    expect(consoleScript.xrGenerate.disabled).toBe(true);
    expect(button('motion').disabled).toBe(false);
    expect(consoleScript.xrMotion.disabled).toBe(false);
    button('motion').click();
    expect(room.motionPaused).toBe(true);
    finish({title: room.layout.title, edits: []});
    await pending;
    expect(room.motionPaused).toBe(true);
    expect(consoleScript.xrMotion.label).toBe('Resume');
  });

  it('hides the part list when selection is cleared, including its flex styling', async () => {
    const style = document.createElement('style');
    style.textContent = readFileSync('demos/roomcraft/style.css', 'utf8');
    document.head.appendChild(style);
    try {
      await consoleScript.applyStarter(robotStarter);
      room.select('example-robot');
      expect(getComputedStyle(element('parts')).display).toBe('flex');
      room.select(null);
      expect(getComputedStyle(element('parts')).display).toBe('none');
    } finally {
      style.remove();
    }
  });

  it('selects a single newly created object so the next instruction has context', async () => {
    options.gemini.apiKey = 'local-test-fixture';
    await consoleScript.newDesign();
    vi.spyOn(room, 'request').mockImplementation(() =>
      room.applyPlan({
        title: 'Object workshop',
        edits: [{op: 'add', object: littleRobot('little-robot')}],
      })
    );
    input().value = 'create a little robot';
    await consoleScript.generate();
    expect(room.selectedId).toBe('little-robot');
    expect(element('status').textContent).toContain('2 parts');
    expect(element('design').textContent).toContain('compound design');
    expect(element('parts').children).toHaveLength(2);
    expect(countMeshes(room.getObject('little-robot')!)).toBe(2);
  });

  it('keeps the current selection when an edit is not one new object', async () => {
    options.gemini.apiKey = 'local-test-fixture';
    room.select('nook-lamp');
    const request = vi.spyOn(room, 'request').mockImplementation(() =>
      room.applyPlan({
        title: room.layout.title,
        edits: [
          {op: 'add', object: littleRobot('robot-one')},
          {
            op: 'add',
            object: {...littleRobot('robot-two'), position: [1, 0, 0]},
          },
        ],
      })
    );
    input().value = 'add two robots';
    await consoleScript.generate();
    expect(room.layout.objects).toHaveLength(13);
    expect(room.selectedId).toBe('nook-lamp');

    request.mockImplementation(() =>
      room.applyPlan({
        title: room.layout.title,
        edits: [
          {op: 'update', id: 'nook-sofa', changes: {color: '#3355aa'}},
          {op: 'remove', id: 'robot-two'},
        ],
      })
    );
    input().value = 'make the sofa blue and remove one robot';
    await consoleScript.generate();
    expect(room.selectedId).toBe('nook-lamp');
  });

  it('exports a refined design with its parts, hierarchy, and edited pose', async () => {
    await consoleScript.applyStarter(robotStarter);
    const owner = room.getObject('example-robot')!;
    owner.position.set(0.4, 0, -1.2);
    owner.scale.setScalar(1.5);
    await room.applyPlan({
      title: 'Robot example',
      edits: [
        {
          op: 'update',
          id: 'example-robot',
          changes: {},
          partEdits: [
            {op: 'update', id: 'arm-left', changes: {size: [0.07, 0.4, 0.07]}},
            {
              op: 'add',
              part: {
                id: 'backpack',
                name: 'Backpack',
                shape: 'box',
                parent: 'torso',
                position: [0, 0, -0.13],
                rotation: [0, 0, 0],
                size: [0.22, 0.24, 0.08],
                color: '#5f6672',
              },
            },
          ],
        },
      ],
    });
    expect(
      room.getObject('example-robot')!.getObjectByName('backpack')?.parent?.name
    ).toBe('torso');

    const blobs: Blob[] = [];
    vi.stubGlobal('URL', {
      createObjectURL: (blob: Blob) => {
        blobs.push(blob);
        return 'blob:roomcraft-test';
      },
      revokeObjectURL: () => {},
    });
    const click = vi
      .spyOn(HTMLAnchorElement.prototype, 'click')
      .mockImplementation(() => {});
    consoleScript.exportLayout();
    expect(click).toHaveBeenCalledOnce();
    const exported = JSON.parse(
      await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result));
        reader.onerror = () => reject(reader.error);
        reader.readAsText(blobs[0]);
      })
    ) as SceneLayout;
    const design = exported.objects[0];
    expect(design.position).toEqual([0.4, 0, -1.2]);
    expect(design.scale).toEqual([1.5, 1.5, 1.5]);
    expect(design.asset).toBeUndefined();
    expect(design.parts).toHaveLength(18);
    const parts = design.parts!;
    expect(parts.find((part) => part.id === 'arm-left')!.size).toEqual([
      0.07, 0.4, 0.07,
    ]);
    expect(parts.find((part) => part.id === 'backpack')!.parent).toBe('torso');
    expect(parts.find((part) => part.id === 'antenna-tip')!.parent).toBe(
      'antenna'
    );
    expect(JSON.stringify(exported)).not.toContain('local-test-fixture');
  });

  it('releases voice input, room and DOM listeners when the console is disposed', () => {
    options.gemini.apiKey = 'local-test-fixture';
    consoleScript.toggleListening();
    const request = vi.spyOn(room, 'request');
    consoleScript.dispose();
    consoleScript.voice.complete('Late voice result');
    speech.dispatchEvent({
      type: 'result',
      isFinal: true,
      transcript: 'Add a lamp',
    });
    element('generate').click();
    room.dispatchEvent({
      type: 'change',
      layout: {title: 'Ignored', objects: []} satisfies SceneLayout,
    });
    expect(request).not.toHaveBeenCalled();
    expect(consoleScript.voice.dispose).toHaveBeenCalledOnce();
    expect(speech.start).not.toHaveBeenCalled();
    expect(consoleScript.cleanups).toHaveLength(0);
  });

  describe('spatial authoring', () => {
    it('waits for a tracked headset frame before placing or showing the studio', () => {
      camera.position.set(0, 0, 0);
      camera.rotation.set(0, 0, 0);
      const before = room.layout;
      const frame = {getViewerPose: vi.fn().mockReturnValue(null)};
      consoleScript.onXRSessionStarted();
      consoleScript.toggleKeyboard();
      consoleScript.update();
      consoleScript.update(0, frame);
      expect(consoleScript.needsSpatialPlacement).toBe(true);
      expect(consoleScript.card.visible).toBe(false);
      expect(consoleScript.keyboardCard.visible).toBe(false);

      camera.position.set(0.4, 1.65, -0.2);
      frame.getViewerPose.mockReturnValue({});
      consoleScript.update(16, frame);
      expect(consoleScript.needsSpatialPlacement).toBe(false);
      expect(consoleScript.card.visible).toBe(true);
      expect(consoleScript.keyboardCard.visible).toBe(true);
      expect(consoleScript.card.position.y).toBeCloseTo(1.9);
      expect(room.layout).toEqual(before);
    });

    it('preserves a dragged studio until the next XR session', () => {
      const frame = {getViewerPose: () => ({})};
      consoleScript.onXRSessionStarted();
      consoleScript.update(0, frame);
      consoleScript.card.position.set(2, 1.4, -2);
      camera.position.set(0, 1.8, 1);
      camera.rotation.set(0, 0, 0);
      consoleScript.update(16, frame);
      expect(consoleScript.card.position.toArray()).toEqual([2, 1.4, -2]);

      consoleScript.onXRSessionEnded();
      consoleScript.onXRSessionStarted();
      expect(consoleScript.card.visible).toBe(false);
      consoleScript.update(32, frame);
      expect(consoleScript.card.position.y).toBeCloseTo(2.05);
      expect(consoleScript.card.visible).toBe(true);
    });

    it('cancels pending XR placement when the session ends before tracking starts', () => {
      const place = vi.spyOn(consoleScript, 'positionSpatialStudio');
      consoleScript.onXRSessionStarted();
      consoleScript.onXRSessionEnded();
      consoleScript.update(0, {getViewerPose: () => ({})});
      expect(place).not.toHaveBeenCalled();
      expect(consoleScript.card.visible).toBe(false);
      expect(consoleScript.needsSpatialPlacement).toBe(false);
    });

    it.each([
      {x: 0.55, z: 1, side: -1},
      {x: -0.55, z: 1, side: 1},
      {x: 0.55, z: 3, side: 1},
      {x: 0.55, z: -2, side: 1},
    ])(
      'recenters on the clearer desktop side for an object at $x, $z',
      async ({x, z, side}) => {
        camera.position.set(0, 1, 2);
        camera.rotation.set(0, 0, 0);
        camera.fov = 60;
        camera.aspect = 1.5;
        camera.updateProjectionMatrix();
        await room.applyLayout({
          title: 'Close-up',
          objects: [{...littleRobot('nearby'), position: [x, 0.7, z]}],
        });
        camera.updateWorldMatrix(true, false);
        const before = room.layout;
        const cameraPose = camera.matrix.clone();
        const cardScale = consoleScript.card.scale.clone();
        const keyboardScale = consoleScript.keyboardCard.scale.clone();
        consoleScript.positionSpatialStudio();
        const point = consoleScript.card
          .getWorldPosition(new THREE.Vector3())
          .project(camera);
        expect(point.x * side).toBeGreaterThan(0);
        expect(room.layout).toEqual(before);
        expect(camera.matrix.equals(cameraPose)).toBe(true);
        expect(consoleScript.card.scale.equals(cardScale)).toBe(true);
        expect(consoleScript.keyboardCard.scale.equals(keyboardScale)).toBe(
          true
        );
      }
    );

    it('keeps XR recentering centered rather than choosing a desktop side', async () => {
      renderer.xr.isPresenting = true;
      await consoleScript.applyStarter(robotStarter);
      consoleScript.positionSpatialStudio();
      const point = consoleScript.card
        .getWorldPosition(new THREE.Vector3())
        .project(camera);
      expect(point.x).toBeCloseTo(0, 8);
    });

    it.each([-Math.PI / 3, Math.PI / 3])(
      'keeps the XR studio upright and above the floor at head pitch %s',
      (pitch) => {
        renderer.xr.isPresenting = true;
        camera.position.set(0.4, 1.6, 0.2);
        camera.rotation.set(pitch, 0.7, 0.3, 'YXZ');
        const cameraRotation = camera.quaternion.clone();
        const before = room.layout;

        consoleScript.positionSpatialStudio();

        const position = consoleScript.card.getWorldPosition(
          new THREE.Vector3()
        );
        const rotation = consoleScript.card.getWorldQuaternion(
          new THREE.Quaternion()
        );
        expect(position.y).toBeCloseTo(1.85);
        expect(
          new THREE.Vector3(0, 1, 0)
            .applyQuaternion(rotation)
            .distanceTo(new THREE.Vector3(0, 1, 0))
        ).toBeLessThan(1e-8);
        expect(consoleScript.keyboardCard.position.y).toBeGreaterThan(0.5);
        expect(camera.quaternion.equals(cameraRotation)).toBe(true);
        expect(room.layout).toEqual(before);
      }
    );

    it('opens the spatial studio from the collapsed desktop header without moving the scene', () => {
      consoleScript.toggleConsole(false);
      const before = room.layout;
      const position = camera.position.clone();
      button('spatialStudio').click();
      expect(consoleScript.card.visible).toBe(true);
      expect(button('spatialStudio').getAttribute('aria-pressed')).toBe('true');
      expect(consoleScript.keyboardCard.visible).toBe(false);
      camera.updateWorldMatrix(true, false);
      const center = consoleScript.card
        .getWorldPosition(new THREE.Vector3())
        .project(camera);
      expect(Math.abs(center.x)).toBeLessThan(1);
      expect(Math.abs(center.y)).toBeLessThan(1);
      expect(camera.position.equals(position)).toBe(true);
      expect(room.layout).toEqual(before);
      consoleScript.toggleKeyboard();
      expect(consoleScript.keyboardCard.visible).toBe(true);
      button('spatialStudio').click();
      expect(consoleScript.card.visible).toBe(false);
      expect(consoleScript.keyboardCard.visible).toBe(false);
    });

    it('synchronizes DOM input and the real spatial keyboard within the request limit', () => {
      input().value = 'Create a robot';
      input().dispatchEvent(new Event('input'));
      expect(consoleScript.xrKeyboard.value).toBe('Create a robot');
      expect(consoleScript.xrPromptText.text).toContain('Create a robot');
      consoleScript.xrKeyboard.pressKey('x');
      expect(input().value).toBe('Create a robotx');
      consoleScript.xrKeyboard.pressKey('Backspace');
      expect(input().value).toBe('Create a robot');
      expect(consoleScript.xrGenerate.disabled).toBe(false);
      input().value = 'a'.repeat(4001);
      input().dispatchEvent(new Event('input'));
      consoleScript.xrKeyboard.pressKey('b');
      expect(input().value).toHaveLength(4000);
      expect(consoleScript.xrKeyboard.value).toHaveLength(4000);
      expect(element('error').textContent).toContain('4000 characters');
    });

    it.each([
      {fov: 90, aspect: 1.5, studioScale: 1, keyboardScale: 1},
      {fov: 50, aspect: 0.6, studioScale: 0.8, keyboardScale: 1.2},
    ])(
      'keeps both scaled cards in view at $fov degrees and aspect $aspect',
      (view) => {
        camera.fov = view.fov;
        camera.aspect = view.aspect;
        camera.updateProjectionMatrix();
        consoleScript.card.scale.setScalar(view.studioScale);
        consoleScript.keyboardCard.scale.setScalar(view.keyboardScale);
        consoleScript.toggleSpatialStudio();
        consoleScript.toggleKeyboard();
        for (const [card, width, height] of [
          [consoleScript.card, 1.05, 1.02],
          [consoleScript.keyboardCard, 1.05, 0.49],
        ] as const) {
          card.updateWorldMatrix(true, false);
          for (const x of [-width / 2, width / 2]) {
            for (const y of [-height / 2, height / 2]) {
              const point = new THREE.Vector3(x, y, 0)
                .applyMatrix4(card.matrixWorld)
                .project(camera);
              expect(Math.abs(point.x)).toBeLessThan(1);
              expect(Math.abs(point.y)).toBeLessThan(1);
            }
          }
        }
      }
    );

    it('submits a spatial keyboard instruction through the same generation path', async () => {
      options.gemini.apiKey = 'local-test-fixture';
      const request = vi.spyOn(room, 'request').mockResolvedValue(room.layout);
      consoleScript.xrKeyboard.setValue('Create a mushroom cottage');
      consoleScript.xrKeyboard.pressKey('Enter');
      await vi.waitFor(() =>
        expect(request).toHaveBeenCalledWith('Create a mushroom cottage')
      );
      await vi.waitFor(() => expect(input().value).toBe(''));
      expect(consoleScript.xrKeyboard.value).toBe('');
      expect(consoleScript.xrPromptText.text).toContain('Describe');
      expect(consoleScript.xrGenerate.disabled).toBe(true);
    });

    it('keeps a new draft entered while the previous request is running', async () => {
      consoleScript.dispose();
      room.dispose();
      let finish!: (value: unknown) => void;
      const result = new Promise<unknown>((resolve) => {
        finish = resolve;
      });
      room = new Roomcraft({planner: () => result});
      consoleScript = new RoomcraftConsole(room);
      consoleScript.init();
      await consoleScript.start();
      options.gemini.apiKey = 'local-test-fixture';
      consoleScript.setPrompt('Make the lamp blue');
      const pending = consoleScript.generate();
      expect(room.busy).toBe(true);
      expect(consoleScript.xrGenerate.disabled).toBe(true);
      consoleScript.setPrompt('Now add a backpack');
      finish({title: room.layout.title, edits: []});
      await pending;
      expect(input().value).toBe('Now add a backpack');
      expect(consoleScript.xrKeyboard.value).toBe('Now add a backpack');
      expect(consoleScript.xrPromptText.text).toContain('Now add a backpack');
    });

    it.each(['first', 'second'])(
      'selects and removes %s without Gemini and allows undoing the removal',
      async (id) => {
        const request = vi.spyOn(room, 'request');
        await room.applyLayout({
          title: 'Two robots',
          objects: [littleRobot('first'), littleRobot('second')],
        });
        const before = room.layout;
        consoleScript.cycleSelection(1);
        expect(room.selectedId).toBe('first');
        consoleScript.cycleSelection(1);
        expect(room.selectedId).toBe('second');
        consoleScript.cycleSelection(1);
        expect(room.selectedId).toBe('first');
        consoleScript.cycleSelection(-1);
        expect(room.selectedId).toBe('second');
        room.select(id);
        expect(consoleScript.xrRemove.disabled).toBe(false);
        button('removeSelected').click();
        await vi.waitFor(() =>
          expect(element('status').textContent).toContain(
            'Removed the selected'
          )
        );
        expect(room.layout.objects).toHaveLength(1);
        expect(room.layout.objects[0].id).toBe(
          id === 'first' ? 'second' : 'first'
        );
        expect(room.selectedId).toBeNull();
        expect(consoleScript.xrRemove.disabled).toBe(true);
        await consoleScript.undo();
        expect(room.layout).toEqual(before);
        expect(request).not.toHaveBeenCalled();
      }
    );

    it('separates authoring from handcrafted examples without changing the scene', () => {
      const before = room.layout;
      consoleScript.toggleSpatialStudio();
      consoleScript.toggleKeyboard();
      consoleScript.setSpatialTab('examples');
      expect(consoleScript.xrAuthorPanel.style.display).toBe('none');
      expect(consoleScript.xrExamplesPanel.style.display).toBe('flex');
      expect(consoleScript.keyboardCard.visible).toBe(false);
      consoleScript.setSpatialTab('author');
      expect(consoleScript.xrAuthorPanel.style.display).toBe('flex');
      expect(consoleScript.xrExamplesPanel.style.display).toBe('none');
      expect(consoleScript.keyboardCard.visible).toBe(true);
      expect(room.layout).toEqual(before);
    });

    it('keeps the studio available in XR and restores the desktop visibility choice', () => {
      expect(consoleScript.card.visible).toBe(false);
      consoleScript.onXRSessionStarted();
      consoleScript.update(0, {getViewerPose: () => ({})});
      consoleScript.toggleKeyboard();
      expect(consoleScript.card.visible).toBe(true);
      expect(consoleScript.keyboardCard.visible).toBe(true);
      expect(element('console').classList.contains('rc-hidden')).toBe(true);
      consoleScript.onXRSessionEnded();
      expect(consoleScript.card.visible).toBe(false);
      expect(consoleScript.keyboardCard.visible).toBe(false);
      consoleScript.toggleSpatialStudio();
      consoleScript.onXRSessionStarted();
      consoleScript.onXRSessionEnded();
      expect(consoleScript.card.visible).toBe(true);
      expect(consoleScript.keyboardCard.visible).toBe(true);
    });

    it('releases keyboard submission callbacks and both spatial roots', () => {
      options.gemini.apiKey = 'local-test-fixture';
      const request = vi.spyOn(room, 'request');
      const keyboard = consoleScript.xrKeyboard;
      consoleScript.dispose();
      keyboard.setValue('Create a robot');
      keyboard.pressKey('Enter');
      expect(request).not.toHaveBeenCalled();
      expect(consoleScript.card.parent).toBeNull();
      expect(consoleScript.keyboardCard.parent).toBeNull();
      expect(keyboard.onSubmit).toBeUndefined();
      expect(keyboard.onValueChange).toBeUndefined();
    });
  });
});
