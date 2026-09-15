import {afterEach, describe, expect, it, vi} from 'vitest';
import * as THREE from 'three';

import {Registry} from '../core/components/Registry';
import {Depth} from './Depth';
import {DepthMesh} from './DepthMesh';
import {DepthOptions} from './DepthOptions';
import {DepthTextures} from './DepthTextures';

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

  it('does not unregister replacement resources owned by another caller', () => {
    const {depth, registry} = createDepth();
    const replacement = new DepthTextures(new DepthOptions());
    registry.register(replacement);

    depth.dispose();

    expect(registry.get(DepthTextures)).toBe(replacement);
  });
});
