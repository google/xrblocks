import * as THREE from 'three';
import {readFileSync} from 'node:fs';
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';

import {Roomcraft} from './Roomcraft';
import {AIOptions} from '../../ai/AIOptions';
import {Options} from '../../core/Options';
import {parseSimulatorSceneManifest} from '../../simulator/scene/SimulatorEnvironmentManifest';
import type {
  SceneEnvironment,
  SceneLayout,
  ScenePlan,
  SceneRequest,
} from './SceneTypes';

// @ts-expect-error The executable browser demo is a JavaScript consumer.
import {
  ENVIRONMENT_MODE_PARAMETER,
  RoomcraftConsole,
  SAVED_SCENE_PARAMETER,
  VIRTUAL_ENVIRONMENT,
  createRoomcraftOptions,
} from '../../../demos/roomcraft/main.js';
// @ts-expect-error The handcrafted example layouts are JavaScript data.
import {
  ENVIRONMENT_STARTER_SCENES,
  MOONLIT_GARDEN,
  STARTER_SCENES,
} from '../../../demos/roomcraft/scenes.js';

const {mockCore, mockUrlParameter} = vi.hoisted(() => ({
  mockUrlParameter: vi.fn<(name: string) => string | null>(() => null),
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
  ...(await import('../../core/Options')),
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
  getUrlParameter: mockUrlParameter,
}));

class TestSpeech extends THREE.EventDispatcher {
  recognition: object | undefined = {};
  start = vi.fn();
  stop = vi.fn();
}

const html = readFileSync('demos/roomcraft/index.html', 'utf8');
const manifestPath = 'demos/roomcraft/virtual-environment.json';

let room: Roomcraft;
let consoleScript: InstanceType<typeof RoomcraftConsole>;
let lighting: THREE.Group;
let aiOptions: AIOptions;
let camera: THREE.PerspectiveCamera;
let renderer: {xr: {isPresenting: boolean}};

function element(id: string) {
  const node = document.getElementById(id);
  if (!node) throw new Error(`Missing demo element "${id}".`);
  return node;
}

function button(id: string) {
  const node = element(id);
  if (!(node instanceof HTMLButtonElement)) {
    throw new Error(`Expected "${id}" to be a button.`);
  }
  return node;
}

function chipLabels() {
  return [...element('suggestions').children].map((chip) => chip.textContent);
}

/** Mounts one console over fresh markup, in the requested page mode. */
async function mount({
  virtual = true,
  planner,
}: {
  virtual?: boolean;
  planner?: (request: SceneRequest) => Promise<unknown>;
} = {}) {
  document.body.innerHTML = html.match(/<body>([\s\S]*)<\/body>/)![1];
  lighting = new THREE.Group();
  lighting.name = 'RoomcraftLighting';
  room = new Roomcraft(planner ? {planner} : {});
  consoleScript = new RoomcraftConsole(room, {virtual, lighting});
  consoleScript.init();
  await consoleScript.start();
  return consoleScript;
}

beforeEach(() => {
  mockUrlParameter.mockReturnValue(null);
  const media = Object.assign(new EventTarget(), {matches: false});
  vi.stubGlobal('matchMedia', () => media);
  aiOptions = new AIOptions();
  camera = new THREE.PerspectiveCamera(50, 16 / 9, 0.01, 100);
  camera.position.set(0, 1.5, 2);
  camera.lookAt(0, 0.5, -1);
  renderer = {xr: {isPresenting: false}};
  Object.assign(mockCore, {camera, renderer});
  Object.assign(mockCore.ai, {options: aiOptions});
  Object.assign(mockCore.sound, {speechRecognizer: new TestSpeech()});
  mockCore.ai.isAvailable.mockReturnValue(true);
  mockCore.ai.initializeModel.mockResolvedValue(undefined);
});

