import * as THREE from 'three';
import {afterEach, expect, it, vi} from 'vitest';
import {Options} from '../Options';
import {AdditiveDisplaySimulation} from './AdditiveDisplaySimulation';

afterEach(() => vi.restoreAllMocks());

it('activates only for opted-in alpha sessions and follows current dimming and camera position', () => {
  const options = new Options();
  options.simulateAdditiveDisplay = true;
  options.simulatedDimming = 0.4;
  const scene = new THREE.Scene();
  const camera = new THREE.Camera();
  const simulation = new AdditiveDisplaySimulation(scene, camera, options);
  try {
    simulation.onXRSessionStarted({
      environmentBlendMode: 'alpha-blend',
    } as XRSession);
    expect(simulation.parent).toBe(scene);
    expect(simulation.material.opacity).toBe(0.4);
    camera.position.set(1, 2, -3);
    camera.updateMatrixWorld(true);
    options.simulatedDimming = 0.7;
    simulation.update();
    expect(simulation.position.toArray()).toEqual([1, 2, -3]);
    expect(simulation.material.opacity).toBe(0.7);
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    options.simulatedDimming = NaN;
    simulation.update();
    expect(simulation.material.opacity).toBe(0.7);
    const hits: THREE.Intersection[] = [];
    simulation.raycast(new THREE.Raycaster(), hits);
    expect(hits).toEqual([]);
    simulation.onXRSessionEnded();
    expect(simulation.parent).toBeNull();
    simulation.onXRSessionStarted({
      environmentBlendMode: 'additive',
    } as XRSession);
    expect(simulation.parent).toBeNull();
    options.simulateAdditiveDisplay = false;
    simulation.onXRSessionStarted({
      environmentBlendMode: 'alpha-blend',
    } as XRSession);
    expect(simulation.parent).toBeNull();
  } finally {
    simulation.dispose();
  }
});

it('detaches and releases its owned graphics resources', () => {
  const scene = new THREE.Scene();
  const simulation = new AdditiveDisplaySimulation(
    scene,
    new THREE.Camera(),
    new Options()
  );
  scene.add(simulation);
  const geometryDisposed = vi.fn();
  const materialDisposed = vi.fn();
  simulation.geometry.addEventListener('dispose', geometryDisposed);
  simulation.material.addEventListener('dispose', materialDisposed);
  simulation.dispose();
  expect(simulation.parent).toBeNull();
  expect(geometryDisposed).toHaveBeenCalledOnce();
  expect(materialDisposed).toHaveBeenCalledOnce();
});
