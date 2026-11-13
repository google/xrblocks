import {beforeAll, expect, it, vi} from 'vitest';
import * as THREE from 'three';

import {ScriptsManager} from '../core/components/ScriptsManager';
import {DepthMesh} from './DepthMesh';
import {DepthOptions} from './DepthOptions';
import {DepthTextures} from './DepthTextures';

// This package's main entry is CommonJS despite declaring type: module.
const {default: RAPIER} = await vi.importActual<
  typeof import('@dimforge/rapier3d-simd-compat')
>('@dimforge/rapier3d-simd-compat/rapier.es.js');

beforeAll(async () => {
  await RAPIER.init();
});

it('retains Core-owned resources across Script removal and re-addition', async () => {
  const options = new DepthOptions();
  const textures = new DepthTextures(options);
  const mesh = new DepthMesh(options, 2, 2, textures);
  const geometry = mesh.downsampledGeometry;
  const world = new RAPIER.World({x: 0, y: -9.81, z: 0});
  const scene = new THREE.Scene();
  const manager = new ScriptsManager(async () => {
    mesh.init({renderer: {} as THREE.WebGLRenderer});
  });
  try {
    mesh.initRapierPhysics(RAPIER, world);
    scene.add(mesh);
    await manager.syncScriptsWithScene(scene);
    mesh.removeFromParent();
    await manager.syncScriptsWithScene(scene);
    scene.add(mesh);
    await manager.syncScriptsWithScene(scene);

    expect(world.bodies.len()).toBe(1);
    expect(world.colliders.len()).toBe(1);
    expect(mesh.downsampledGeometry).toBe(geometry);
  } finally {
    await manager.dispose();
    mesh.disposeResources();
    world.free();
  }
});

it('removes its own physics body and releases geometry without touching another body', () => {
  const world = new RAPIER.World({x: 0, y: -9.81, z: 0}),
    mesh = new DepthMesh(new DepthOptions(), 4, 4);
  const other = world.createRigidBody(RAPIER.RigidBodyDesc.fixed());
  const geometry = vi.spyOn(mesh.geometry, 'dispose'),
    material = vi.spyOn(mesh.material as THREE.Material, 'dispose');
  try {
    mesh.initRapierPhysics(RAPIER, world);
    expect(world.bodies.len()).toBe(2);
    mesh.disposeResources();
    mesh.disposeResources();
    expect(world.bodies.len()).toBe(1);
    expect(world.getRigidBody(other.handle)).toBe(other);
    expect(world.colliders.len()).toBe(0);
    expect(geometry).toHaveBeenCalledOnce();
    expect(material).toHaveBeenCalledOnce();
  } finally {
    mesh.disposeResources();
    world.free();
  }
});
it('raycasts measured depth after the depth camera moves and turns', () => {
  const mesh = new DepthMesh(
    new DepthOptions({
      depthMesh: {depthFullResolution: 8, ignoreEdgePixels: 0},
    }),
    8,
    8
  );
  const camera = new THREE.PerspectiveCamera(90, 1, 0.1, 10);
  try {
    mesh.updateDepth(
      {
        width: 8,
        height: 8,
        data: new Float32Array(64).fill(2).buffer,
        rawValueToMeters: 1,
      } as XRCPUDepthInformation,
      camera.projectionMatrixInverse,
      'float32'
    );
    mesh.updatePose(
      new THREE.Vector3(1, 2, 3),
      new THREE.Quaternion().setFromAxisAngle(
        new THREE.Vector3(0, 1, 0),
        Math.PI / 2
      )
    );
    const origin = new THREE.Vector3(1, 2, 3),
      hits: THREE.Intersection[] = [];
    mesh.raycast(
      new THREE.Raycaster(origin, new THREE.Vector3(-1, 0, 0)),
      hits
    );
    expect(hits.length).toBeGreaterThan(0);
    expect(hits[0].point.x).toBeCloseTo(-1);
    expect(hits[0].point.y).toBeCloseTo(2);
    expect(hits[0].point.z).toBeCloseTo(3);
    expect(hits[0].distance).toBeCloseTo(2);
    const missed: THREE.Intersection[] = [];
    mesh.raycast(
      new THREE.Raycaster(origin, new THREE.Vector3(1, 0, 0)),
      missed
    );
    expect(missed).toEqual([]);
  } finally {
    mesh.disposeResources();
  }
});