afterEach(() => {
  if (consoleScript && !consoleScript.disposed) consoleScript.dispose();
  room?.dispose();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe('Roomcraft virtual environment mode', () => {
  it('opens an honestly empty authoring canvas, not a generated place', async () => {
    await mount();
    const layout = room.layout as SceneLayout;
    expect(layout.objects).toEqual([]);
    expect(layout.environment).toEqual({
      size: [14, 14],
      groundColor: '#8b8f80',
      timeOfDay: 'daylight',
    });
    expect(mockCore.ai.initializeModel).not.toHaveBeenCalled();
    expect(element('status').textContent).toContain('14 by 14 m ground');
    expect(element('status').textContent).toContain('nothing in it yet');
    expect(element('environmentSection').hasAttribute('hidden')).toBe(false);
    expect(element('environmentSummary').textContent).toContain(
      '14 by 14 m ground, daylight'
    );
    expect(consoleScript.xrEnvironmentText.text).toBe(
      element('environmentSummary').textContent
    );
    expect(chipLabels()).toEqual([
      'Create a moonlit Japanese garden',
      'Make the pond bigger',
      'Change the garden to sunrise',
      'Add a small pavilion beside the pond',
    ]);
  });

  it('configures a VR session, an empty backdrop, and an eye inside the ground', () => {
    const options = createRoomcraftOptions(true);
    expect(options.xrSessionMode).toBe('immersive-vr');
    expect(options.simulator.environments).toEqual([
      {
        name: 'Roomcraft virtual world',
        manifestPath: './virtual-environment.json',
      },
    ]);
    expect(options.simulator.activeEnvironmentIndex).toBe(0);
    expect(options.xrButton.alwaysAutostartSimulator).toBe(false);
    expect(options.xrButton.enabled).toBe(true);
    expect(options.enableSimulator).toBe(true);
    const eye = options.simulator.initialCameraPosition;
    expect(eye.y).toBeGreaterThan(1);
    expect(eye.z).toBeGreaterThan(0);
    // Inside the front half of the 14 by 14 meter opening ground.
    expect(eye.z).toBeLessThan(7);
    expect(Math.abs(eye.x)).toBeLessThan(7);
    expect(ENVIRONMENT_MODE_PARAMETER).toBe('environment');
    expect(SAVED_SCENE_PARAMETER).toBe('scene');
  });

  it('loads a same-server saved garden at startup without making an AI request', async () => {
    const fetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify(MOONLIT_GARDEN), {
        headers: {'Content-Type': 'application/json'},
      })
    );
    vi.stubGlobal('fetch', fetch);
    mockUrlParameter.mockImplementation((name) =>
      name === 'scene' ? './garden.json' : null
    );
    const planner = vi.fn(async () => ({title: 'Unused', edits: []}));
    await mount({planner});
    expect(fetch).toHaveBeenCalledWith(
      new URL('./garden.json', window.location.href).href,
      {mode: 'same-origin', credentials: 'omit', redirect: 'error'}
    );
    expect(room.layout.title).toBe(MOONLIT_GARDEN.title);
    expect(room.layout.environment).toEqual(MOONLIT_GARDEN.environment);
    expect(room.layout.objects).toHaveLength(MOONLIT_GARDEN.objects.length);
    expect(planner).not.toHaveBeenCalled();
    expect(mockCore.ai.initializeModel).not.toHaveBeenCalled();
    expect(element('status').textContent).toContain('Loaded saved scene');
  });

  it.each([
    'https://example.com/garden.json',
    'data:application/json,{}',
    `http://user:placeholder@${window.location.host}/garden.json`,
  ])(
    'refuses saved-scene URLs outside the anonymous same-server boundary: %s',
    async (url) => {
      const fetch = vi.fn();
      vi.stubGlobal('fetch', fetch);
      vi.spyOn(console, 'error').mockImplementation(() => {});
      mockUrlParameter.mockImplementation((name) =>
        name === 'scene' ? url : null
      );
      await mount();
      expect(fetch).not.toHaveBeenCalled();
      expect(room.layout.objects).toEqual([]);
      expect(element('error').textContent).toContain('same server');
    }
  );

  it.each([
    {body: 'Not found', status: 404},
    {body: 'Not a JSON scene', status: 200},
  ])(
    'keeps the empty setting when a saved scene cannot load: $status',
    async ({body, status}) => {
      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue(new Response(body, {status}))
      );
      vi.spyOn(console, 'error').mockImplementation(() => {});
      mockUrlParameter.mockImplementation((name) =>
        name === 'scene' ? './garden.json' : null
      );
      await mount();
      expect(room.layout.objects).toEqual([]);
      expect(room.layout.environment?.timeOfDay).toBe('daylight');
      expect(element('error').hidden).toBe(false);
    }
  );

  it('does not overwrite an edit made while a saved scene is downloading', async () => {
    await mount();
    let finish!: (response: Response) => void;
    const download = new Promise<Response>((resolve) => {
      finish = resolve;
    });
    vi.stubGlobal(
      'fetch',
      vi.fn(() => download)
    );
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const pending = consoleScript.loadSavedScene('./garden.json');
    await room.applyPlan({
      title: 'My new lighting',
      edits: [],
      environment: {timeOfDay: 'sunrise'},
    });
    const edited = room.layout;
    finish(new Response(JSON.stringify(MOONLIT_GARDEN)));
    await pending;
    expect(room.layout).toEqual(edited);
    expect(element('error').textContent).toContain('changed while');
  });

  it('does not hide a saved-scene failure behind automatic provider setup', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(new Response('Not found', {status: 404}))
    );
    vi.spyOn(console, 'error').mockImplementation(() => {});
    mockUrlParameter.mockImplementation((name) => {
      if (name === 'scene') return './missing.json';
      if (name === 'key') return 'placeholder';
      return null;
    });
    await mount();
    expect(element('error').textContent).toContain('HTTP 404');
    expect(mockCore.ai.initializeModel).not.toHaveBeenCalled();
  });

  it('does not import a downloaded scene after the console is disposed', async () => {
    await mount();
    let finish!: (response: Response) => void;
    const download = new Promise<Response>((resolve) => {
      finish = resolve;
    });
    vi.stubGlobal(
      'fetch',
      vi.fn(() => download)
    );
    const before = room.layout;
    const pending = consoleScript.loadSavedScene('./garden.json');
    consoleScript.dispose();
    finish(new Response(JSON.stringify(MOONLIT_GARDEN)));
    await pending;
    expect(room.layout).toEqual(before);
  });

  it('ships a manifest that loads no scene, planes, navmesh, or objects', () => {
    const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
    expect(manifest).toEqual({name: 'Roomcraft virtual world', objects: []});
    expect(manifest.name).toBe(VIRTUAL_ENVIRONMENT.name);
    const resolved = parseSimulatorSceneManifest(
      manifest,
      'http://127.0.0.1:8080/demos/roomcraft/virtual-environment.json'
    );
    expect(resolved.objects).toEqual([]);
    expect(resolved.scenePath).toBeUndefined();
    expect(resolved.videoPath).toBeUndefined();
    expect(resolved.scenePlanesPath).toBeUndefined();
    expect(resolved.navMeshPath).toBeUndefined();
  });

  it('leaves the default page mode, options, and suggestions unchanged', async () => {
    const defaults = createRoomcraftOptions();
    expect(defaults.xrSessionMode).toBe('immersive-ar');
    expect(defaults.xrButton.alwaysAutostartSimulator).toBe(false);
    expect(defaults.simulator.environments).toEqual(
      new Options().simulator.environments
    );
    expect(defaults.simulator.initialCameraPosition).toEqual(
      new Options().simulator.initialCameraPosition
    );

    await mount({virtual: false});
    expect(room.layout.title).toBe('Reading nook');
    expect(room.layout.environment).toBeUndefined();
    expect(lighting.visible).toBe(true);
    expect(element('environmentSection').hasAttribute('hidden')).toBe(true);
    expect(chipLabels()[0]).toBe('Create a little robot standing on the floor');
    expect(
      [...element('starters').children].map((node) => node.textContent)
    ).toEqual(STARTER_SCENES.map((starter: {label: string}) => starter.label));
    expect(button('newDesign').textContent!.trim()).toBe('New design');
    expect(button('place').disabled).toBe(false);
  });

  it('hides the demo fallback lights only while Roomcraft owns the setting', async () => {
    await mount();
    expect(lighting.visible).toBe(false);
    await room.applyPlan({title: 'Room scale', edits: [], environment: null});
    expect(room.layout.environment).toBeUndefined();
    expect(lighting.visible).toBe(true);
    await room.undo();
    expect(room.layout.environment).toBeDefined();
    expect(lighting.visible).toBe(false);
  });

  it('describes a selected landscape feature on both interfaces', async () => {
    await mount();
    await consoleScript.applyStarter(ENVIRONMENT_STARTER_SCENES[0]);
    expect(room.layout.title).toBe(MOONLIT_GARDEN.title);
    expect(element('status').textContent).toContain('handcrafted');
    expect(element('environmentSummary').textContent).toContain('moonlight');

    room.select('garden-pond');
    expect(element('design').textContent).toContain('one landscape feature');
    expect(element('design').textContent).toContain('pond');
    expect(element('design').textContent).toContain('4.4 by 2.8 m');
    expect(element('design').textContent).toContain('0.35 m bank');
    expect(consoleScript.xrSelectionText.text).toContain('Reflecting pond');
    expect(consoleScript.xrSelectionText.text).toContain('pond');
    // A landscape feature is not a part-based design.
    expect(element('parts').hasAttribute('hidden')).toBe(true);

    room.select('garden-grass');
    expect(element('design').textContent).toContain('grass planting of 36');
    expect(element('design').textContent).toContain('seed 5209');
  });

  it('reaches the pond through ordinary selection cycling', async () => {
    await mount();
    await consoleScript.applyStarter(ENVIRONMENT_STARTER_SCENES[0]);
    const ids = room.layout.objects.map((object) => object.id);
    expect(ids).toContain('garden-pond');
    room.select(null);
    for (let step = 0; step < ids.length; step++) {
      consoleScript.cycleSelection(1);
      if (room.selectedId === 'garden-pond') break;
    }
    expect(room.selectedId).toBe('garden-pond');
    expect(room.getObject('garden-pond')).toBeDefined();
  });

  it('keeps environment metadata in an export of an empty environment', async () => {
    await mount();
    expect(button('export').disabled).toBe(false);
    const blobs: Blob[] = [];
    vi.stubGlobal('URL', {
      createObjectURL: (blob: Blob) => {
        blobs.push(blob);
        return 'blob:roomcraft-test';
      },
      revokeObjectURL: () => {},
    });
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    consoleScript.exportLayout();
    const exported = JSON.parse(
      await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result));
        reader.onerror = () => reject(reader.error);
        reader.readAsText(blobs[0]);
      })
    ) as SceneLayout;
    expect(exported.objects).toEqual([]);
    expect(exported.environment).toEqual({
      size: [14, 14],
      groundColor: '#8b8f80',
      timeOfDay: 'daylight',
    });
    expect(element('status').textContent).toContain('time of day');
    // The same data is accepted back by the add-on.
    await room.applyLayout(exported);
    expect(room.layout.environment).toEqual(exported.environment);
  });

  it('changes only the atmosphere through an undoable direct edit', async () => {
    await mount();
    await consoleScript.applyStarter(ENVIRONMENT_STARTER_SCENES[0]);
    const request = vi.spyOn(room, 'request');
    const before = room.layout.objects;
    button('sunrise').click();
    await vi.waitFor(() =>
      expect(element('status').textContent).toContain('without an AI request')
    );
    expect(room.layout.environment!.timeOfDay).toBe('sunrise');
    expect(request).not.toHaveBeenCalled();
    expect(mockCore.ai.initializeModel).not.toHaveBeenCalled();
    expect(room.layout.objects).toEqual(before);
    expect(button('sunrise').getAttribute('aria-pressed')).toBe('true');
    expect(button('sunrise').disabled).toBe(true);
    expect(button('moonlight').disabled).toBe(false);
    expect(element('environmentSummary').textContent).toContain('sunrise');

    await consoleScript.undo();
    expect(room.layout.environment!.timeOfDay).toBe('moonlight');
    expect(room.layout.objects).toEqual(before);
    await consoleScript.redo();
    expect(room.layout.environment!.timeOfDay).toBe('sunrise');
  });

  it('resets to a fresh empty environment for a new design', async () => {
    await mount();
    await consoleScript.applyStarter(ENVIRONMENT_STARTER_SCENES[0]);
    expect(button('newDesign').textContent!.trim()).toBe('New environment');
    button('newDesign').click();
    await vi.waitFor(() =>
      expect(element('status').textContent).toContain('Undo restores')
    );
    expect(room.layout.objects).toEqual([]);
    expect(room.layout.environment).toEqual({
      size: [14, 14],
      groundColor: '#8b8f80',
      timeOfDay: 'daylight',
    });
    await consoleScript.undo();
    expect(room.layout.objects.length).toBe(MOONLIT_GARDEN.objects.length);
  });

  it('sends a natural-language follow-up to the planner without a canned preset', async () => {
    const prompts: string[] = [];
    const planner = vi.fn(async (request: SceneRequest) => {
      prompts.push(request.prompt);
      return {title: request.scene.title, edits: []} satisfies ScenePlan;
    });
    await mount({planner});
    aiOptions.gemini.apiKey = 'local-test-fixture';
    consoleScript.setPrompt('Create a moonlit Japanese garden');
    await consoleScript.generate();
    expect(planner).toHaveBeenCalledOnce();
    expect(prompts).toEqual(['Create a moonlit Japanese garden']);
    // An empty plan is reported as an empty plan, never as a stock garden.
    expect(room.layout.objects).toEqual([]);
    expect(room.layout.environment!.timeOfDay).toBe('daylight');
    expect(element('status').textContent).toContain('No scene changes');
  });

  it('reports an atmosphere-only plan as a real change', async () => {
    const planner = vi.fn(async (request: SceneRequest) => ({
      title: request.scene.title,
      edits: [],
      environment: {timeOfDay: 'sunrise'},
    }));
    await mount({planner});
    aiOptions.gemini.apiKey = 'local-test-fixture';
    consoleScript.setPrompt('Change the garden to sunrise');
    await consoleScript.generate();
    expect(room.layout.environment!.timeOfDay).toBe('sunrise');
    expect(element('status').textContent).not.toContain('No scene changes');
    expect(element('status').textContent).toContain('sunrise');
  });

  it('reports every environment-only field as a change, and a no-op as none', async () => {
    let plan: ScenePlan = {title: 'New environment', edits: []};
    await mount({planner: async () => plan});
    aiOptions.gemini.apiKey = 'local-test-fixture';
    const patches: Array<[Partial<SceneEnvironment>, string]> = [
      [{groundColor: '#2f3b2a'}, '#2f3b2a'],
      [{size: [18, 9]}, '18 by 9 m'],
      [{timeOfDay: 'sunset'}, 'sunset'],
    ];
    for (const [environment, expected] of patches) {
      plan = {title: 'New environment', edits: [], environment};
      consoleScript.setPrompt('Adjust the setting');
      await consoleScript.generate();
      expect(element('status').textContent).not.toContain('No scene changes');
      expect(element('status').textContent).toContain(expected);
      expect(element('environmentSummary').textContent).toContain(expected);
    }
    // An accepted plan that truly changes nothing is still reported honestly.
    plan = {title: 'New environment', edits: []};
    consoleScript.setPrompt('Leave it alone');
    await consoleScript.generate();
    expect(element('status').textContent).toContain('No scene changes');
  });

  it('detects a change in each object source, and none when a plan is a no-op', async () => {
    let plan: ScenePlan = {title: 'Sources', edits: []};
    await mount({planner: async () => plan});
    aiOptions.gemini.apiKey = 'local-test-fixture';
    await room.applyLayout({
      title: 'Sources',
      environment: {
        size: [14, 14],
        groundColor: '#8b8f80',
        timeOfDay: 'daylight',
      },
      objects: [
        {
          id: 'pond',
          name: 'Pond',
          landscape: {kind: 'pond', size: [2, 1.4], bankWidth: 0.3},
          position: [0, 0, 0],
          rotation: 0,
          scale: [1, 1, 1],
          color: '#33566b',
        },
        {
          id: 'lamp',
          name: 'Lamp',
          asset: 'floor-lamp',
          position: [2, 0, 0],
          rotation: 0,
          scale: [1, 1, 1],
          color: '#c9c2b6',
        },
      ],
    });

    // Replacing a landscape recipe with the same numbers changes nothing.
    plan = {
      title: 'Sources',
      edits: [
        {
          op: 'update',
          id: 'pond',
          changes: {landscape: {kind: 'pond', size: [2, 1.4], bankWidth: 0.3}},
        },
      ],
    };
    consoleScript.setPrompt('Keep the pond as it is');
    await consoleScript.generate();
    expect(element('status').textContent).toContain('No scene changes');

    // A real recipe edit is reported, and the feature keeps its identity.
    plan = {
      title: 'Sources',
      edits: [
        {
          op: 'update',
          id: 'pond',
          changes: {landscape: {kind: 'pond', size: [4, 2.6], bankWidth: 0.3}},
        },
      ],
    };
    consoleScript.setPrompt('Make the pond bigger');
    await consoleScript.generate();
    expect(element('status').textContent).not.toContain('No scene changes');
    room.select('pond');
    expect(element('design').textContent).toContain('4 by 2.6 m');

    // Switching an object's single source is a change, not a silent no-op.
    plan = {
      title: 'Sources',
      edits: [
        {
          op: 'update',
          id: 'lamp',
          changes: {
            parts: [
              {
                id: 'post',
                name: 'Post',
                shape: 'cylinder',
                parent: null,
                position: [0, 0.6, 0],
                rotation: [0, 0, 0],
                size: [0.08, 1.2, 0.08],
                color: '#c9c2b6',
              },
            ],
          },
        },
      ],
    };
    consoleScript.setPrompt('Rebuild the lamp from parts');
    await consoleScript.generate();
    expect(element('status').textContent).not.toContain('No scene changes');
    const lamp = room.layout.objects.find((object) => object.id === 'lamp')!;
    expect(lamp.parts).toHaveLength(1);
    expect(lamp.asset).toBeUndefined();
    expect(lamp.landscape).toBeUndefined();
  });

  it('refuses to generate without a configured provider', async () => {
    await mount();
    consoleScript.setPrompt('Create a moonlit Japanese garden');
    await consoleScript.generate();
    expect(element('error').textContent).toContain('Gemini is not configured');
    expect(room.layout.objects).toEqual([]);
    expect(room.layout.title).toBe('New environment');
  });

  it('rejects surface placement for a virtual environment and explains why', async () => {
    await mount();
    const place = vi.spyOn(room, 'placeOnSurface');
    expect(button('place').disabled).toBe(true);
    expect(element('placement').textContent).toContain(
      'supplies its own ground'
    );
    await consoleScript.placeOnSurface();
    expect(place).not.toHaveBeenCalled();
    expect(element('error').textContent).toContain('supplies its own ground');
  });

  it('enters the world without moving objects, and never during an XR session', async () => {
    await mount();
    await consoleScript.applyStarter(ENVIRONMENT_STARTER_SCENES[0]);
    const layoutBefore = room.layout;

    renderer.xr.isPresenting = true;
    const xrPose = camera.matrix.clone();
    await consoleScript.enterWorld();
    expect(element('error').textContent).toContain('XR view was kept');
    expect(camera.matrix.equals(xrPose)).toBe(true);

    renderer.xr.isPresenting = false;
    await consoleScript.enterWorld();
    expect(camera.position.x).toBeCloseTo(0, 8);
    expect(camera.position.y).toBeCloseTo(1.5, 8);
    // Standing inside the ground, near its front edge.
    expect(camera.position.z).toBeCloseTo(5.8, 8);
    camera.updateMatrixWorld();
    const center = new THREE.Vector3(0, 0.975, 0).project(camera);
    expect(center.x).toBeCloseTo(0, 6);
    expect(center.y).toBeCloseTo(0, 6);
    expect(room.layout).toEqual(layoutBefore);

    // The pose is stable, so pressing it twice does not drift.
    const pose = camera.matrix.clone();
    await consoleScript.enterWorld();
    camera.updateMatrixWorld();
    expect(camera.matrix.equals(pose)).toBe(true);
    expect(element('status').textContent).toContain('no collision');
  });

  it('frames from the add-on bounds, which hold the ground but not the sky', async () => {
    await mount();
    const bounds = room.getWorldBounds();
    const size = bounds.getSize(new THREE.Vector3());
    expect(size.x).toBeCloseTo(14, 5);
    expect(size.z).toBeCloseTo(14, 5);
    expect(size.y).toBeLessThan(1);

    // The whole object graph carries a large sky, so Box3.setFromObject(room)
    // is the wrong bounds for framing and obstruction here. This stays a
    // relative check so the add-on can retune its sky freely.
    const rawSize = new THREE.Box3()
      .setFromObject(room)
      .getSize(new THREE.Vector3());
    expect(rawSize.y).toBeGreaterThan(size.y * 10);
    expect(rawSize.y).toBeGreaterThan(size.x);

    await consoleScript.frame();
    expect(element('status').textContent).toContain('ground extent');
    // A sky-sized box would push the camera past its far plane and fail.
    expect(camera.position.length()).toBeLessThan(40);
    camera.updateMatrixWorld();
    for (const corner of [bounds.min, bounds.max]) {
      const projected = corner.clone().project(camera);
      expect(Math.abs(projected.x)).toBeLessThan(1);
      expect(Math.abs(projected.y)).toBeLessThan(1);
    }
  });

  it('keeps studio placement on feature bounds, not the ground or sky', async () => {
    await mount();
    // An empty environment has no object envelope, so the ground and sky must
    // not count as obstructions for the spatial card.
    const emptyX = consoleScript.card.position.x;
    expect(Number.isFinite(emptyX)).toBe(true);
    expect(Math.abs(emptyX)).toBeLessThan(4);
    await consoleScript.applyStarter(ENVIRONMENT_STARTER_SCENES[0]);
    consoleScript.positionSpatialStudio();
    expect(Math.abs(consoleScript.card.position.x)).toBeLessThan(4);
    expect(
      room.getWorldBounds('garden-pond').getSize(new THREE.Vector3()).y
    ).toBeLessThan(1);
  });

  it('frames the whole environment, including empty ground', async () => {
    await mount();
    expect(button('frameScene').disabled).toBe(false);
    const layoutBefore = room.layout;
    await consoleScript.frame();
    expect(element('status').textContent).toContain('ground extent');
    expect(room.layout).toEqual(layoutBefore);
    const bounds = room.getWorldBounds();
    expect(bounds.isEmpty()).toBe(false);
    camera.updateMatrixWorld();
    for (const corner of [bounds.min, bounds.max]) {
      const projected = corner.clone().project(camera);
      expect(Math.abs(projected.x)).toBeLessThan(1);
      expect(Math.abs(projected.y)).toBeLessThan(1);
    }
  });

  it('restores the fallback lights and releases listeners on dispose', async () => {
    await mount();
    const card = consoleScript.card;
    const keyboardCard = consoleScript.keyboardCard;
    expect(lighting.visible).toBe(false);
    consoleScript.dispose();
    expect(lighting.visible).toBe(true);
    expect(consoleScript.lighting).toBeNull();
    expect(consoleScript.cleanups).toHaveLength(0);
    expect(card.parent).toBeNull();
    expect(keyboardCard.parent).toBeNull();
    const summary = element('environmentSummary').textContent;
    room.dispatchEvent({
      type: 'change',
      layout: {title: 'Ignored', objects: []} satisfies SceneLayout,
    });
    expect(element('environmentSummary').textContent).toBe(summary);
  });
});
