import * as THREE from 'three';
import {describe, expect, it} from 'vitest';

import {Options} from '../Options';
import {RendererHolder, type WebGLOrWebGPURenderer} from '../RendererTypes';

import {XRTransition} from './XRTransition';

describe('XRTransition', () => {
  it('disables both depthTest and depthWrite so the 1m background sphere never occludes scene geometry on WebGPU', () => {
    const transition = new XRTransition();
    expect(transition.material.depthTest).toBe(false);
    expect(transition.material.depthWrite).toBe(false);
    expect(transition.renderOrder).toBe(-Infinity);
    transition.dispose();
  });

  it('tracks active camera position and transitions between AR and VR opacity', () => {
    const transition = new XRTransition();
    const camera = new THREE.PerspectiveCamera();
    camera.position.set(1, 2, 3);
    camera.updateMatrixWorld();

    const scene = new THREE.Scene();
    const options = new Options();
    options.transition.transitionTime = 1.0;
    options.transition.defaultBackgroundColor = 0x112233;

    const fakeRenderer = {
      xr: {isPresenting: false, getCamera: () => camera},
    } as unknown as WebGLOrWebGPURenderer;
    const timer = {getDelta: () => 0.5} as unknown as THREE.Timer;

    transition.init({
      rendererHolder: new RendererHolder(fakeRenderer),
      camera,
      timer,
      scene,
      options,
    });

    transition.toVR({color: 0x000000});
    transition.update();

    expect(transition.currentMode).toBe('VR');
    expect(transition.position.toArray()).toEqual([1, 2, 3]);
    expect(transition.material.opacity).toBeCloseTo(0.5);

    transition.toAR();
    expect(transition.currentMode).toBe('AR');
    transition.dispose();
  });
});
