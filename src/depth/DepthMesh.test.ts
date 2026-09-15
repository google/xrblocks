import {beforeAll, describe, expect, it, vi} from 'vitest';
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

describe('DepthMesh disposal', () => {
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
      expect(mesh['depthTextures']).toBe(textures);
    } finally {
      await manager.dispose();
      mesh.disposeResources();
      world.free();
    }
  });

  it.each([false, true])(
    'disposes owned geometry and the shared material once (downsampled: %s)',
    (useDownsampledGeometry) => {
      const mesh = new DepthMesh(
        new DepthOptions({depthMesh: {useDownsampledGeometry}}),
        2,
        2
      );
      const geometryDispose = vi.spyOn(mesh.geometry, 'dispose');
      const materialDispose = vi.spyOn(
        mesh.material as THREE.Material,
        'dispose'
      );
      const downsampledDispose = mesh.downsampledGeometry
        ? vi.spyOn(mesh.downsampledGeometry, 'dispose')
        : undefined;

      mesh.disposeResources();
      mesh.disposeResources();

      expect(geometryDispose).toHaveBeenCalledOnce();
      expect(materialDispose).toHaveBeenCalledOnce();
      if (downsampledDispose) {
        expect(downsampledDispose).toHaveBeenCalledOnce();
      }
      expect(mesh.downsampledMesh).toBeUndefined();
      expect(mesh.downsampledGeometry).toBeUndefined();
    }
  );

  it.each([false, true])(
    'removes only its rigid body and attached colliders (dual: %s)',
    (useDualCollider) => {
      const world = new RAPIER.World({x: 0, y: -9.81, z: 0});
      const mesh = new DepthMesh(
        new DepthOptions({depthMesh: {useDualCollider}}),
        2,
        2
      );
      const otherBody = world.createRigidBody(RAPIER.RigidBodyDesc.fixed());
      mesh.initRapierPhysics(RAPIER, world);
      const colliderHandles = mesh['collider']
        ? [mesh['collider'].handle]
        : mesh['colliders'].map((collider) => collider.handle);
      expect(world.bodies.len()).toBe(2);
      expect(world.colliders.len()).toBe(useDualCollider ? 2 : 1);

      mesh.disposeResources();
      mesh.disposeResources();

      expect(world.bodies.len()).toBe(1);
      expect(world.getRigidBody(otherBody.handle)).toBe(otherBody);
      expect(world.colliders.len()).toBe(0);
      for (const handle of colliderHandles) {
        expect(mesh.getColliderFromHandle(handle)).toBeUndefined();
      }
      world.free();
    }
  );

  it('still disposes its material if geometry disposal throws', () => {
    const mesh = new DepthMesh(new DepthOptions(), 2, 2);
    vi.spyOn(mesh.geometry, 'dispose').mockImplementation(() => {
      throw new Error('geometry disposal failed');
    });
    const materialDispose = vi.spyOn(
      mesh.material as THREE.Material,
      'dispose'
    );

    expect(() => mesh.disposeResources()).toThrow('geometry disposal failed');
    expect(materialDispose).toHaveBeenCalledOnce();
  });
});
