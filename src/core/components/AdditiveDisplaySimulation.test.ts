import {describe, expect, it, vi} from 'vitest';
import * as THREE from 'three';

import {Options} from '../Options';
import {AdditiveDisplaySimulation} from './AdditiveDisplaySimulation';

const NO_DIMMING = 0;
const PARTIAL_DIMMING = 0.4;
const FULL_DIMMING = 1;
const INVALID_DIMMING = 1.1;

function session(environmentBlendMode: XRSession['environmentBlendMode']) {
  return {environmentBlendMode} as XRSession;
}

describe('AdditiveDisplaySimulation', () => {
  it('uses a last-drawn, noninteractive blend mesh only in opted-in alpha sessions', () => {
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera();
    const options = new Options();
    options.simulateAdditiveDisplay = true;
    const simulation = new AdditiveDisplaySimulation(scene, camera, options);

    simulation.onXRSessionStarted(session('alpha-blend'));

    expect(simulation.parent).toBe(scene);
    expect(simulation).toMatchObject({
      frustumCulled: false,
      renderOrder: Number.MAX_SAFE_INTEGER,
      userData: {xrblocksAdditiveDisplaySimulation: true},
    });
    expect(simulation.material).toMatchObject({
      opacity: NO_DIMMING,
      premultipliedAlpha: true,
      blending: THREE.CustomBlending,
      blendEquation: THREE.AddEquation,
      blendSrc: THREE.ZeroFactor,
      blendDst: THREE.OneFactor,
      blendEquationAlpha: THREE.AddEquation,
      blendSrcAlpha: THREE.OneFactor,
      blendDstAlpha: THREE.ZeroFactor,
      depthTest: false,
      depthWrite: false,
    });
    const intersections: THREE.Intersection[] = [];
    simulation.raycast({} as THREE.Raycaster, intersections);
    expect(intersections).toEqual([]);

    simulation.onXRSessionEnded();
    expect(simulation.parent).toBeNull();
    simulation.onXRSessionStarted(session('additive'));
    expect(simulation.parent).toBeNull();
  });

  it('reads dimming every frame including both endpoints', () => {
    const options = new Options();
    options.simulateAdditiveDisplay = true;
    const simulation = new AdditiveDisplaySimulation(
      new THREE.Scene(),
      new THREE.Camera(),
      options
    );
    simulation.onXRSessionStarted(session('alpha-blend'));
    expect(simulation.material.opacity).toBe(NO_DIMMING);

    options.simulatedDimming = PARTIAL_DIMMING;
    simulation.update();
    expect(simulation.material.opacity).toBe(PARTIAL_DIMMING);

    options.simulatedDimming = FULL_DIMMING;
    simulation.update();
    expect(simulation.material.opacity).toBe(FULL_DIMMING);
  });

  it('validates the initial dimming during construction', () => {
    const options = new Options();
    options.simulateAdditiveDisplay = true;
    options.simulatedDimming = INVALID_DIMMING;

    expect(
      () =>
        new AdditiveDisplaySimulation(
          new THREE.Scene(),
          new THREE.Camera(),
          options
        )
    ).toThrow(RangeError);

    options.simulatedDimming = Number.NaN;
    expect(
      () =>
        new AdditiveDisplaySimulation(
          new THREE.Scene(),
          new THREE.Camera(),
          options
        )
    ).toThrow(RangeError);
  });

  it('keeps the last valid dimming and warns once for invalid mid-session values', () => {
    const warning = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const options = new Options();
    options.simulateAdditiveDisplay = true;
    options.simulatedDimming = PARTIAL_DIMMING;
    const simulation = new AdditiveDisplaySimulation(
      new THREE.Scene(),
      new THREE.Camera(),
      options
    );
    simulation.onXRSessionStarted(session('alpha-blend'));

    options.simulatedDimming = INVALID_DIMMING;
    expect(() => simulation.update()).not.toThrow();
    expect(() => simulation.update()).not.toThrow();
    expect(simulation.material.opacity).toBe(PARTIAL_DIMMING);
    expect(warning).toHaveBeenCalledOnce();

    options.simulatedDimming = 0.7;
    simulation.update();
    expect(simulation.material.opacity).toBe(0.7);
    warning.mockRestore();
  });

  it('disposes its detached resources', () => {
    const simulation = new AdditiveDisplaySimulation(
      new THREE.Scene(),
      new THREE.Camera(),
      new Options()
    );
    const disposeGeometry = vi.spyOn(simulation.geometry, 'dispose');
    const disposeMaterial = vi.spyOn(simulation.material, 'dispose');

    simulation.dispose();

    expect(disposeGeometry).toHaveBeenCalledOnce();
    expect(disposeMaterial).toHaveBeenCalledOnce();
  });
});
