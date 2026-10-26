import * as THREE from 'three';
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';

import {User} from '../../core/User';
import {Handedness, Hands} from '../Hands';
import {StrokeRecognizer} from './StrokeRecognition';
import {StrokeRecognitionOptions} from './StrokeRecognitionOptions';
import {OneDollarUnistrokeRecognizer} from './providers/OneDollarUnistrokeRecognizer';

function createRecording(options = new StrokeRecognitionOptions()) {
  const user = new User();
  const hands = new Hands([]);
  user.hands = hands;
  const joints = [
    Object.assign(new THREE.Group(), {jointRadius: 0.01}),
    Object.assign(new THREE.Group(), {jointRadius: 0.01}),
  ];
  vi.spyOn(hands, 'getJoint').mockImplementation(
    (_joint, handedness) => joints[handedness]
  );
  let selecting: Handedness | null = null;
  vi.spyOn(user, 'isSelecting').mockImplementation(
    (handedness = -1) =>
      selecting !== null && (handedness === -1 || selecting === handedness)
  );
  const camera = new THREE.Camera();
  const scene = new THREE.Scene();
  const recognition = new StrokeRecognizer();
  recognition.init({scene, camera, user, options});
  recognition.activate();

  return {
    recognition,
    camera,
    joints,
    frame(timeMs: number, hand: Handedness | null) {
      vi.setSystemTime(timeMs);
      selecting = hand;
      recognition.update();
    },
  };
}

