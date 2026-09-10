import * as THREE from 'three';
import {readFileSync} from 'node:fs';
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';

import {Roomcraft} from './Roomcraft';
import {AIOptions} from '../../ai/AIOptions';
import {Gemini} from '../../ai/Gemini';
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
      soundSynthesizer: {playTone: vi.fn()},
      categoryVolumes: {getEffectiveVolume: vi.fn()},
    },
  },
}));

vi.mock('xrblocks', async () => ({
  ...(await import('../../core/Script')),
  ...(await import('../../core/Options')),
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
  getUrlParameter: mockUrlParameter,
}));

class TestSpeech extends THREE.EventDispatcher {
  recognition: object | undefined = {};
  start = vi.fn();
  stop = vi.fn();
}

class TestRigidTransform {
  readonly matrix: Float32Array;

  constructor(
    position: {x: number; y: number; z: number},
    orientation: {x: number; y: number; z: number; w: number}
  ) {
    this.matrix = new Float32Array(
      new THREE.Matrix4().compose(
        new THREE.Vector3(position.x, position.y, position.z),
        new THREE.Quaternion(
          orientation.x,
          orientation.y,
          orientation.z,
          orientation.w
        ),
        new THREE.Vector3(1, 1, 1)
      ).elements
    );
  }
}

class TestReferenceSpace {
  constructor(readonly toBase = new THREE.Matrix4()) {}

  getOffsetReferenceSpace(offset: TestRigidTransform) {
    return new TestReferenceSpace(
      this.toBase.clone().multiply(new THREE.Matrix4().fromArray(offset.matrix))
    );
  }
}

const html = readFileSync('demos/roomcraft/index.html', 'utf8');
const manifestPath = 'demos/roomcraft/virtual-environment.json';

let room: Roomcraft;
let consoleScript: InstanceType<typeof RoomcraftConsole>;
let lighting: THREE.Group;
let aiOptions: AIOptions;
let camera: THREE.PerspectiveCamera;
let referenceSpace: TestReferenceSpace;
let trackedViewer: THREE.Matrix4 | null;
let renderer: {
  xr: {
    isPresenting: boolean;
    getReferenceSpace: () => TestReferenceSpace | null;
    setReferenceSpace: (space: TestReferenceSpace) => void;
  };
};

function viewerPose(space: TestReferenceSpace) {
  if (!trackedViewer) return null;
  const position = new THREE.Vector3();
  const orientation = new THREE.Quaternion();
  space.toBase
    .clone()
    .invert()
    .multiply(trackedViewer)
    .decompose(position, orientation, new THREE.Vector3());
  return {transform: {position, orientation}};
}

function beginXR(
  viewer = new THREE.Matrix4().compose(
    new THREE.Vector3(0.3, 1.7, -0.4),
    new THREE.Quaternion().setFromEuler(
      new THREE.Euler(-0.12, 0.7, 0.08, 'YXZ')
    ),
    new THREE.Vector3(1, 1, 1)
  )
) {
  referenceSpace = new TestReferenceSpace();
  trackedViewer = viewer.clone();
  renderer.xr.isPresenting = true;
  consoleScript.onXRSessionStarted();
}

function tickXR() {
  const space = renderer.xr.getReferenceSpace();
  const pose = space && viewerPose(space);
  if (pose) {
    // Match Core's camera synchronization before Script updates.
    camera.position.copy(pose.transform.position);
    camera.quaternion.copy(pose.transform.orientation);
    camera.updateMatrixWorld();
  }
  consoleScript.update(0, {getViewerPose: viewerPose});
}

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

