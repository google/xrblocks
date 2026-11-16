import {afterEach, describe, expect, it, vi} from 'vitest';

vi.hoisted(() => {
  vi.stubGlobal('AudioContext', function () {
    return {createGain: () => ({connect: () => {}}), destination: {}};
  });
});

import * as THREE from 'three';
import {WebXRController} from 'three/src/renderers/webxr/WebXRController.js';
import {HAND_JOINT_NAMES, Core, Input, Options} from 'xrblocks';

import {XRSystems} from '../../core/components/XRSystems';

import {SessionRecorder} from './SessionRecorder';
import {
  getSessionRecordingDuration,
  parseSessionRecording,
  sampleSessionRecording,
} from './SessionRecording';

type FakeController = THREE.Group & {inputSource?: {handedness: string}};

const cores: Core[] = [];
const originalCore = Core.instance;
afterEach(async () => {
  for (const core of cores.splice(0)) await core.dispose();
  Core.instance = originalCore;
});
function makeCore(input?: Input, presenting = true) {
  Core.instance = undefined;
  const core = new Core();
  if (input) core.input = input;
  core.renderer = {xr: {isPresenting: presenting}} as THREE.WebGLRenderer;
  core.simulatorRunning = !presenting;
  cores.push(core);
  return core;
}
function createInputState({presenting = true}: {presenting?: boolean} = {}) {
  const controllers: FakeController[] = [new THREE.Group(), new THREE.Group()];
  const hands = [new THREE.Group(), new THREE.Group()].map((hand) => {
    const joints: Record<string, THREE.Group> = {};
    HAND_JOINT_NAMES.forEach((name, i) => {
      const joint = new THREE.Group();
      joint.position.set(0, i * 0.01, 0);
      joints[name] = joint;
      hand.add(joint);
    });
    return Object.assign(hand, {joints});
  });
  const core = makeCore(undefined, presenting);
  core.input.controllers = controllers as never;
  core.input.hands = hands as never;
  return {core, controllers, hands};
}

function connect(controller: FakeController, handedness?: string) {
  controller.userData.connected = true;
  if (handedness) controller.inputSource = {handedness};
}

function createRecorder(
  options = {},
  coreOptions: Parameters<typeof createInputState>[0] = {}
) {
  const fake = createInputState(coreOptions);
  const camera = new THREE.PerspectiveCamera();
  const recorder = new SessionRecorder(options);
  recorder.init({core: fake.core, camera});
  return {...fake, camera, recorder};
}

describe('SessionRecorder', () => {
  it('captures head, controllers, and hand joints in world space', () => {
    const {recorder, camera, controllers, hands} = createRecorder();
    const rig = new THREE.Group();
    rig.position.set(0, 1, 0);
    rig.add(controllers[0]);
    connect(controllers[0], 'left');
    connect(controllers[1], 'right');
    controllers[0].position.set(0.2, 0, -0.3);
    controllers[1].userData.selected = true;
    camera.position.set(0, 1.6, 0);
    hands[1].position.set(1, 0, 0);

    recorder.start();
    recorder.update(1000);
    const recording = recorder.stop();

    expect(recording.source).toBe('xr');
    expect(recording.frames).toHaveLength(1);
    const [frame] = recording.frames;
    expect(frame.t).toBe(0);
    expect(frame.head).toEqual([0, 1.6, 0, 0, 0, 0, 1]);
    expect(frame.controllers[0]).toEqual({
      pose: [0.2, 1, -0.3, 0, 0, 0, 1],
      selected: false,
    });
    expect(frame.controllers[1]!.selected).toBe(true);
    const rightHand = frame.hands[1]!;
    expect(rightHand).toHaveLength(HAND_JOINT_NAMES.length * 7);
    expect(rightHand.slice(7, 10)).toEqual([1, 0.01, 0]);
    expect(() => parseSessionRecording(recording)).not.toThrow();
  });

  it('samples at the configured interval but never misses a selection', () => {
    const {recorder, controllers} = createRecorder({sampleIntervalMs: 100});
    connect(controllers[0], 'left');

    recorder.start();
    recorder.update(500);
    recorder.update(550);
    controllers[0].userData.selected = true;
    recorder.update(560);
    recorder.update(600);
    recorder.update(660);
    const frames = recorder.stop().frames;

    expect(frames.map((frame) => frame.t)).toEqual([0, 60, 160]);
    expect(frames.map((frame) => frame.controllers[0]!.selected)).toEqual([
      false,
      true,
      true,
    ]);
  });

  it('stores a copy of the app state passed to start', () => {
    const {recorder} = createRecorder();
    const state = {cubes: [1, 0, 2]};
    recorder.start({state});
    state.cubes[0] = 3;
    expect(recorder.stop().state).toEqual({cubes: [1, 0, 2]});

    recorder.start();
    expect(recorder.stop()).not.toHaveProperty('state');
  });

  it('restarts a page recording as a headset one when XR starts', () => {
    const {recorder, core, camera} = createRecorder({}, {presenting: false});
    core.simulatorRunning = false;
    recorder.start({state: [1, 2]});
    recorder.update(0);
    recorder.update(100);
    expect(recorder.isRecording).toBe(true);

    Object.defineProperty(core.renderer.xr, 'isPresenting', {
      configurable: true,
      value: true,
    });
    recorder.onXRSessionStarted();
    camera.position.set(0, 1.6, 0);
    recorder.update(5000);
    const recording = recorder.stop();

    expect(recording.source).toBe('xr');
    expect(recording.state).toEqual([1, 2]);
    expect(recording).not.toHaveProperty('environment');
    expect(recording.frames.map((frame) => frame.t)).toEqual([0]);
    expect(recording.frames[0].head[1]).toBe(1.6);
    expect(() => parseSessionRecording(recording)).not.toThrow();
  });

  it('stops adding frames when the XR session ends', () => {
    const {recorder, core} = createRecorder();
    recorder.start();
    recorder.update(0);
    recorder.update(100);
    Object.defineProperty(core.renderer.xr, 'isPresenting', {
      configurable: true,
      value: false,
    });
    recorder.onXRSessionEnded();
    recorder.update(200);
    // A later session has a new origin, so it stays out of this recording.
    Object.defineProperty(core.renderer.xr, 'isPresenting', {
      configurable: true,
      value: true,
    });
    recorder.onXRSessionStarted();
    recorder.update(300);

    expect(recorder.isRecording).toBe(true);
    const recording = recorder.stop();
    expect(recording.frames.map((frame) => frame.t)).toEqual([0, 100]);

    // The next recording starts fresh.
    recorder.start();
    recorder.update(400);
    expect(recorder.stop().frames).toHaveLength(1);
  });

  it('cuts pauses out of the timeline so replay jumps across them', () => {
    const {recorder, camera} = createRecorder({sampleIntervalMs: 100});
    recorder.start();
    recorder.update(1000);
    camera.position.set(1, 0, 0);
    recorder.update(1100);
    recorder.update(1150);
    // Headset off for 10 seconds, back on somewhere else.
    camera.position.set(2, 0, 0);
    recorder.update(11150);
    recorder.update(11250);
    const recording = recorder.stop();

    // The first frame after the pause takes the last recorded frame's time,
    // so the move happens instantly on replay.
    expect(recording.frames.map((frame) => frame.t)).toEqual([
      0, 100, 100, 200,
    ]);
    expect(sampleSessionRecording(recording, 50).head[0]).toBeCloseTo(0.5, 5);
    expect(sampleSessionRecording(recording, 99).head[0]).toBeCloseTo(0.99, 5);
    expect(sampleSessionRecording(recording, 100).head[0]).toBe(2);
    expect(getSessionRecordingDuration(recording)).toBe(200);
    expect(() => parseSessionRecording(recording)).not.toThrow();
  });
});