describe('StrokeRecognizer', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it.each([Handedness.LEFT, Handedness.RIGHT])(
    'captures hand %s in world space only after the start delay',
    (hand) => {
      const {recognition, joints, frame} = createRecording();
      const parent = new THREE.Group();
      parent.position.set(3, 2, -1);
      parent.rotation.z = Math.PI / 2;
      parent.add(joints[hand]);
      joints[hand].position.set(2, 0, 0);
      joints[1 - hand].position.set(99, 99, 99);
      const events: string[] = [];
      const points: THREE.Vector3[] = [];
      recognition.addEventListener('unistrokestart', () =>
        events.push('start')
      );
      recognition.addEventListener('unistrokeupdate', ({detail}) => {
        events.push('update');
        points.push(detail.point!.clone());
      });
      recognition.addEventListener('unistrokeend', ({detail}) => {
        events.push('end');
        expect(detail.result).toBeUndefined();
      });

      frame(0, hand);
      frame(199, hand);
      frame(200, hand);
      expect(events).toEqual(['start']);
      frame(201, hand);
      frame(300, null);
      frame(400, null);

      expect(events).toEqual(['start', 'update', 'end']);
      expect(points).toHaveLength(1);
      expect(points[0].distanceTo(new THREE.Vector3(3, 4, -1))).toBeLessThan(
        1e-12
      );
    }
  );

  it.each([
    {samples: 10, calls: 0},
    {samples: 11, calls: 1},
  ])(
    'requires more than ten retained samples ($samples)',
    ({samples, calls}) => {
      const backend = vi.spyOn(
        OneDollarUnistrokeRecognizer.prototype,
        'recognize'
      );
      const {recognition, frame} = createRecording();
      const onEnd = vi.fn();
      recognition.addEventListener('unistrokeend', onEnd);
      frame(0, Handedness.LEFT);
      for (let i = 0; i < samples; i++) {
        recognition.addPoint(new THREE.Vector3(i, 0, 0), 0.5);
      }
      frame(1000, null);

      expect(backend).toHaveBeenCalledTimes(calls);
      expect(onEnd).toHaveBeenCalledTimes(1);
      expect(onEnd.mock.calls[0][0].detail.result !== undefined).toBe(
        calls === 1
      );
    }
  );

  it('trims release jitter at the end-delay boundary before counting samples', () => {
    const backend = vi.spyOn(
      OneDollarUnistrokeRecognizer.prototype,
      'recognize'
    );
    const {recognition, frame} = createRecording();
    frame(0, Handedness.LEFT);
    for (let i = 0; i < 10; i++) {
      recognition.addPoint(new THREE.Vector3(i, 0, 0), 0.5);
    }
    recognition.addPoint(new THREE.Vector3(10, 0, 0), 0.8);
    recognition.addPoint(new THREE.Vector3(1000, 1000, 0), 0.801);
    frame(1000, null);

    expect(backend).toHaveBeenCalledTimes(1);
    expect(backend.mock.calls[0][0]).toEqual(
      Array.from({length: 11}, (_, x) => ({x, y: 0}))
    );
  });

  it('does not count discarded release jitter toward the minimum stroke size', () => {
    const backend = vi.spyOn(
      OneDollarUnistrokeRecognizer.prototype,
      'recognize'
    );
    const {recognition, frame} = createRecording();
    const onEnd = vi.fn();
    recognition.addEventListener('unistrokeend', onEnd);
    frame(0, Handedness.LEFT);
    for (let i = 0; i < 10; i++) {
      recognition.addPoint(new THREE.Vector3(i, 0, 0), 0.5);
    }
    recognition.addPoint(new THREE.Vector3(1000, 1000, 0), 0.801);
    frame(1000, null);

    expect(backend).not.toHaveBeenCalled();
    expect(onEnd).toHaveBeenCalledTimes(1);
    expect(onEnd.mock.calls[0][0].detail.result).toBeUndefined();
  });

  it('caps captured points and snapshots reused position objects', () => {
    const backend = vi.spyOn(
      OneDollarUnistrokeRecognizer.prototype,
      'recognize'
    );
    const {recognition, frame} = createRecording(
      new StrokeRecognitionOptions({maxPoints: 11})
    );
    frame(0, Handedness.RIGHT);
    const point = new THREE.Vector3();
    for (let i = 0; i < 20; i++) {
      point.set(i, 0, 0);
      recognition.addPoint(point, 0.5);
    }
    point.set(1000, 1000, 1000);
    frame(1000, null);

    expect(backend.mock.calls[0][0]).toEqual(
      Array.from({length: 11}, (_, x) => ({x, y: 0}))
    );
  });

  it('preserves in-plane distances when projecting an oblique world-space stroke', () => {
    const backend = vi.spyOn(
      OneDollarUnistrokeRecognizer.prototype,
      'recognize'
    );
    const {recognition, frame} = createRecording();
    const transform = new THREE.Matrix4().compose(
      new THREE.Vector3(3, -2, 5),
      new THREE.Quaternion().setFromEuler(new THREE.Euler(0.7, -0.6, 1.1)),
      new THREE.Vector3(1, 1, 1)
    );
    const local = Array.from({length: 21}, (_, i) => {
      const angle = (i / 20) * Math.PI * 2;
      return new THREE.Vector3(Math.cos(angle), Math.sin(angle) * 0.6, 0);
    });
    frame(0, Handedness.LEFT);
    for (const point of local) {
      recognition.addPoint(point.clone().applyMatrix4(transform), 0.5);
    }
    frame(1000, null);

    expect(backend).toHaveBeenCalledTimes(1);
    const projected = backend.mock.calls[0][0];
    expect(projected).toHaveLength(local.length);
    for (let i = 0; i < local.length; i++) {
      for (let j = i + 1; j < local.length; j++) {
        const actual = Math.hypot(
          projected[i].x - projected[j].x,
          projected[i].y - projected[j].y
        );
        expect(actual).toBeCloseTo(local[i].distanceTo(local[j]), 10);
      }
    }
  });

  it('uses camera-local coordinates for a collinear stroke', () => {
    const backend = vi.spyOn(
      OneDollarUnistrokeRecognizer.prototype,
      'recognize'
    );
    const {recognition, camera, frame} = createRecording();
    camera.position.set(4, 2, 3);
    camera.rotation.set(0.4, 0.8, -0.2);
    camera.updateMatrixWorld(true);
    frame(0, Handedness.LEFT);
    for (let i = 0; i < 11; i++) {
      const local = new THREE.Vector3(i * 0.1, i * 0.2, -2);
      recognition.addPoint(local.applyMatrix4(camera.matrixWorld), 0.5);
    }
    frame(1000, null);

    expect(backend).toHaveBeenCalledTimes(1);
    const projected = backend.mock.calls[0][0];
    expect(projected).toHaveLength(11);
    projected.forEach((point, i) => {
      expect(point.x).toBeCloseTo(i * 0.1, 10);
      expect(point.y).toBeCloseTo(i * 0.2, 10);
    });
  });

  it('recognizes a triangle drawn by the tracked joint in an oblique plane', () => {
    const {recognition, joints, frame} = createRecording();
    const onEnd = vi.fn();
    recognition.addEventListener('unistrokeend', onEnd);
    const vertices = [
      new THREE.Vector3(-0.2, 0, 0),
      new THREE.Vector3(0, 0.4, 0),
      new THREE.Vector3(0.2, 0, 0),
      new THREE.Vector3(-0.2, 0, 0),
    ];
    const parent = new THREE.Group();
    parent.position.set(1, 2, -3);
    parent.rotation.set(0.8, 0.3, -0.5);
    parent.add(joints[Handedness.RIGHT]);
    frame(0, Handedness.RIGHT);
    for (let i = 0; i <= 60; i++) {
      const edge = Math.min(Math.floor(i / 20), 2);
      joints[Handedness.RIGHT].position.lerpVectors(
        vertices[edge],
        vertices[edge + 1],
        (i - edge * 20) / 20
      );
      frame(250 + i * 10, Handedness.RIGHT);
    }
    frame(1100, null);

    expect(onEnd).toHaveBeenCalledTimes(1);
    const result = onEnd.mock.calls[0][0].detail.result;
    expect(result.recognizedShape).toBe('Triangle');
    expect(result.confidence).toBeGreaterThan(0.95);
  });
});
