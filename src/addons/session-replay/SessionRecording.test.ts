import {describe, expect, it, vi} from 'vitest';

vi.hoisted(() => {
  vi.stubGlobal('AudioContext', function () {
    return {createGain: () => ({connect: () => {}}), destination: {}};
  });
});

import * as THREE from 'three';
import {HAND_JOINT_NAMES} from 'xrblocks';

import {
  HAND_LENGTH,
  getSessionRecordingDuration,
  parseSessionRecording,
  sampleSessionRecording,
  type SessionFrame,
  type SessionRecording,
} from './SessionRecording';

const IDENTITY = [0, 0, 0, 0, 0, 0, 1];

function frame(t: number, overrides: Partial<SessionFrame> = {}): SessionFrame {
  return {
    t,
    head: IDENTITY.slice(),
    controllers: [null, null],
    hands: [null, null],
    ...overrides,
  };
}

function recording(frames: SessionFrame[]): SessionRecording {
  return {
    format: 'xrblocks-session',
    version: 1,
    source: 'simulator',
    jointNames: [...HAND_JOINT_NAMES],
    frames,
  };
}

function hand(x: number) {
  const joints: number[] = [];
  for (let i = 0; i < HAND_JOINT_NAMES.length; i++) {
    joints.push(x, i * 0.01, 0, 0, 0, 0, 1);
  }
  return joints;
}

describe('parseSessionRecording', () => {
  it('round-trips a recording through JSON', () => {
    const original = recording([
      frame(0, {
        controllers: [{pose: IDENTITY.slice(), selected: true}, null],
        hands: [null, hand(0.1)],
      }),
      frame(33),
    ]);
    expect(parseSessionRecording(JSON.stringify(original))).toEqual(original);
  });

  it('keeps app state through JSON', () => {
    const original = {...recording([frame(0)]), state: {cubes: [1, 0, 2]}};
    expect(parseSessionRecording(JSON.stringify(original)).state).toEqual({
      cubes: [1, 0, 2],
    });
  });

  it('accepts an empty recording', () => {
    expect(parseSessionRecording(recording([])).frames).toEqual([]);
  });

  it.each([
    ['a non-object', 42, /expected an object/],
    ['another format', {...recording([]), format: 'other'}, /format/],
    ['a future version', {...recording([]), version: 2}, /version 2/],
    ['an unknown source', {...recording([]), source: 'phone'}, /source/],
    [
      'reordered joint names',
      {...recording([]), jointNames: [...HAND_JOINT_NAMES].reverse()},
      /jointNames/,
    ],
    ['missing frames', {...recording([]), frames: undefined}, /frames must/],
    [
      'decreasing timestamps',
      recording([frame(10), frame(5)]),
      /frames\[1\]\.t/,
    ],
    [
      'a short head pose',
      recording([frame(0, {head: [0, 0, 0]})]),
      /frames\[0\]\.head/,
    ],
    [
      'a non-finite pose value',
      recording([frame(0, {head: [NaN, 0, 0, 0, 0, 0, 1]})]),
      /frames\[0\]\.head/,
    ],
    [
      'a single controller slot',
      recording([
        frame(0, {
          controllers: [null] as unknown as SessionFrame['controllers'],
        }),
      ]),
      /controllers must be a \[left, right\]/,
    ],
    [
      'a controller without selection state',
      recording([
        frame(0, {
          controllers: [
            {pose: IDENTITY.slice()} as SessionFrame['controllers'][0],
            null,
          ],
        }),
      ]),
      /controllers\[0\]\.selected/,
    ],
    [
      'a truncated hand',
      recording([frame(0, {hands: [null, [0, 0, 0]]})]),
      new RegExp(`hands\\[1\\] must be ${HAND_LENGTH}`),
    ],
  ])('rejects %s', (_name, input, message) => {
    expect(() => parseSessionRecording(input)).toThrow(message);
  });

  it('rejects malformed JSON text', () => {
    expect(() => parseSessionRecording('{')).toThrow(SyntaxError);
  });
});

describe('sampleSessionRecording', () => {
  const quarterTurn = new THREE.Quaternion().setFromAxisAngle(
    new THREE.Vector3(0, 1, 0),
    Math.PI / 2
  );
  const turned = [2, 4, -6, ...quarterTurn.toArray()];
  const session = recording([
    frame(0, {
      controllers: [{pose: IDENTITY.slice(), selected: false}, null],
      hands: [hand(0), null],
    }),
    frame(100, {
      head: turned,
      controllers: [
        {pose: turned, selected: true},
        {pose: turned, selected: true},
      ],
      hands: [hand(1), hand(1)],
    }),
  ]);

  it('interpolates positions and slerps rotations between frames', () => {
    const sample = sampleSessionRecording(session, 50);
    const expectedRotation = new THREE.Quaternion().setFromAxisAngle(
      new THREE.Vector3(0, 1, 0),
      Math.PI / 4
    );
    expect(sample.t).toBe(50);
    expect(sample.head.slice(0, 3)).toEqual([1, 2, -3]);
    const rotation = new THREE.Quaternion().fromArray(sample.head, 3);
    expect(rotation.angleTo(expectedRotation)).toBeCloseTo(0, 6);
    expect(sample.controllers[0]!.pose.slice(0, 3)).toEqual([1, 2, -3]);
    expect(sample.hands[0]![0]).toBeCloseTo(0.5);
    expect(sample.hands[0]![7 * 3 + 1]).toBeCloseTo(0.03);
  });

  it('keeps selection and tracking from the earlier frame', () => {
    const sample = sampleSessionRecording(session, 99);
    expect(sample.controllers[0]!.selected).toBe(false);
    expect(sample.controllers[1]).toBeNull();
    expect(sample.hands[1]).toBeNull();
  });

  it('switches selection and tracking on the recorded frame', () => {
    const sample = sampleSessionRecording(session, 100);
    expect(sample.controllers[0]!.selected).toBe(true);
    expect(sample.controllers[1]!.selected).toBe(true);
    expect(sample.hands[1]).toEqual(hand(1));
  });

  it('holds the first and last frames outside the recording', () => {
    expect(sampleSessionRecording(session, -10).head).toEqual(IDENTITY);
    const after = sampleSessionRecording(session, 500);
    expect(after.head.slice(0, 3)).toEqual([2, 4, -6]);
  });

  it('holds a pose when the next frame lost tracking', () => {
    const lost = recording([
      frame(0, {controllers: [{pose: turned, selected: false}, null]}),
      frame(100),
    ]);
    expect(sampleSessionRecording(lost, 50).controllers[0]!.pose).toEqual(
      turned
    );
  });

  it('does not mutate the recording', () => {
    const before = JSON.stringify(session);
    sampleSessionRecording(session, 25);
    expect(JSON.stringify(session)).toBe(before);
  });

  it('rejects an empty recording', () => {
    expect(() => sampleSessionRecording(recording([]), 0)).toThrow(/empty/);
  });
});

describe('getSessionRecordingDuration', () => {
  it('is the last frame time', () => {
    expect(getSessionRecordingDuration(recording([frame(0), frame(42)]))).toBe(
      42
    );
    expect(getSessionRecordingDuration(recording([]))).toBe(0);
  });
});
