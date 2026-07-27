import * as THREE from 'three';
import {describe, expect, it} from 'vitest';

import {HeadGestureRecognitionOptions} from '../HeadGestureRecognitionOptions';
import type {HeadPoseSample} from '../HeadGestureTypes';
import {HeuristicHeadGestureRecognizer} from './HeuristicHeadGestureRecognizer';

type PoseAngles = {
  pitch?: number;
  yaw?: number;
  roll?: number;
};

describe('HeuristicHeadGestureRecognizer', () => {
  it.each([1, -1])('recognizes a nod starting in direction %s', (direction) => {
    const recognizer = new HeuristicHeadGestureRecognizer();
    const samples = createSamples(900, (time) => ({
      pitch:
        direction *
        piecewise(time, [
          [0, 300, 0, 0],
          [300, 550, 0, degrees(25)],
          [550, 800, degrees(25), 0],
          [800, 900, 0, 0],
        ]),
    }));

    const scores = recognizer.recognize({samples});
    const result = scores.nod;
    const directionalName = direction > 0 ? 'nod-up' : 'nod-down';
    const oppositeName = direction > 0 ? 'nod-down' : 'nod-up';

    expect(result?.confidence).toBeGreaterThanOrEqual(0.6);
    expect(result?.data?.initialDirection).toBe(direction > 0 ? 'up' : 'down');
    expect(scores[directionalName]).toEqual(result);
    expect(scores[oppositeName]).toBeUndefined();
  });

  it.each([1, -1])(
    'recognizes a shake starting in direction %s',
    (direction) => {
      const recognizer = new HeuristicHeadGestureRecognizer();
      const samples = createSamples(850, (time) => ({
        yaw:
          direction *
          piecewise(time, [
            [0, 250, 0, 0],
            [250, 500, 0, degrees(18)],
            [500, 750, degrees(18), 0],
            [750, 850, 0, 0],
          ]),
      }));

      const scores = recognizer.recognize({samples});
      const result = scores.shake;
      const directionalName = direction > 0 ? 'shake-left' : 'shake-right';
      const oppositeName = direction > 0 ? 'shake-right' : 'shake-left';

      expect(result?.confidence).toBeGreaterThanOrEqual(0.6);
      expect(result?.data?.initialDirection).toBe(
        direction > 0 ? 'left' : 'right'
      );
      expect(scores[directionalName]).toEqual(result);
      expect(scores[oppositeName]).toBeUndefined();
    }
  );

  it('does not recognize a one-way look as a completed gesture', () => {
    const recognizer = new HeuristicHeadGestureRecognizer();
    const samples = createSamples(1000, (time) => ({
      yaw: piecewise(time, [
        [0, 300, 0, 0],
        [300, 1000, 0, degrees(35)],
      ]),
    }));

    const scores = recognizer.recognize({samples});

    expect(scores.nod).toBeUndefined();
    expect(scores.shake).toBeUndefined();
  });

  it('does not recognize a slow nod', () => {
    const recognizer = new HeuristicHeadGestureRecognizer();
    const samples = createSamples(1800, (time) => ({
      pitch: piecewise(time, [
        [0, 300, 0, 0],
        [300, 1000, 0, degrees(20)],
        [1000, 1700, degrees(20), 0],
        [1700, 1800, 0, 0],
      ]),
    }));

    expect(recognizer.recognize({samples}).nod).toBeUndefined();
  });

  it('supports custom registered detectors without built-ins', () => {
    const recognizer = new HeuristicHeadGestureRecognizer(
      false
    ).registerGesture('custom', () => ({confidence: 0.75}), {
      enabled: true,
      threshold: 1,
    });

    expect(recognizer.getGestureConfigurations()).toEqual({
      custom: {enabled: true, threshold: 1},
    });
    expect(recognizer.recognize({samples: []})).toEqual({
      custom: {confidence: 0.75},
    });
  });

  it('uses configuration updates supplied after registration', () => {
    const recognizer = new HeuristicHeadGestureRecognizer();
    const updated = {enabled: true, threshold: degrees(30)};
    const options = new HeadGestureRecognitionOptions().setGestureRecognizer(
      recognizer
    );

    options.setGestureConfig('nod', updated);

    expect(recognizer.getGestureConfigurations().nod).toEqual(updated);
  });
});

function createSamples(
  durationMs: number,
  getAngles: (timestamp: number) => PoseAngles
): HeadPoseSample[] {
  const samples: HeadPoseSample[] = [];
  for (let timestamp = 0; timestamp <= durationMs; timestamp += 25) {
    const {pitch = 0, yaw = 0, roll = 0} = getAngles(timestamp);
    samples.push({
      timestamp,
      position: new THREE.Vector3(),
      orientation: new THREE.Quaternion().setFromEuler(
        new THREE.Euler(pitch, yaw, roll, 'YXZ')
      ),
    });
  }
  return samples;
}

function piecewise(
  time: number,
  segments: Array<[number, number, number, number]>
) {
  const segment =
    segments.find(([start, end]) => time >= start && time <= end) ??
    segments.at(-1)!;
  const [start, end, startValue, endValue] = segment;
  const alpha = THREE.MathUtils.clamp(
    (time - start) / (end - start || 1),
    0,
    1
  );
  return THREE.MathUtils.lerp(startValue, endValue, alpha);
}

function degrees(value: number) {
  return THREE.MathUtils.degToRad(value);
}
