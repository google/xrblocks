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
let camera: THREE.PerspectiveCamera;
let renderer: {xr: {isPresenting: boolean}};

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

function expectFramed(object: THREE.Object3D) {
  object.updateWorldMatrix(true, false);
  camera.updateWorldMatrix(true, false);
  const bounds = new THREE.Box3().setFromObject(object);
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

beforeEach(async () => {
  document.body.innerHTML = html.match(/<body>([\s\S]*)<\/body>/)![1];
  const media = Object.assign(new EventTarget(), {matches: false});
  vi.stubGlobal('matchMedia', () => media);
  options = new AIOptions();
  speech = new TestSpeech();
  camera = new THREE.PerspectiveCamera(50, 16 / 9, 0.01, 100);
  camera.position.set(0, 1.5, 2);
  camera.lookAt(0, 0.5, -1);
  renderer = {xr: {isPresenting: false}};
  Object.assign(mockCore, {camera, renderer});
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
  });

  it('builds the handcrafted example as one compound object under a single owner', async () => {
    await consoleScript.applyStarter(robotStarter);
    expect(room.layout.objects).toHaveLength(1);
    expect(room.children).toHaveLength(1);
    const [object] = room.layout.objects;
    expect(object.asset).toBeUndefined();
    expect(object.parts).toHaveLength(16);
    const owner = room.getObject('example-robot')!;
    expect(owner.xb?.manipulation).toBeDefined();
    expect(countMeshes(owner)).toBe(16);
    expect(owner.getObjectByName('antenna-tip')?.parent?.name).toBe('antenna');
    const bounds = new THREE.Box3().setFromObject(owner);
    expect(bounds.min.y).toBeCloseTo(0, 2);
    expect(bounds.max.y).toBeGreaterThan(0.8);
    expect(element('status').textContent).toContain('handcrafted');
  });

  it('describes the selected design and lists its parts as plain text', async () => {
    await consoleScript.applyStarter(robotStarter);
    room.select('example-robot');
    expect(element('design').textContent).toContain('16 parts');
    const parts = element('parts');
    expect((parts as HTMLElement).hidden).toBe(false);
    expect(parts.children).toHaveLength(16);
    expect(parts.children[0].textContent).toBe('Torso (box)');
    expect(parts.querySelector('script')).toBeNull();
    expect(consoleScript.xrSelectionText.text).toBe(
      'Selected: Handcrafted robot - 16 parts'
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
    expect(design.parts).toHaveLength(17);
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

  describe('spatial authoring', () => {
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
      consoleScript.update();
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
