import {describe, expect, it, vi} from 'vitest';

vi.hoisted(() => {
  vi.stubGlobal('AudioContext', function () {
    return {createGain: () => ({connect: () => {}}), destination: {}};
  });
});

import * as THREE from 'three';
import {HAND_JOINT_NAMES} from 'xrblocks';

import {
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

  it.each([
    ['decreasing timestamps', recording([frame(10), frame(5)]), /frames/],
    [
      'non-finite pose',
      recording([frame(0, {head: [NaN, 0, 0, 0, 0, 0, 1]})]),
      /head/,
    ],
    [
      'truncated hand',
      recording([frame(0, {hands: [null, [0, 0, 0]]})]),
      /hands/,
    ],
  ])('rejects %s', (_name, input, message) => {
    expect(() => parseSessionRecording(input)).toThrow(message);
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

  it('switches selection and tracking on the recorded frame', () => {
    const sample = sampleSessionRecording(session, 100);
    expect(sample.controllers[0]!.selected).toBe(true);
    expect(sample.controllers[1]!.selected).toBe(true);
    expect(sample.hands[1]).toEqual(hand(1));
  });
});
