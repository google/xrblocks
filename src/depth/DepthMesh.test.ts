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

  it('hides the depth plane and removes its colliders when depth is unavailable', () => {
    const world = new RAPIER.World({x: 0, y: -9.81, z: 0});
    const mesh = new DepthMesh(new DepthOptions(), 2, 2);
    mesh.initRapierPhysics(RAPIER, world);
    expect(world.colliders.len()).toBe(1);

    mesh.setDepthAvailable(false);

    expect(mesh.visible).toBe(false);
    expect(world.colliders.len()).toBe(0);

    mesh.disposeResources();
    world.free();
  });

  it('does not create a collider when physics initializes before depth arrives', () => {
    const world = new RAPIER.World({x: 0, y: -9.81, z: 0});
    const mesh = new DepthMesh(new DepthOptions(), 2, 2);
    mesh.setDepthAvailable(false);

    mesh.initRapierPhysics(RAPIER, world);

    expect(mesh.visible).toBe(false);
    expect(world.bodies.len()).toBe(1);
    expect(world.colliders.len()).toBe(0);

    mesh.disposeResources();
    world.free();
  });

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

  it('only bumps full-resolution geometry position version when updateFullResolutionGeometry is enabled', () => {
    const mesh = new DepthMesh(
      new DepthOptions({
        depthMesh: {
          useDownsampledGeometry: true,
          updateFullResolutionGeometry: false,
        },
      }),
      2,
      2
    );
    const fullPosAttr = mesh.geometry.attributes.position as unknown as {
      version: number;
    };
    const downsampledPosAttr = mesh.downsampledGeometry!.attributes
      .position as unknown as {version: number};
    const initialFullVersion = fullPosAttr.version;
    const initialDownsampledVersion = downsampledPosAttr.version;

    const depthData = {
      width: 2,
      height: 2,
      rawValueToMeters: 1,
      data: new Float32Array([1, 1, 1, 1]).buffer,
    } as XRCPUDepthInformation;

    mesh.updateDepth(depthData, new THREE.Matrix4(), 'float32');
    expect(fullPosAttr.version).toBe(initialFullVersion);
    expect(downsampledPosAttr.version).toBeGreaterThan(
      initialDownsampledVersion
    );

    mesh.updateFullResolutionGeometry(depthData, 'float32');
    expect(fullPosAttr.version).toBeGreaterThan(initialFullVersion);
    mesh.disposeResources();
  });
});

describe('DepthMesh raycast', () => {
  it('matches brute-force Three.js Mesh.raycast across hits, grazing multi-hits, poses, and misses', () => {
    const options = new DepthOptions({
      depthMesh: {
        useDownsampledGeometry: true,
        updateFullResolutionGeometry: false,
        patchHoles: true,
      },
    });
    const width = 16;
    const height = 16;
    const mesh = new DepthMesh(options, width, height);

    // Create a varying depth surface (1.5m to 3.5m) with hills/ridges
    const rawDepth = new Float32Array(width * height);
    for (let y = 0; y < height; ++y) {
      for (let x = 0; x < width; ++x) {
        rawDepth[y * width + x] =
          2.2 + 0.6 * Math.sin(x * 0.5) * Math.cos(y * 0.4);
      }
    }
    const depthData = {
      width,
      height,
      rawValueToMeters: 1,
      data: rawDepth.buffer,
    } as XRCPUDepthInformation;

    const camera = new THREE.PerspectiveCamera(70, 1.0, 0.1, 10);
    camera.updateProjectionMatrix();
    mesh.updateDepth(
      depthData,
      camera.projectionMatrixInverse.clone(),
      'float32'
    );

    // Apply a non-trivial world pose
    mesh.updatePose(
      new THREE.Vector3(0.3, 1.4, -0.2),
      new THREE.Quaternion().setFromEuler(new THREE.Euler(0.1, -0.25, 0.05))
    );

    const testRays = [
      // Center hit
      {
        origin: new THREE.Vector3(0.3, 1.4, -0.2),
        dir: new THREE.Vector3(0, 0, -1).applyEuler(
          new THREE.Euler(0.1, -0.25, 0.05)
        ),
      },
      // Off-center controller-like ray
      {
        origin: new THREE.Vector3(0.55, 1.1, -0.1),
        dir: new THREE.Vector3(-0.15, 0.1, -1).normalize(),
      },
      // Steep diagonal ray across grid columns & rows
      {
        origin: new THREE.Vector3(-0.4, 1.8, 0.1),
        dir: new THREE.Vector3(0.35, -0.28, -1).normalize(),
      },
      // Grazing ray across the wavy depth surface
      {
        origin: new THREE.Vector3(-1.2, 1.4, -2.3),
        dir: new THREE.Vector3(1.0, 0.05, -0.15).normalize(),
      },
      // Miss ray pointing away
      {
        origin: new THREE.Vector3(0.3, 1.4, -0.2),
        dir: new THREE.Vector3(0, 0, 1),
      },
      // Miss ray outside frustum
      {
        origin: new THREE.Vector3(5, 5, 0),
        dir: new THREE.Vector3(0, 1, 0),
      },
    ];

    const downsampledSpy = vi.spyOn(mesh.downsampledMesh!, 'raycast');

    for (const {origin, dir} of testRays) {
      const raycaster = new THREE.Raycaster(origin, dir, 0.05, 10);
      const fastIntersects: THREE.Intersection[] = [];
      mesh.raycast(raycaster, fastIntersects);

      // Compute reference brute-force intersections directly on downsampledMesh
      const refIntersects: THREE.Intersection[] = [];
      THREE.Mesh.prototype.raycast.call(
        mesh.downsampledMesh,
        raycaster,
        refIntersects
      );

      expect(fastIntersects.length).toBe(refIntersects.length);
      for (let i = 0; i < refIntersects.length; ++i) {
        expect(fastIntersects[i].object).toBe(mesh);
        expect(fastIntersects[i].faceIndex).toBe(refIntersects[i].faceIndex);
        expect(fastIntersects[i].distance).toBeCloseTo(
          refIntersects[i].distance,
          5
        );
        expect(fastIntersects[i].point.x).toBeCloseTo(
          refIntersects[i].point.x,
          5
        );
        expect(fastIntersects[i].point.y).toBeCloseTo(
          refIntersects[i].point.y,
          5
        );
        expect(fastIntersects[i].point.z).toBeCloseTo(
          refIntersects[i].point.z,
          5
        );
        expect(fastIntersects[i].normal!.x).toBeCloseTo(
          refIntersects[i].face!.normal.x,
          5
        );
        expect(fastIntersects[i].normal!.y).toBeCloseTo(
          refIntersects[i].face!.normal.y,
          5
        );
        expect(fastIntersects[i].normal!.z).toBeCloseTo(
          refIntersects[i].face!.normal.z,
          5
        );
      }
    }

    // Fast path should not delegate to downsampledMesh.raycast
    expect(downsampledSpy).not.toHaveBeenCalled();
    mesh.disposeResources();
  });
});
