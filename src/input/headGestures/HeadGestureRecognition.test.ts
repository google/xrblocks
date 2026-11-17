import * as THREE from 'three';
import {expect, it} from 'vitest';
import {HeadGestureRecognition} from './HeadGestureRecognition';
import {HeadGestureRecognitionOptions} from './HeadGestureRecognitionOptions';

it('emits one nod per motion and ignores a discontinuous camera jump', async () => {
  const camera = new THREE.Camera();
  const options = new HeadGestureRecognitionOptions().enable();
  // Listen to the application gesture, rather than its directional variants.
  for (const name of Object.keys(options.gestures))
    options.setGestureEnabled(name, name === 'nod');
  const recognition = new HeadGestureRecognition();
  await recognition.init({camera, options});
  const gestures: string[] = [];
  recognition.addEventListener('gesture', ({detail}) =>
    gestures.push(detail.name)
  );
  const frame = (time: number, pitch: number) => {
    camera.rotation.x = pitch;
    recognition.update(time);
  };
  const nod = (start: number) => {
    for (let t = 0; t <= 1100; t += 25) {
      const pitch =
        t < 300 || t > 800 ? 0 : Math.sin(((t - 300) / 500) * Math.PI) * 0.45;
      frame(start + t, pitch);
    }
  };
  try {
    nod(0);
    expect(gestures).toEqual(['nod']);
    for (let t = 1125; t <= 3000; t += 25) frame(t, 0);
    nod(3025);
    expect(gestures).toEqual(['nod', 'nod']);
    frame(4150, Math.PI);
    for (let t = 4175; t <= 5200; t += 25) frame(t, Math.PI);
    expect(gestures).toEqual(['nod', 'nod']);
  } finally {
    recognition.dispose();
  }
});
