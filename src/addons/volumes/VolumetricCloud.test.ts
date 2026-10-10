import {beforeEach, describe, expect, it, vi} from 'vitest';
import * as THREE from 'three';

import {VolumetricCloud} from './VolumetricCloud';

const webGPU = {isWebGPURenderer: true} as unknown as ConstructorParameters<
  typeof VolumetricCloud
>[0];

describe('VolumetricCloud renderer support', () => {
  beforeEach(() => {
    // Locks the animation rotation so local-space assertions are deterministic.
    vi.spyOn(performance, 'now').mockReturnValue(0);
  });

  it('uses the original GLSL RawShaderMaterial without a WebGPU renderer', () => {
    const cloud = new VolumetricCloud();
    expect(cloud.mesh.material).toHaveProperty('isRawShaderMaterial', true);

    const camera = new THREE.PerspectiveCamera();
    camera.position.set(1, 2, 3);
    const uniforms = (cloud.mesh.material as THREE.RawShaderMaterial).uniforms;
    cloud.update(camera);

    expect(uniforms.cameraPos.value.toArray()).toEqual([1, 2, 3]);
    expect(uniforms.frame.value).toBe(1);
  });

  it('swaps to a node material on WebGPURenderer', async () => {
    const cloud = new VolumetricCloud(webGPU);
    // Invisible placeholder until the TSL port loads.
    expect(
      (cloud.mesh.material as {isNodeMaterial?: boolean}).isNodeMaterial
    ).not.toBe(true);

    await vi.waitFor(() => {
      expect(cloud.mesh.material).toHaveProperty('isNodeMaterial', true);
    });
    expect(cloud.nodeRig).toBeDefined();
  });

  it('update() is a no-op until the node material loads', () => {
    const cloud = new VolumetricCloud(webGPU);
    const camera = new THREE.PerspectiveCamera();
    // Before the async swap resolves the mesh carries only the placeholder.
    expect(() => cloud.update(camera)).not.toThrow();
  });

  it('feeds the node material camera origin and frame counter', async () => {
    const cloud = new VolumetricCloud(webGPU);
    await vi.waitFor(() => {
      expect(cloud.nodeRig).toBeDefined();
    });
    cloud.mesh.position.set(4, 8, 0);
    cloud.mesh.scale.set(1, 1, 1);

    const camera = new THREE.PerspectiveCamera();
    camera.position.set(4, 10, 2);
    cloud.update(camera);
    cloud.update(camera);

    const origin = cloud.nodeRig!.originUniform.value;
    expect(origin.x).toBeCloseTo(0);
    expect(origin.y).toBeCloseTo(2);
    expect(origin.z).toBeCloseTo(2);
    expect(cloud.nodeRig!.frameUniform.value).toBe(2);
  });
});
