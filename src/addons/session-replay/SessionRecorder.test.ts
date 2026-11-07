import {describe, expect, it, vi} from 'vitest';

vi.hoisted(() => {
  vi.stubGlobal('AudioContext', function () {
    return {createGain: () => ({connect: () => {}}), destination: {}};
  });
});

import * as THREE from 'three';
import {WebXRController} from 'three/src/renderers/webxr/WebXRController.js';
import {HAND_JOINT_NAMES, Input, Options, type Core} from 'xrblocks';

import {XRSystems} from '../../core/components/XRSystems';

import {SessionRecorder} from './SessionRecorder';
import {
  getSessionRecordingDuration,
  parseSessionRecording,
  sampleSessionRecording,
} from './SessionRecording';

type FakeController = THREE.Group & {inputSource?: {handedness: string}};

function createFakeCore({
  presenting = true,
  activeEnvironment,
}: {
  presenting?: boolean;
  activeEnvironment?: {name?: string; manifestPath: string};
} = {}) {
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
  const core = {
    input: {controllers, hands},
    renderer: {xr: {isPresenting: presenting}},
    simulatorRunning: !presenting,
    simulator: {activeEnvironment},
  };
  return {core, controllers, hands};
}

function connect(controller: FakeController, handedness?: string) {
  controller.userData.connected = true;
  if (handedness) controller.inputSource = {handedness};
}