function entryBlock(position = [0, 0, 5.8], size = [2, 2, 2]) {
  return {
    id: 'entry-block',
    name: 'Entry block',
    position,
    rotation: 0,
    scale: [1, 1, 1],
    color: '#ffffff',
    parts: [
      {
        id: 'solid',
        name: 'Solid block',
        shape: 'box',
        parent: null,
        position: [0, size[1] / 2, 0],
        rotation: [0, 0, 0],
        size,
        color: '#ffffff',
      },
    ],
  };
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
  referenceSpace = new TestReferenceSpace();
  trackedViewer = null;
  vi.stubGlobal('XRRigidTransform', TestRigidTransform);
  renderer = {
    xr: {
      isPresenting: false,
      getReferenceSpace: () => referenceSpace,
      setReferenceSpace: vi.fn((space: TestReferenceSpace) => {
        referenceSpace = space;
      }),
    },
  };
  Object.assign(mockCore, {camera, renderer});
  Object.assign(mockCore.ai, {
    options: aiOptions,
    model: new Gemini(aiOptions.gemini),
  });
  Object.assign(mockCore.sound, {speechRecognizer: new TestSpeech()});
  mockCore.sound.categoryVolumes.getEffectiveVolume.mockReturnValue(0.035);
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
  it.each([false, true])(
    'keeps browser-managed speech recognition disabled (virtual=%s)',
    (virtual) => {
      expect(
        createRoomcraftOptions(virtual).sound.speechRecognizer.enabled
      ).toBe(false);
    }
  );

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

  it('omits unbounded tracking from VR entry without disabling floor spaces or hands', () => {
    const options = createRoomcraftOptions(true);
    expect(options.webxrOptionalFeatures).toEqual([
      'local-floor',
      'bounded-floor',
    ]);
    expect(options.referenceSpaceType).toBe('local-floor');
    expect(options.hands.enabled).toBe(true);
    expect(options.world.planes.enabled).toBe(true);
  });

  it('puts browser key setup before the authoring controls and names Quest Browser', async () => {
    await mount();
    expect(
      element('aiHeading').compareDocumentPosition(element('promptHeading')) &
        Node.DOCUMENT_POSITION_FOLLOWING
    ).toBeTruthy();
    expect(element('connectionHelp').textContent).toContain('Meta Quest');
    expect(consoleScript.xrProviderText.text).toContain('browser panel');
    consoleScript.onXRSessionStarted();
    expect(consoleScript.xrProviderText.text).toContain('Exit XR');
  });

  it.each(['key', 'geminiKey'])(
    'configures a URL-provided %s without opening a key dialog or generating a scene',
    async (parameter) => {
      mockUrlParameter.mockImplementation((name) =>
        name === parameter ? 'local-url-fixture' : null
      );
      mockCore.ai.initializeModel.mockImplementation(async () => {
        aiOptions.gemini.apiKey = 'local-url-fixture';
      });
      const planner = vi.fn(async () => ({title: 'Unused', edits: []}));

      await mount({planner});

      expect(mockCore.ai.initializeModel).toHaveBeenCalledOnce();
      expect(aiOptions.promptForApiKey).toBe(false);
      expect(aiOptions.gemini.enabled).toBe(true);
      expect(consoleScript.isGeminiReady()).toBe(true);
      expect(room.layout.objects).toEqual([]);
      expect(planner).not.toHaveBeenCalled();
    }
  );

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
    expect(defaults.webxrOptionalFeatures).toEqual(
      new Options().webxrOptionalFeatures
    );
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
    // The garden's preferred point can be occupied, but the entry stays inside.
    expect(camera.position.z).toBeGreaterThan(0);
    expect(camera.position.z + 0.35).toBeLessThan(7);
    const standing = new THREE.Box3(
      new THREE.Vector3(
        camera.position.x - 0.35,
        0.1,
        camera.position.z - 0.35
      ),
      new THREE.Vector3(camera.position.x + 0.35, 1.7, camera.position.z + 0.35)
    );
    for (const object of layoutBefore.objects) {
      const bounds = room.getWorldBounds(object.id);
      if (bounds.max.y > 0.1 && bounds.min.y < 1.7) {
        expect(bounds.intersectsBox(standing)).toBe(false);
      }
    }
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

  it('hides Enter world in XR and restores it after the renderer finishes exiting', async () => {
    await mount();
    expect(element('enterWorld').hidden).toBe(false);
    expect(consoleScript.xrEnterWorld.style.display).toBe('flex');

    renderer.xr.isPresenting = true;
    consoleScript.onXRSessionStarted();
    expect(element('enterWorld').hidden).toBe(true);
    expect(consoleScript.xrEnterWorld.style.display).toBe('none');

    // Native session-end listeners can run before three.js clears this flag.
    consoleScript.onXRSessionEnded();
    renderer.xr.isPresenting = false;
    consoleScript.update();
    expect(element('enterWorld').hidden).toBe(false);
    expect(consoleScript.xrEnterWorld.style.display).toBe('flex');
    expect(button('enterWorld').disabled).toBe(false);
  });

  it('chooses a different desktop entry when the preferred spot is occupied', async () => {
    await mount();
    await room.applyLayout({...room.layout, objects: [entryBlock()]});
    const layout = room.layout;
    const occupied = room.getWorldBounds('entry-block').expandByScalar(0.35);
    await consoleScript.enterWorld();
    expect(occupied.containsPoint(camera.position)).toBe(false);
    expect(camera.position.y).toBe(1.5);
    expect(Math.abs(camera.position.x) + 0.35).toBeLessThan(7);
    expect(Math.abs(camera.position.z) + 0.35).toBeLessThan(7);
    expect(room.layout).toEqual(layout);
  });

  it('leaves the desktop camera and scene unchanged if no entry position is clear', async () => {
    await mount();
    await room.applyLayout({
      ...room.layout,
      environment: {...room.layout.environment, size: [4, 4]},
      objects: [entryBlock([0, 0, 0], [4, 2, 4])],
    });
    const layout = room.layout;
    const position = camera.position.clone();
    const rotation = camera.quaternion.clone();
    await consoleScript.enterWorld();
    expect(element('error').textContent).toContain('No clear entry position');
    expect(camera.position.equals(position)).toBe(true);
    expect(camera.quaternion.equals(rotation)).toBe(true);
    expect(room.layout).toEqual(layout);
  });

  it('places the XR viewer through an offset space before revealing the world and studio', async () => {
    await mount();
    const layout = room.layout;
    const history = [room.canUndo, room.canRedo, room.selectedId];
    beginXR();
    expect(room.visible).toBe(false);
    expect(consoleScript.card.visible).toBe(false);
    tickXR();
    expect(renderer.xr.setReferenceSpace).toHaveBeenCalledTimes(1);
    // The script does not overwrite the camera that Core just synchronized.
    expect(camera.position.toArray()).toEqual([0.3, 1.7, -0.4]);
    expect(room.visible).toBe(false);
    expect(consoleScript.card.visible).toBe(false);
    const pose = viewerPose(referenceSpace)!;
    expect(pose.transform.position.x).toBeCloseTo(0, 5);
    expect(pose.transform.position.y).toBeCloseTo(1.7, 5);
    expect(pose.transform.position.z).toBeCloseTo(5.8, 5);
    const expectedOrientation = new THREE.Quaternion().setFromEuler(
      new THREE.Euler(-0.12, 0, 0.08, 'YXZ')
    );
    expect(
      pose.transform.orientation.angleTo(expectedOrientation)
    ).toBeLessThan(1e-4);
    const physicalHand = new THREE.Vector3(0.6, 1.2, -0.8);
    const handInWorld = physicalHand
      .clone()
      .applyMatrix4(referenceSpace.toBase.clone().invert());
    expect(handInWorld.distanceTo(pose.transform.position)).toBeCloseTo(
      physicalHand.distanceTo(new THREE.Vector3(0.3, 1.7, -0.4)),
      5
    );
    tickXR();
    expect(room.visible).toBe(true);
    expect(consoleScript.card.visible).toBe(true);
    expect(consoleScript.card.position.y).toBeCloseTo(1.95, 5);
    expect(room.layout).toEqual(layout);
    expect([room.canUndo, room.canRedo, room.selectedId]).toEqual(history);
  });

  it('waits for a frame, reference space and tracked pose before choosing an XR entry', async () => {
    await mount();
    beginXR();
    consoleScript.update();
    expect(renderer.xr.setReferenceSpace).not.toHaveBeenCalled();
    const sensor = trackedViewer;
    trackedViewer = null;
    tickXR();
    expect(renderer.xr.setReferenceSpace).not.toHaveBeenCalled();
    trackedViewer = sensor;
    const unavailable = vi
      .spyOn(renderer.xr, 'getReferenceSpace')
      .mockReturnValue(null);
    tickXR();
    expect(renderer.xr.setReferenceSpace).not.toHaveBeenCalled();
    expect(room.visible).toBe(false);
    expect(consoleScript.card.visible).toBe(false);
    unavailable.mockRestore();
    tickXR();
    tickXR();
    expect(room.visible).toBe(true);
    expect(consoleScript.card.visible).toBe(true);
  });

  it('chooses XR entry from the loaded scene rather than the temporary opening ground', async () => {
    const pending = Promise.withResolvers<Response>();
    const fetchScene = vi.fn(() => pending.promise);
    vi.stubGlobal('fetch', fetchScene);
    mockUrlParameter.mockImplementation((name) =>
      name === SAVED_SCENE_PARAMETER ? './saved-world.json' : null
    );
    const starting = mount();
    await vi.waitFor(() => expect(fetchScene).toHaveBeenCalledTimes(1));
    beginXR();
    tickXR();
    expect(renderer.xr.setReferenceSpace).not.toHaveBeenCalled();
    expect(room.visible).toBe(false);
    pending.resolve(
      new Response(
        JSON.stringify({
          title: 'Loaded world',
          environment: {...room.layout.environment, size: [10, 10]},
          objects: [],
        })
      )
    );
    await starting;
    tickXR();
    tickXR();
    expect(camera.position.z).toBeCloseTo(3.8, 5);
    expect(room.visible).toBe(true);
  });

  it('preserves physical eye height when entering a moved, rotated and scaled world', async () => {
    await mount();
    room.position.set(3, 2, -4);
    room.rotation.y = Math.PI / 2;
    room.scale.set(2, 3, 0.5);
    beginXR();
    tickXR();
    tickXR();
    expect(camera.position.x).toBeCloseTo(5.3, 5);
    expect(camera.position.y).toBeCloseTo(3.7, 5);
    expect(camera.position.z).toBeCloseTo(-4, 5);
    expect(
      new THREE.Euler().setFromQuaternion(camera.quaternion, 'YXZ').y
    ).toBeCloseTo(Math.PI / 2, 5);
    expect(room.position.toArray()).toEqual([3, 2, -4]);
    expect(room.scale.toArray()).toEqual([2, 3, 0.5]);
  });

  it('avoids objects at both the tracked origin and preferred XR entry without rebuilding them', async () => {
    await mount();
    await room.applyLayout({
      ...room.layout,
      objects: [{...entryBlock([0, 0, 0]), id: 'origin-block'}, entryBlock()],
    });
    const owner = room.getObject('entry-block');
    const layout = room.layout;
    beginXR();
    tickXR();
    tickXR();
    for (const object of layout.objects) {
      expect(
        room
          .getWorldBounds(object.id)
          .expandByScalar(0.35)
          .containsPoint(camera.position)
      ).toBe(false);
    }
    expect(room.getObject('entry-block')).toBe(owner);
    expect(room.layout).toEqual(layout);
  });

  it('preserves later head movement and manual studio placement, and starts fresh on re-entry', async () => {
    await mount();
    const sensor = new THREE.Matrix4().makeTranslation(0.3, 1.7, -0.4);
    beginXR(sensor);
    tickXR();
    tickXR();
    consoleScript.card.position.x += 0.6;
    const dragged = consoleScript.card.position.clone();
    trackedViewer = new THREE.Matrix4()
      .makeTranslation(0.25, -0.1, 0.3)
      .multiply(sensor);
    tickXR();
    expect(camera.position.x).toBeCloseTo(0.25, 5);
    expect(camera.position.y).toBeCloseTo(1.6, 5);
    expect(camera.position.z).toBeCloseTo(6.1, 5);
    expect(consoleScript.card.position.equals(dragged)).toBe(true);
    expect(renderer.xr.setReferenceSpace).toHaveBeenCalledTimes(1);
    consoleScript.onXRSessionEnded();
    renderer.xr.isPresenting = false;
    consoleScript.update();
    beginXR(sensor);
    tickXR();
    tickXR();
    expect(renderer.xr.setReferenceSpace).toHaveBeenCalledTimes(2);
    expect(camera.position.z).toBeCloseTo(5.8, 5);
    expect(consoleScript.card.position.equals(dragged)).toBe(false);
  });

  it.each([
    {visible: true, finish: 'end'},
    {visible: false, finish: 'end'},
    {visible: true, finish: 'dispose'},
    {visible: false, finish: 'dispose'},
  ])(
    'restores world visibility $visible on $finish before tracking arrives',
    async ({visible, finish}) => {
      await mount();
      room.visible = visible;
      beginXR();
      if (finish === 'end') consoleScript.onXRSessionEnded();
      else consoleScript.dispose();
      expect(room.visible).toBe(visible);
      expect(consoleScript.needsXRSpawn).toBe(false);
      expect(renderer.xr.setReferenceSpace).not.toHaveBeenCalled();
    }
  );

  it('keeps a blocked world hidden with usable controls and retries after an edit', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    await mount();
    await room.applyLayout({
      ...room.layout,
      environment: {...room.layout.environment, size: [4, 4]},
      objects: [entryBlock([0, 0, 0], [4, 2, 4])],
    });
    const layout = room.layout;
    beginXR();
    tickXR();
    expect(room.visible).toBe(false);
    expect(consoleScript.card.visible).toBe(true);
    expect(consoleScript.xrNew.disabled).toBe(false);
    expect(consoleScript.xrStatusText.text).toContain(
      'No clear entry position'
    );
    expect(consoleScript.xrStatusText.text).toContain('hidden');
    expect(room.layout).toEqual(layout);
    expect(renderer.xr.setReferenceSpace).not.toHaveBeenCalled();
    tickXR();
    expect(console.error).toHaveBeenCalledTimes(1);
    await consoleScript.newEnvironment();
    tickXR();
    tickXR();
    expect(room.visible).toBe(true);
    expect(consoleScript.card.visible).toBe(true);
    expect(element('error').hidden).toBe(true);
    expect(room.canUndo).toBe(true);
  });

  it('reports native offset failures once rather than throwing out of the frame loop', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    await mount();
    beginXR();
    const offset = vi
      .spyOn(referenceSpace, 'getOffsetReferenceSpace')
      .mockImplementation(() => {
        throw new Error('Reference offset rejected.');
      });
    expect(() => tickXR()).not.toThrow();
    tickXR();
    expect(offset).toHaveBeenCalledTimes(1);
    expect(element('error').textContent).toContain('Reference offset rejected');
    expect(room.visible).toBe(false);
    expect(consoleScript.card.visible).toBe(true);
    consoleScript.onXRSessionEnded();
    expect(room.visible).toBe(true);
  });

  it('does not clear an unrelated setup error after successful XR placement', async () => {
    await mount();
    consoleScript.setError('Gemini setup needs attention.');
    beginXR();
    tickXR();
    tickXR();
    expect(element('error').textContent).toBe('Gemini setup needs attention.');
  });

  it.each([false, true])(
    'leaves room mode and layouts without virtual ground in their tracked space (virtual=%s)',
    async (virtual) => {
      await mount({virtual});
      if (virtual) {
        await room.applyLayout({title: 'No virtual ground', objects: []});
      }
      beginXR();
      tickXR();
      expect(renderer.xr.setReferenceSpace).not.toHaveBeenCalled();
      expect(camera.position.toArray()).toEqual([0.3, 1.7, -0.4]);
      expect(room.visible).toBe(true);
      expect(consoleScript.card.visible).toBe(true);
    }
  );

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
