import {afterEach, beforeAll, describe, expect, it, vi} from 'vitest';
import * as THREE from 'three';

import {Registry} from '../core/components/Registry';
import {Depth} from './Depth';
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

afterEach(() => {
  Depth.instance = undefined;
  vi.restoreAllMocks();
});

function createDepth() {
  Depth.instance = undefined;
  const depth = new Depth();
  const registry = new Registry();
  const scene = new THREE.Scene();
  const renderer = {
    xr: {getCamera: () => ({cameras: []})},
  } as unknown as THREE.WebGLRenderer;
  depth.init(
    new THREE.PerspectiveCamera(),
    new DepthOptions({
      enabled: true,
      depthMesh: {enabled: true},
      depthTexture: {enabled: true},
      occlusion: {enabled: true},
    }),
    renderer,
    registry,
    scene
  );
  return {depth, registry, scene};
}

describe('Depth disposal', () => {
  it('releases its children once, detaches the mesh, and clears cached data', () => {
    const {depth, registry, scene} = createDepth();
    const mesh = depth.depthMesh!;
    const textures = registry.get(DepthTextures)!;
    const meshDispose = vi.spyOn(mesh, 'disposeResources');
    const textureDispose = vi.spyOn(textures, 'dispose');
    const passDispose = vi.spyOn(depth['occlusionPass']!, 'dispose');
    const converterDispose = vi.spyOn(depth['gpuDepthConverter']!, 'dispose');
    const data = {
      width: 2,
      height: 2,
      rawValueToMeters: 1,
      data: new Float32Array([1, 2, 3, 4]).buffer,
    } as XRCPUDepthInformation;
    depth.updateCPUDepthData(data, 0, 'float32');
    depth.view.push({} as XRView);
    depth.gpuDepthData.push({} as XRWebGLDepthInformation);
    depth.resumeDepth({});
    depth.occludableShaders.add({
      uniforms: {},
      vertexShader: '',
      fragmentShader: '',
    });

    depth.dispose();
    depth.dispose();

    expect(meshDispose).toHaveBeenCalledOnce();
    expect(textureDispose).toHaveBeenCalledOnce();
    expect(passDispose).toHaveBeenCalledOnce();
    expect(converterDispose).toHaveBeenCalledOnce();
    expect(scene.children).not.toContain(mesh);
    expect(registry.get(DepthMesh)).toBeUndefined();
    expect(registry.get(DepthTextures)).toBeUndefined();
    expect(depth.depthMesh).toBeUndefined();
    expect(depth.getTexture(0)).toBeUndefined();
    expect(depth['gpuDepthConverter']).toBeUndefined();
    expect(depth['occlusionPass']).toBeUndefined();
    expect(depth.enabled).toBe(false);
    expect(depth.depthDataFormat).toBeUndefined();
    for (const values of [
      depth.view,
      depth.cpuDepthData,
      depth.gpuDepthData,
      depth.depthArray,
      depth.depthProjectionMatrices,
      depth.depthProjectionInverseMatrices,
      depth.depthViewMatrices,
      depth.depthViewProjectionMatrices,
      depth.depthCameraPositions,
      depth.depthCameraRotations,
      depth.normDepthBufferFromNormViewMatrices,
    ]) {
      expect(values).toHaveLength(0);
    }
    expect(depth['depthClients'].size).toBe(0);
    expect(depth.occludableShaders.size).toBe(0);
    expect(depth.getDepth(0.5, 0.5)).toBe(0);
    expect(() => depth.update()).not.toThrow();
  });

  it('is safe before initialization', () => {
    Depth.instance = undefined;
    const depth = new Depth();
    expect(() => depth.dispose()).not.toThrow();
    expect(() => depth.dispose()).not.toThrow();
  });

  it('is safe with optional mesh, textures, and occlusion disabled', () => {
    Depth.instance = undefined;
    const depth = new Depth();
    depth.init(
      new THREE.PerspectiveCamera(),
      new DepthOptions({enabled: true}),
      {} as THREE.WebGLRenderer,
      new Registry(),
      new THREE.Scene()
    );

    depth.dispose();
    depth.dispose();

    expect(depth['gpuDepthConverter']).toBeUndefined();
    expect(depth.enabled).toBe(false);
  });

  it('rejects reinitialization after terminal disposal', () => {
    const {depth, registry, scene} = createDepth();
    depth.dispose();

    expect(() =>
      depth.init(
        new THREE.PerspectiveCamera(),
        new DepthOptions(),
        {} as THREE.WebGLRenderer,
        registry,
        scene
      )
    ).toThrow('Depth cannot initialize after disposal.');
  });

  it('finishes other cleanups and reports the first failure', () => {
    const {depth, registry} = createDepth();
    const error = new Error('mesh disposal failed');
    vi.spyOn(depth.depthMesh!, 'disposeResources').mockImplementation(() => {
      throw error;
    });
    const disposeTextures = vi.spyOn(registry.get(DepthTextures)!, 'dispose');
    const disposePass = vi.spyOn(depth['occlusionPass']!, 'dispose');

    expect(() => depth.dispose()).toThrow(error);
    expect(disposeTextures).toHaveBeenCalledOnce();
    expect(disposePass).toHaveBeenCalledOnce();
    expect(registry.get(DepthMesh)).toBeUndefined();
    expect(depth.depthMesh).toBeUndefined();
    expect(() => depth.dispose()).not.toThrow();
  });

  it('finishes other cleanups when converter disposal throws and does not retry', () => {
    const {depth, registry, scene} = createDepth();
    const mesh = depth.depthMesh!;
    const error = new Error('converter disposal failed');
    const converterDispose = vi
      .spyOn(depth['gpuDepthConverter']!, 'dispose')
      .mockImplementation(() => {
        throw error;
      });
    const meshDispose = vi.spyOn(mesh, 'disposeResources');
    const textureDispose = vi.spyOn(registry.get(DepthTextures)!, 'dispose');
    const passDispose = vi.spyOn(depth['occlusionPass']!, 'dispose');

    expect(() => depth.dispose()).toThrow(error);
    expect(() => depth.dispose()).not.toThrow();

    expect(converterDispose).toHaveBeenCalledOnce();
    expect(meshDispose).toHaveBeenCalledOnce();
    expect(textureDispose).toHaveBeenCalledOnce();
    expect(passDispose).toHaveBeenCalledOnce();
    expect(scene.children).not.toContain(mesh);
    expect(registry.get(DepthMesh)).toBeUndefined();
    expect(registry.get(DepthTextures)).toBeUndefined();
    expect(depth['gpuDepthConverter']).toBeUndefined();
    expect(depth.depthMesh).toBeUndefined();
    expect(depth.enabled).toBe(false);
  });

  it.each(['removed', 'childremoved'] as const)(
    'releases GPU resources and physics when a %s listener throws',
    (eventType) => {
      const {depth, registry, scene} = createDepth();
      const mesh = depth.depthMesh!;
      const world = new RAPIER.World({x: 0, y: -9.81, z: 0});
      const error = new Error(`${eventType} listener failed`);
      const onRemove = () => {
        throw error;
      };
      if (eventType === 'removed') mesh.addEventListener('removed', onRemove);
      else scene.addEventListener('childremoved', onRemove);
      const geometryDispose = vi.spyOn(mesh.geometry, 'dispose');
      const downsampledDispose = vi.spyOn(mesh.downsampledGeometry!, 'dispose');
      const materialDispose = vi.spyOn(
        mesh.material as THREE.Material,
        'dispose'
      );
      const textureDispose = vi.spyOn(registry.get(DepthTextures)!, 'dispose');
      const passDispose = vi.spyOn(depth['occlusionPass']!, 'dispose');
      try {
        mesh.initRapierPhysics(RAPIER, world);
        expect(world.bodies.len()).toBe(1);
        expect(world.colliders.len()).toBe(1);

        expect(() => depth.dispose()).toThrow(error);
        expect(() => depth.dispose()).not.toThrow();

        expect.soft(geometryDispose).toHaveBeenCalledOnce();
        expect.soft(downsampledDispose).toHaveBeenCalledOnce();
        expect.soft(materialDispose).toHaveBeenCalledOnce();
        expect.soft(world.bodies.len()).toBe(0);
        expect.soft(world.colliders.len()).toBe(0);
        expect(textureDispose).toHaveBeenCalledOnce();
        expect(passDispose).toHaveBeenCalledOnce();
        expect(mesh.parent).toBeNull();
        expect(registry.get(DepthMesh)).toBeUndefined();
        expect(depth.depthMesh).toBeUndefined();
      } finally {
        mesh.disposeResources();
        world.free();
      }
    }
  );

  it.each(['mesh', 'textures'] as const)(
    'still releases resources if unregistering %s throws',
    (resource) => {
      const {depth, registry} = createDepth();
      const resourceType = resource === 'mesh' ? DepthMesh : DepthTextures;
      const mesh = depth.depthMesh!;
      const error = new Error('unregistration failed');
      const unregister = registry.unregister.bind(registry);
      vi.spyOn(registry, 'unregister').mockImplementation((type) => {
        if (type === resourceType) throw error;
        unregister(type);
      });
      const meshDispose = vi.spyOn(mesh, 'disposeResources');
      const textureDispose = vi.spyOn(registry.get(DepthTextures)!, 'dispose');
      const passDispose = vi.spyOn(depth['occlusionPass']!, 'dispose');

      expect(() => depth.dispose()).toThrow(error);
      expect(meshDispose).toHaveBeenCalledOnce();
      expect(textureDispose).toHaveBeenCalledOnce();
      expect(passDispose).toHaveBeenCalledOnce();
      expect(mesh.parent).toBeNull();
      expect(depth.depthMesh).toBeUndefined();
      expect(depth.getTexture(0)).toBeUndefined();
      expect(() => depth.dispose()).not.toThrow();
    }
  );

  it('does not unregister replacement resources owned by another caller', () => {
    const {depth, registry} = createDepth();
    const replacement = new DepthTextures(new DepthOptions());
    registry.register(replacement);

    depth.dispose();

    expect(registry.get(DepthTextures)).toBe(replacement);
  });
});