function createRecorder(
  options = {},
  coreOptions: Parameters<typeof createFakeCore>[0] = {}
) {
  const fake = createFakeCore(coreOptions);
  const camera = new THREE.PerspectiveCamera();
  const recorder = new SessionRecorder(options);
  recorder.init({core: fake.core as unknown as Core, camera});
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

  it('orders sources by reported handedness, not input index', () => {
    const {recorder, controllers} = createRecorder();
    connect(controllers[0], 'right');
    connect(controllers[1], 'left');
    controllers[0].position.x = 1;
    controllers[1].position.x = -1;

    recorder.start();
    recorder.update(0);
    const [frame] = recorder.stop().frames;

    expect(frame.controllers[0]!.pose[0]).toBe(-1);
    expect(frame.controllers[1]!.pose[0]).toBe(1);
  });

  it('leaves a side empty when only the other hand is connected', () => {
    const {recorder, controllers, hands} = createRecorder();
    connect(controllers[0], 'right');
    // Input keeps an untracked placeholder on a side with no connected hand.
    hands[0].visible = false;

    recorder.start();
    recorder.update(0);
    const [frame] = recorder.stop().frames;

    expect(frame.controllers[0]).toBeNull();
    expect(frame.controllers[1]).not.toBeNull();
    expect(frame.hands[0]).toBeNull();
  });

  it('skips disconnected controllers and partially tracked hands', () => {
    const {recorder, hands} = createRecorder();
    hands[0].joints['index-finger-tip'].visible = false;
    hands[1].visible = false;

    recorder.start();
    recorder.update(0);
    const [frame] = recorder.stop().frames;

    expect(frame.controllers).toEqual([null, null]);
    expect(frame.hands).toEqual([null, null]);
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

  it('labels simulator recordings', () => {
    const {recorder} = createRecorder({}, {presenting: false});
    recorder.start();
    expect(recorder.stop().source).toBe('simulator');
  });

  it('only records between start and stop', () => {
    const {recorder} = createRecorder();
    recorder.update(0);
    expect(recorder.isRecording).toBe(false);
    recorder.start();
    expect(recorder.isRecording).toBe(true);
    recorder.update(10);
    const recording = recorder.stop();
    recorder.update(20);
    expect(recording.frames).toHaveLength(1);
    expect(() => recorder.stop()).toThrow(/not recording/);
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

  it('stores the simulator room with simulator recordings', () => {
    const office = {name: 'Office', manifestPath: 'rooms/office.json'};
    const {recorder} = createRecorder(
      {},
      {presenting: false, activeEnvironment: office}
    );
    recorder.start();
    expect(recorder.stop().environment).toEqual(office);

    const unnamed = createRecorder(
      {},
      {presenting: false, activeEnvironment: {manifestPath: 'room.json'}}
    ).recorder;
    unnamed.start();
    expect(unnamed.stop().environment).toEqual({manifestPath: 'room.json'});
  });

  it('stores no room for headset recordings', () => {
    const {recorder} = createRecorder(
      {},
      {activeEnvironment: {manifestPath: 'room.json'}}
    );
    recorder.start();
    expect(recorder.stop()).not.toHaveProperty('environment');
  });

  it('restarts a page recording as a headset one when XR starts', () => {
    const {recorder, core, camera} = createRecorder(
      {},
      {presenting: false, activeEnvironment: {manifestPath: 'room.json'}}
    );
    core.simulatorRunning = false;
    recorder.start({state: [1, 2]});
    recorder.update(0);
    recorder.update(100);
    expect(recorder.isRecording).toBe(true);

    core.renderer.xr.isPresenting = true;
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

  it('keeps a headset recording going when XR starts again', () => {
    const {recorder} = createRecorder();
    recorder.start();
    recorder.update(0);
    recorder.onXRSessionStarted();
    recorder.update(100);
    expect(recorder.stop().frames).toHaveLength(2);
  });

  it('stops adding frames when the XR session ends', () => {
    const {recorder, core} = createRecorder();
    recorder.start();
    recorder.update(0);
    recorder.update(100);
    core.renderer.xr.isPresenting = false;
    recorder.onXRSessionEnded();
    recorder.update(200);
    // A later session has a new origin, so it stays out of this recording.
    core.renderer.xr.isPresenting = true;
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

  it('ignores the XR session ending during a simulator recording', () => {
    const {recorder} = createRecorder({}, {presenting: false});
    recorder.start();
    recorder.update(0);
    recorder.onXRSessionEnded();
    recorder.update(100);
    expect(recorder.stop().frames).toHaveLength(2);
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

  it('keeps short frame hitches in the timeline', () => {
    const {recorder} = createRecorder({sampleIntervalMs: 100});
    recorder.start();
    recorder.update(0);
    recorder.update(400);
    expect(recorder.stop().frames.map((frame) => frame.t)).toEqual([0, 400]);
  });

  it('requires initialization before start', () => {
    expect(() => new SessionRecorder().start()).toThrow(/initialized/);
  });

  it('rejects invalid sample intervals', () => {
    expect(() => new SessionRecorder({sampleIntervalMs: -1})).toThrow(
      RangeError
    );
    expect(() => new SessionRecorder({sampleIntervalMs: NaN})).toThrow(
      RangeError
    );
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
    const core = {
      input,
      renderer: {xr: {isPresenting: true}},
      simulatorRunning: false,
      simulator: {},
    };
    const recorder = new SessionRecorder();
    recorder.init({
      core: core as unknown as Core,
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
  const transientPointer = () =>
    ({handedness: 'none', targetRayMode: 'transient-pointer'}) as XRInputSource;

  it('records a lone right hand in the first slot as the right hand', () => {
    const sides = recordSlots((connect) =>
      connect(0, handSource('right'), 0.2)
    );

    expect(sides).toEqual({controllers: [null, 0.2], hands: [null, 0.2]});
  });

  it('keeps each hand on its own side when the right hand connects first', () => {
    const sides = recordSlots((connect) => {
      connect(0, handSource('right'), 0.2);
      connect(1, handSource('left'), -0.2);
    });

    expect(sides).toEqual({controllers: [-0.2, 0.2], hands: [-0.2, 0.2]});
  });

  it('finds hands in the last two slots behind transient pointers', () => {
    const sides = recordSlots((connect) => {
      connect(0, transientPointer());
      connect(1, transientPointer());
      connect(2, handSource('left'), -0.2);
      connect(3, handSource('right'), 0.2);
    });

    expect(sides).toEqual({controllers: [-0.2, 0.2], hands: [-0.2, 0.2]});
  });

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