describe('SessionRecorder with real input slots', () => {
  // Input has four XR slots, filled in the order sources connect, and keeps
  // input.hands as [left, right] whichever slots the hands use.
  function recordSlots(
    setup: (
      connect: (slot: number, source: XRInputSource, x?: number) => void,
      disconnect: (slot: number, source: XRInputSource) => void
    ) => void
  ) {
    const spaces = Array.from({length: 4}, () => new WebXRController());
    const options = new Options().enableHands();
    options.controllers.visualization = false;
    options.controllers.visualizeRays = false;
    options.hands.visualization = false;
    const input = new Input();
    input.init({
      systemsGroup: new XRSystems(),
      options,
      renderer: {
        xr: {
          getController: (index: number) => spaces[index].getTargetRaySpace(),
          getHand: (index: number) => spaces[index].getHandSpace(),
        },
      } as unknown as THREE.WebGLRenderer,
    });
    const core = makeCore(input);
    const recorder = new SessionRecorder();
    recorder.init({
      core,
      camera: new THREE.PerspectiveCamera(),
    });
    setup(
      (slot, source, x = 0) => {
        spaces[slot].connect(source);
        const ray = spaces[slot].getTargetRaySpace();
        ray.matrix.makeTranslation(x, 0, 0);
        ray.matrixWorldNeedsUpdate = true;
        if (!source.hand) return;
        const hand = spaces[slot].getHandSpace();
        hand.visible = true;
        for (const joint of Object.values(hand.joints)) {
          joint!.visible = true;
          joint!.matrix.makeTranslation(x, 1, 0);
          joint!.matrixWorldNeedsUpdate = true;
        }
      },
      (slot, source) => spaces[slot].disconnect(source)
    );
    recorder.start();
    recorder.update(0);
    const [frame] = recorder.stop().frames;
    input.dispose();
    return {
      controllers: frame.controllers.map((controller) =>
        controller ? controller.pose[0] : null
      ),
      hands: frame.hands.map((hand) => (hand ? hand[0] : null)),
    };
  }

  const handSource = (handedness: XRHandedness) =>
    ({
      handedness,
      targetRayMode: 'tracked-pointer',
      hand: new Map(
        HAND_JOINT_NAMES.map((jointName) => [jointName, {jointName}])
      ),
    }) as unknown as XRInputSource;

  it('follows a hand that reconnected into another slot', () => {
    const sides = recordSlots((connect, disconnect) => {
      const first = handSource('right');
      connect(0, first, 0.5);
      disconnect(0, first);
      connect(3, handSource('right'), 0.2);
    });

    expect(sides).toEqual({controllers: [null, 0.2], hands: [null, 0.2]});
  });
});
