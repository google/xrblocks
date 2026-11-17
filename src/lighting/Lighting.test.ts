import * as THREE from 'three';
import {expect, it} from 'vitest';
import {Lighting} from './Lighting';
import {LightingOptions} from './LightingOptions';
it('updates scene lights from native estimates and removes them on dispose', async () => {
  let frame: ((time: number, frame: XRFrame) => void) | undefined;
  const session = {
    requestLightProbe: async () => ({}),
    requestAnimationFrame(callback: typeof frame) {
      frame = callback;
      return 1;
    },
  };
  const xr = Object.assign(new THREE.EventDispatcher(), {
    getSession: () => session,
  });
  const renderer = {
    xr,
    shadowMap: {enabled: false, type: THREE.BasicShadowMap},
  };
  const scene = new THREE.Scene(),
    lighting = new Lighting();
  try {
    lighting.init(
      new LightingOptions({
        enabled: true,
        useDirectionalLight: true,
        useAmbientSH: true,
      }),
      renderer as never,
      scene
    );
    xr.dispatchEvent({type: 'sessionstart'} as never);
    await Promise.resolve();
    frame!(0, {
      session,
      getLightEstimate: () => ({
        primaryLightIntensity: {x: 2, y: 1, z: 0.5},
        primaryLightDirection: {x: 0, y: 1, z: -1},
        sphericalHarmonicsCoefficients: new Float32Array(27).fill(0.25),
      }),
    } as unknown as XRFrame);
    lighting.update();
    expect(lighting.dirLight.intensity).toBe(2);
    expect(lighting.dirLight.color.toArray()).toEqual([1, 0.5, 0.25]);
    expect(lighting.ambientLight.toArray()).toEqual([0.25, 0.25, 0.25]);
    expect(lighting.dirLight.parent?.parent).toBe(scene);
    lighting.dispose();
    expect(scene.children).toEqual([]);
    expect(Lighting.instance).toBeUndefined();
  } finally {
    xr.dispatchEvent({type: 'sessionend'} as never);
    lighting.dispose();
    frame = undefined;
  }
});
