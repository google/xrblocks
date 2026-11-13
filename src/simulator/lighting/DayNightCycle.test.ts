import * as THREE from 'three';
import type {NodeMaterial} from 'three/webgpu';
import {GLTFLoader, type GLTF} from 'three/addons/loaders/GLTFLoader.js';
import {afterEach, describe, expect, it, vi} from 'vitest';
import {ModelLoader} from '../../utils/ModelLoader';
import {DayNightCycle} from './DayNightCycle';

function rendererBoundary(webgpu: boolean) {
  return {
    isWebGLRenderer: !webgpu,
    isWebGPURenderer: webgpu,
    extensions: {has: () => false},
    hasFeature: () => false,
    shadowMap: {enabled: false, type: THREE.BasicShadowMap},
  };
}

async function fixture(webgpu: boolean) {
  const root = new THREE.Group();
  const day = new THREE.Group();
  const night = new THREE.Group();
  root.add(day);
  const material = new THREE.MeshBasicMaterial({
    map: new THREE.Texture(),
    side: THREE.DoubleSide,
    color: 0xff8800,
  });
  const wall = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), material);
  wall.position.set(0.5, 1, -2);
  wall.rotation.y = 0.3;
  wall.scale.set(1, 2, 1);
  day.add(wall);
  const nightWall = wall.clone();
  nightWall.geometry = wall.geometry.clone();
  nightWall.material = new THREE.MeshBasicMaterial({map: new THREE.Texture()});
  night.add(nightWall);
  vi.spyOn(GLTFLoader.prototype, 'load').mockImplementation((_url, loaded) => {
    loaded({scene: night} as GLTF);
  });
  const renderer = rendererBoundary(webgpu);
  const cycle = (await DayNightCycle.create({
    renderer,
    root,
    dayScene: day,
    loader: new ModelLoader(),
    lighting: {
      kind: 'dayNight',
      nightScenePath: 'https://example.com/night.glb',
      pairing: 'bake-crossfade-v1',
    },
  }))!;
  return {cycle, root, day, wall, nightWall, material, renderer};
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe.each([
  ['WebGL', false],
  ['WebGPU', true],
] as const)('%s day/night lighting', (_, webgpu) => {
  it('feeds day, intermediate, and night blend values to the material', async () => {
    const f = await fixture(webgpu);
    try {
      f.cycle.setTimeOfDay(0.5);
      await f.cycle.preload();
      const blend = f.wall.material as THREE.MeshBasicMaterial & NodeMaterial;
      expect(blend.map).toBe(f.material.map);
      expect(blend.side).toBe(f.material.side);
      expect(blend.color).toEqual(f.material.color);
      let weight: {value: number};
      if (webgpu) {
        const uniforms: {value: number}[] = [];
        const textures = new Set<THREE.Texture>();
        // The node graph is the actual GPU input, not the cycle's private rig.
        blend.colorNode!.traverse((node) => {
          if (
            'isUniformNode' in node &&
            node.isUniformNode &&
            'value' in node &&
            typeof node.value === 'number'
          )
            uniforms.push(node as unknown as {value: number});
          if ('isTextureNode' in node && node.isTextureNode && 'value' in node)
            textures.add(node.value as THREE.Texture);
        });
        expect(textures.has(f.nightWall.material.map!)).toBe(true);
        weight = uniforms[0];
      } else {
        const shader = {
          uniforms: {},
          fragmentShader: THREE.ShaderLib.basic.fragmentShader,
          vertexShader: THREE.ShaderLib.basic.vertexShader,
        } as THREE.WebGLProgramParametersWithUniforms;
        blend.onBeforeCompile(shader, {} as THREE.WebGLRenderer);
        expect(shader.uniforms.mapNight.value).toBe(f.nightWall.material.map);
        weight = shader.uniforms.mixU;
      }
      expect(weight.value).toBeGreaterThan(0);
      expect(weight.value).toBeLessThan(1);
      f.cycle.setTimeOfDay(-1);
      expect(weight.value).toBe(0);
      f.cycle.setTimeOfDay(2);
      expect(weight.value).toBe(1);
    } finally {
      f.cycle.dispose();
    }
  });

  it('restores borrowed geometry, materials, transforms, and shadow settings', async () => {
    const f = await fixture(webgpu);
    const geometry = f.wall.geometry;
    const matrix = f.wall.matrix.clone();
    f.wall.updateMatrix();
    matrix.copy(f.wall.matrix);
    const borrowedDisposal = vi.fn();
    geometry.addEventListener('dispose', borrowedDisposal);
    f.material.addEventListener('dispose', borrowedDisposal);
    const nightDisposed = vi.fn();
    f.nightWall.geometry.addEventListener('dispose', nightDisposed);
    try {
      await f.cycle.preload();
      expect(f.wall.material).not.toBe(f.material);
      const replacementDisposed = vi.fn();
      f.wall.material.addEventListener('dispose', replacementDisposed);
      const sun = f.root.children.find(
        (child) => child instanceof THREE.DirectionalLight && child.castShadow
      ) as THREE.DirectionalLight;
      const shadowDisposed = vi.spyOn(sun.shadow, 'dispose');
      f.cycle.dispose();
      f.wall.updateMatrix();
      expect(f.wall.geometry).toBe(geometry);
      expect(f.wall.material).toBe(f.material);
      expect(f.wall.matrix).toEqual(matrix);
      expect(f.root.children).toEqual([f.day]);
      expect(f.renderer.shadowMap).toEqual({
        enabled: false,
        type: THREE.BasicShadowMap,
      });
      expect(borrowedDisposal).not.toHaveBeenCalled();
      expect(replacementDisposed).toHaveBeenCalledOnce();
      expect(nightDisposed).toHaveBeenCalledOnce();
      expect(shadowDisposed).toHaveBeenCalledOnce();
      f.cycle.dispose();
      expect(replacementDisposed).toHaveBeenCalledOnce();
      expect(shadowDisposed).toHaveBeenCalledOnce();
    } finally {
      f.cycle.dispose();
    }
  });
});
