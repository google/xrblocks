import {afterAll, afterEach, beforeAll, describe, expect, it, vi} from 'vitest';
// TestRunner installs the headless WebGL/WebAudio mocks; import it first.
import {TestRunner} from '../testing/TestRunner';
import * as THREE from 'three';
import {
  HAND_JOINT_NAMES,
  Options,
  Script,
  SimulatorMode,
  type SelectEvent,
} from 'xrblocks';

import {SessionPlayer} from './SessionPlayer';
import {SessionRecorder} from './SessionRecorder';
import {
  getSessionRecordingDuration,
  parseSessionRecording,
  type SessionRecording,
} from './SessionRecording';

class SelectCounter extends Script {
  starts: number[] = [];
  ends: number[] = [];

  override onObjectSelectStart(event: SelectEvent) {
    this.starts.push(event.source.controller.userData.id);
    event.stopPropagation();
  }

  override onObjectSelectEnd(event: SelectEvent) {
    this.ends.push(event.source.controller.userData.id);
    event.stopPropagation();
  }
}

function worldPosition(object: THREE.Object3D) {
  object.updateWorldMatrix(true, false);
  return new THREE.Vector3().setFromMatrixPosition(object.matrixWorld);
}

describe('session record and replay', () => {
  const player = new SessionPlayer();
  const recorder = new SessionRecorder({sampleIntervalMs: 0});
  const target = new SelectCounter();
  let runner: TestRunner;
  let recording: SessionRecording;

  beforeAll(async () => {
    target.add(new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.2, 0.2)));
    target.position.set(0, 1.2, -1);
    const options = new Options();
    options.hands.enabled = true;
    options.simulator.defaultMode = SimulatorMode.POSE;
    runner = await TestRunner.create({
      scripts: [player, recorder, target],
      options,
    });
  });

  afterAll(async () => {
    await runner.destroy();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('records head, hand, and selection changes from the simulator', async () => {
    recorder.start();
    await runner.actions.step({
      control: {locomotion: {rotate: [0, 10, 0]}},
      durationMs: 100,
    });
    await runner.actions.pointTo(1, target);
    await runner.actions.step({
      control: {rightHand: {selectStart: true}},
      durationMs: 100,
    });
    await runner.actions.step({
      control: {rightHand: {selectEnd: true}},
      durationMs: 100,
    });
    recording = parseSessionRecording(JSON.stringify(recorder.stop()));

    expect(recording.source).toBe('simulator');
    expect(getSessionRecordingDuration(recording)).toBeGreaterThan(0);
    expect(target.starts).toEqual([1]);
    expect(target.ends).toEqual([1]);
    const selections = recording.frames.map(
      (frame) => frame.controllers[1]?.selected
    );
    expect(selections).toContain(true);
    expect(selections.at(-1)).toBe(false);
    expect(recording.frames.some((frame) => frame.hands[1] !== null)).toBe(
      true
    );
  });

  it('replays the recording into the simulator', async () => {
    target.starts = [];
    target.ends = [];
    // Wander off so the replay has to restore the recorded pose.
    await runner.actions.step({
      control: {
        locomotion: {move: [1, 0, 1], rotate: [0, -45, 0]},
        rightHand: {move: [0.2, -0.2, 0]},
      },
      durationMs: 100,
    });

    const finished = player.play(recording);
    expect(player.isPlaying).toBe(true);
    await runner.actions.step({
      durationMs: getSessionRecordingDuration(recording) + 100,
    });
    await finished;

    expect(player.isPlaying).toBe(false);
    expect(target.starts).toEqual([1]);
    expect(target.ends).toEqual([1]);

    const last = recording.frames.at(-1)!;
    const core = runner.core;
    const head = worldPosition(core.camera);
    expect(head.toArray()).toEqual(
      last.head.slice(0, 3).map((value) => expect.closeTo(value, 3))
    );
    const lastHand = [...recording.frames]
      .reverse()
      .find((frame) => frame.hands[1])!.hands[1]!;
    const indexTip = core.input.hands[1].joints['index-finger-tip']!;
    const tipIndex = HAND_JOINT_NAMES.indexOf('index-finger-tip') * 7;
    expect(worldPosition(indexTip).toArray()).toEqual(
      lastHand
        .slice(tipIndex, tipIndex + 3)
        .map((value) => expect.closeTo(value, 3))
    );
  });

  it('stops early and releases a held selection', async () => {
    const held = parseSessionRecording(JSON.stringify(recording));
    const pressedAt = held.frames.findIndex(
      (frame) => frame.controllers[1]?.selected
    );
    held.frames = held.frames.slice(0, pressedAt + 1);
    held.frames.push({
      ...held.frames[pressedAt],
      t: held.frames.at(-1)!.t + 1000,
    });
    target.starts = [];
    target.ends = [];

    const finished = player.play(held);
    await runner.actions.step({
      durationMs: held.frames[pressedAt].t + 50,
    });
    expect(runner.core.input.controllers[1].userData.selected).toBe(true);
    player.stop();
    await finished;
    await runner.actions.step({durationMs: 50});

    expect(runner.core.input.controllers[1].userData.selected).toBe(false);
    expect(target.starts).toEqual([1]);
    expect(target.ends).toEqual([1]);
  });

  it('replays a pinch shorter than one playback frame', async () => {
    const quick = parseSessionRecording(JSON.stringify(recording));
    const pressedAt = quick.frames.findIndex(
      (frame) => frame.controllers[1]?.selected
    );
    const releasedAt = quick.frames.findIndex(
      (frame, i) => i > pressedAt && !frame.controllers[1]?.selected
    );
    quick.frames = [
      ...quick.frames.slice(0, pressedAt + 1),
      {...quick.frames[releasedAt], t: quick.frames[pressedAt].t + 1},
      ...quick.frames.slice(releasedAt + 1),
    ];
    target.starts = [];
    target.ends = [];

    const finished = player.play(quick);
    await runner.actions.step({
      durationMs: getSessionRecordingDuration(quick) + 100,
    });
    await finished;
    await runner.actions.step({durationMs: 50});

    expect(target.starts).toEqual([1]);
    expect(target.ends).toEqual([1]);
  });

  it('switches to the recorded room before replaying', async () => {
    let roomLoaded!: () => void;
    const setEnvironment = vi
      .spyOn(runner.core.simulator!, 'setEnvironment')
      .mockReturnValue(new Promise((resolve) => (roomLoaded = resolve)));
    const finished = player.play({
      ...recording,
      environment: {name: 'Office', manifestPath: 'rooms/office.json'},
    });
    expect(setEnvironment).toHaveBeenCalledWith('Office', 'rooms/office.json');
    expect(player.isPlaying).toBe(true);
    await runner.actions.step({durationMs: 100});
    expect(player.currentTimeMs).toBe(0);

    roomLoaded();
    // Let play() see the loaded room before stepping frames again.
    await new Promise((resolve) => setTimeout(resolve, 0));
    await runner.actions.step({
      durationMs: getSessionRecordingDuration(recording) + 100,
    });
    await finished;
    expect(player.isPlaying).toBe(false);
  });

  it('keeps the current room when it already matches or is opted out', async () => {
    const simulator = runner.core.simulator!;
    vi.spyOn(simulator, 'activeEnvironment', 'get').mockReturnValue({
      manifestPath: 'rooms/office.json',
    });
    const setEnvironment = vi.spyOn(simulator, 'setEnvironment');
    const short = {...recording, frames: recording.frames.slice(0, 2)};
    for (const [environment, options] of [
      [{manifestPath: 'rooms/office.json'}, {}],
      [{manifestPath: 'rooms/other.json'}, {environment: false}],
    ] as const) {
      const finished = player.play({...short, environment}, options);
      await runner.actions.step({durationMs: 200});
      await finished;
    }
    expect(setEnvironment).not.toHaveBeenCalled();
  });

  it('rejects with the room name when the room cannot load', async () => {
    vi.spyOn(runner.core.simulator!, 'setEnvironment').mockRejectedValue(
      new Error('404 Not Found.')
    );
    await expect(
      player.play({
        ...recording,
        environment: {name: 'Custom loft', manifestPath: 'loft.json'},
      })
    ).rejects.toThrow(
      /Could not load the recorded simulator room "Custom loft": 404 Not Found\. Pass \{environment: false\}/
    );
    expect(player.isPlaying).toBe(false);
  });

  it('rejects an empty recording', async () => {
    await expect(player.play({...recording, frames: []})).rejects.toThrow(
      /empty/
    );
  });
});
