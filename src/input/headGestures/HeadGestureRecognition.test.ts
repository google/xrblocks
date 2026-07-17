import * as THREE from 'three';
import {describe, expect, it, vi} from 'vitest';

import {HeadGestureRecognition} from './HeadGestureRecognition';
import {HeadGestureRecognitionOptions} from './HeadGestureRecognitionOptions';
import type {
  HeadGestureRecognizer,
  HeadGestureScoreMap,
} from './HeadGestureTypes';

describe('HeadGestureRecognition', () => {
  it('emits once per threshold crossing and rearms below release confidence', async () => {
    const recognizer = new SequenceRecognizer([
      {nod: {confidence: 0.8}},
      {nod: {confidence: 0.9}},
      {nod: {confidence: 0.2}},
      {nod: {confidence: 0.7}},
    ]);
    const options = createOptions(recognizer);
    const recognition = new HeadGestureRecognition();
    await recognition.init({camera: new THREE.Camera(), options});
    const listener = vi.fn();
    recognition.addEventListener('gesture', listener);

    recognition.update(0);
    recognition.update(16);
    recognition.update(32);
    recognition.update(48);

    expect(listener).toHaveBeenCalledTimes(2);
    expect(listener.mock.calls.map(([event]) => event.detail.name)).toEqual([
      'nod',
      'nod',
    ]);
  });

  it('emits every configured gesture above the confidence threshold', async () => {
    const recognizer = new SequenceRecognizer([
      {nod: {confidence: 0.8}, shake: {confidence: 0.9}},
    ]);
    const options = createOptions(recognizer, ['nod', 'shake']);
    const recognition = new HeadGestureRecognition();
    await recognition.init({camera: new THREE.Camera(), options});
    const names: string[] = [];
    recognition.addEventListener('gesture', (event) => {
      names.push(event.detail.name);
    });

    recognition.update(0);

    expect(names).toEqual(['nod', 'shake']);
  });

  it('clears history and waits through warmup after a pose discontinuity', async () => {
    const recognizer = new SequenceRecognizer([{nod: {confidence: 0.8}}]);
    const options = createOptions(recognizer);
    options.warmupDurationMs = 100;
    const camera = new THREE.Camera();
    const recognition = new HeadGestureRecognition();
    await recognition.init({camera, options});
    const listener = vi.fn();
    recognition.addEventListener('gesture', listener);

    recognition.update(0);
    recognition.update(100);
    expect(listener).toHaveBeenCalledTimes(1);

    camera.rotation.y = Math.PI;
    camera.updateMatrixWorld(true);
    recognition.update(116);
    recognition.update(200);
    expect(listener).toHaveBeenCalledTimes(1);

    recognition.update(216);
    expect(listener).toHaveBeenCalledTimes(2);
  });
});

class SequenceRecognizer implements HeadGestureRecognizer {
  private index = 0;

  constructor(private scores: HeadGestureScoreMap[]) {}

  recognize() {
    const score = this.scores[Math.min(this.index, this.scores.length - 1)];
    this.index++;
    return score;
  }
}

function createOptions(recognizer: HeadGestureRecognizer, gestures = ['nod']) {
  const options = new HeadGestureRecognitionOptions()
    .setGestureRecognizer(recognizer)
    .enable();
  options.updateIntervalMs = 0;
  options.warmupDurationMs = 0;
  for (const gesture of gestures) {
    options.setGestureEnabled(gesture, true);
  }
  return options;
}
