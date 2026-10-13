import {describe, expect, it, vi} from 'vitest';

vi.hoisted(() => {
  vi.stubGlobal('AudioContext', function () {
    return {createGain: () => ({connect: () => {}}), destination: {}};
  });
});

import * as THREE from 'three';
import {HAND_JOINT_NAMES, type Core} from 'xrblocks';

import {SessionRecorder} from './SessionRecorder';
import {parseSessionRecording} from './SessionRecording';

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
    const {recorder, controllers} = createRecorder();
    connect(controllers[0], 'right');

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
