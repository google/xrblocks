import * as THREE from 'three';
import {describe, expect, it} from 'vitest';

import type {HeadPoseSample} from '../HeadGestureTypes';
import {HeuristicHeadGestureRecognizer} from './HeuristicHeadGestureRecognizer';

type PoseAngles = {
  pitch?: number;
  yaw?: number;
  roll?: number;
};

describe('HeuristicHeadGestureRecognizer', () => {
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
