import * as THREE from 'three';
import {readFileSync} from 'node:fs';
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';

import {Roomcraft} from './Roomcraft';
import {AIOptions} from '../../ai/AIOptions';
import type {SceneLayout} from './SceneTypes';

// @ts-expect-error The executable browser demo is a JavaScript consumer.
import {RoomcraftConsole} from '../../../demos/roomcraft/main.js';
// @ts-expect-error The handcrafted example layouts are JavaScript data.
import {
  STARTER_SCENES,
  MINIATURE_CITY,
} from '../../../demos/roomcraft/scenes.js';

const {mockCore} = vi.hoisted(() => ({
  mockCore: {
    ai: {
      options: undefined,
      isAvailable: vi.fn(),
      initializeModel: vi.fn(),
    },
    sound: {
      speechRecognizer: undefined,
    },
  },
}));

vi.mock('xrblocks', async () => ({
  ...(await import('../../core/Script')),
  ...(await import('../../ai/AI')),
  ...(await import('../../ai/Gemini')),
  ...(await import('../../world/World')),
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

function element(id: string) {
  const node = document.getElementById(id);
  if (!node) throw new Error(`Missing demo element "${id}".`);
  return node;
}

function input() {
  const node = element('prompt');
  if (!(node instanceof HTMLInputElement))
    throw new Error('Expected a prompt input.');
  return node;
}

beforeEach(async () => {
  document.body.innerHTML = html.match(/<body>([\s\S]*)<\/body>/)![1];
  const media = Object.assign(new EventTarget(), {matches: false});
  vi.stubGlobal('matchMedia', () => media);
  options = new AIOptions();
  speech = new TestSpeech();
  Object.assign(mockCore.ai, {options});
  Object.assign(mockCore.sound, {speechRecognizer: speech});
  mockCore.ai.isAvailable.mockReturnValue(true);
  mockCore.ai.initializeModel.mockResolvedValue(undefined);
  room = new Roomcraft();
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
  it('starts with real geometry, no provider call, and no microphone activation', () => {
    expect(room.layout.title).toBe('Reading nook');
    expect(room.layout.objects).toHaveLength(11);
    expect(room.children).toHaveLength(11);
    expect(mockCore.ai.initializeModel).not.toHaveBeenCalled();
    expect(speech.start).not.toHaveBeenCalled();
    expect(element('status').textContent).toContain('handcrafted');
    expect(consoleScript.card.visible).toBe(false);
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

  it('does not claim a connected provider when the key prompt was cancelled', async () => {
    await consoleScript.connectGemini();
    expect(mockCore.ai.initializeModel).toHaveBeenCalledOnce();
    expect(element('aiStatus').textContent).toContain('Not connected');
    expect(element('connect').textContent).toBe('Connect Gemini');
    expect(consoleScript.xrStatusText.text).toContain('valid API key');
    expect(consoleScript.isGeminiReady()).toBe(false);
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

  it('submits only a final transcript and stops the native recognizer', async () => {
    options.gemini.apiKey = 'local-test-fixture';
    const request = vi.spyOn(room, 'request').mockResolvedValue(room.layout);
    consoleScript.toggleListening();
    expect(speech.start).toHaveBeenCalledOnce();
    expect(element('mic').getAttribute('aria-pressed')).toBe('true');
    speech.dispatchEvent({
      type: 'result',
      isFinal: false,
      transcript: 'make this',
    });
    expect(request).not.toHaveBeenCalled();
    speech.dispatchEvent({
      type: 'result',
      isFinal: true,
      transcript: ' make this blue ',
    });
    await vi.waitFor(() =>
      expect(request).toHaveBeenCalledWith('make this blue')
    );
    expect(request).toHaveBeenCalledOnce();
    expect(speech.stop).toHaveBeenCalledOnce();
    expect(element('mic').getAttribute('aria-pressed')).toBe('false');
    await vi.waitFor(() =>
      expect(element('status').textContent).toContain('No scene changes')
    );
  });

  it('binds speech once even when the SDK initializes recognition on a later frame', async () => {
    consoleScript.dispose();
    speech.recognition = undefined;
    consoleScript = new RoomcraftConsole(room);
    consoleScript.init();
    consoleScript.bindSpeech();
    consoleScript.update();
    expect(element('mic').textContent).toBe('No voice');
    speech.recognition = {};
    consoleScript.update();
    consoleScript.bindSpeech();
    expect(element('mic').textContent).toBe('Talk');
    options.gemini.apiKey = 'local-test-fixture';
    const request = vi.spyOn(room, 'request').mockResolvedValue(room.layout);
    consoleScript.toggleListening();
    speech.dispatchEvent({
      type: 'result',
      isFinal: true,
      transcript: 'Add a lamp',
    });
    await vi.waitFor(() => expect(request).toHaveBeenCalledOnce());
    expect(speech.stop).toHaveBeenCalledOnce();
  });

  it('shows speech denial and provider failures on both desktop and XR surfaces', async () => {
    options.gemini.apiKey = 'local-test-fixture';
    consoleScript.toggleListening();
    speech.dispatchEvent({type: 'error', error: 'not-allowed'});
    expect(consoleScript.xrStatusText.text).toContain('permission was denied');
    expect(speech.stop).toHaveBeenCalledOnce();
    const before = room.layout;
    vi.spyOn(room, 'request').mockRejectedValue(new Error('Quota exceeded'));
    vi.spyOn(console, 'error').mockImplementation(() => {});
    input().value = 'Add a lamp';
    await consoleScript.generate();
    expect(room.layout).toEqual(before);
    expect(element('error').textContent).toBe('Quota exceeded');
    expect(consoleScript.xrStatusText.text).toBe('Quota exceeded');
  });

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

  it('releases room, DOM, and speech listeners when the console is disposed', () => {
    options.gemini.apiKey = 'local-test-fixture';
    consoleScript.toggleListening();
    const request = vi.spyOn(room, 'request');
    consoleScript.dispose();
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
    expect(speech.stop).toHaveBeenCalledOnce();
    expect(consoleScript.cleanups).toHaveLength(0);
  });
});
