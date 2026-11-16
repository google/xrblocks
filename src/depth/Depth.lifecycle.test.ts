import * as THREE from 'three';
import {afterEach, expect, it, vi} from 'vitest';
import {Registry} from '../core/components/Registry';
import {Depth} from './Depth';
import {DepthMesh} from './DepthMesh';
import {DepthOptions} from './DepthOptions';
import {DepthTextures} from './DepthTextures';

afterEach(() => {
  Depth.instance?.dispose();
  Depth.instance = undefined;
  vi.restoreAllMocks();
});
function setup() {
  const depth = new Depth(),
    registry = new Registry(),
    scene = new THREE.Scene();
  depth.init(
    new THREE.PerspectiveCamera(),
    new DepthOptions({
      enabled: true,
      depthMesh: {enabled: true},
      depthTexture: {enabled: true},
      occlusion: {enabled: true},
    }),
    {xr: {getCamera: () => new THREE.ArrayCamera([])}} as never,
    registry,
    scene
  );
  return {depth, registry, scene};
}
it('releases owned resources once and removes them from scene and registry', () => {
  const {depth, registry, scene} = setup(),
    mesh = depth.depthMesh!,
    textures = registry.get(DepthTextures)!;
  const releases = [
    vi.spyOn(mesh, 'disposeResources'),
    vi.spyOn(textures, 'dispose'),
  ];
  depth.dispose();
  depth.dispose();
  for (const release of releases) expect(release).toHaveBeenCalledOnce();
  expect(scene.children).not.toContain(mesh);
  expect(registry.get(DepthMesh)).toBeUndefined();
  expect(registry.get(DepthTextures)).toBeUndefined();
  expect(depth.getDepth(0.5, 0.5)).toBe(0);
  expect(depth.getTexture(0)).toBeUndefined();
  expect(depth.enabled).toBe(false);
});
it('finishes resource cleanup after a scene removal listener throws', () => {
  const {depth, registry} = setup(),
    mesh = depth.depthMesh!,
    textures = registry.get(DepthTextures)!;
  mesh.addEventListener('removed', () => {
    throw new Error('removal failed');
  });
  const released = [
    vi.spyOn(mesh.geometry, 'dispose'),
    vi.spyOn(mesh.material as THREE.Material, 'dispose'),
    vi.spyOn(textures, 'dispose'),
  ];
  expect(() => depth.dispose()).toThrow('removal failed');
  expect(() => depth.dispose()).not.toThrow();
  for (const release of released) expect(release).toHaveBeenCalledOnce();
  expect(mesh.parent).toBeNull();
  expect(registry.get(DepthMesh)).toBeUndefined();
});
it('preserves replacement resources owned by another caller', () => {
  const {depth, registry} = setup(),
    replacement = new DepthTextures(new DepthOptions());
  registry.register(replacement);
  depth.dispose();
  expect(registry.get(DepthTextures)).toBe(replacement);
  replacement.dispose();
});
