import {describe, it, expect, vi} from 'vitest';
import * as THREE from 'three';
import {WebGLProperties} from 'three/src/renderers/webgl/WebGLProperties.js';
import {WebGLTextures} from 'three/src/renderers/webgl/WebGLTextures.js';

import {GPUDepthConverter} from './GPUDepthConverter';

function createDepthData(texture = {}) {
  return {
    texture,
    depthNear: 0.1,
    width: 2,
    height: 2,
    rawValueToMeters: 1,
  } as XRWebGLDepthInformation & {depthNear: number};
}

function createConverter(xrEnabled = true) {
  const originalTarget = new THREE.WebGLRenderTarget(1, 1);
  let currentTarget: THREE.WebGLRenderTarget | null = originalTarget;
  const renderer = {
    xr: {enabled: xrEnabled},
    properties: new WebGLProperties(),
    getRenderTarget: vi.fn(() => currentTarget),
    setRenderTarget: vi.fn((target: THREE.WebGLRenderTarget | null) => {
      currentTarget = target;
    }),
    render: vi.fn<(scene: THREE.Scene, camera: THREE.Camera) => void>(),
    readRenderTargetPixels: vi.fn(),
  };
  const converter = new GPUDepthConverter(
    renderer as unknown as THREE.WebGLRenderer
  );
  return {converter, renderer, originalTarget};
}

function getDepthMesh(scene: THREE.Scene) {
  return scene.children[0] as THREE.Mesh<
    THREE.PlaneGeometry,
    THREE.ShaderMaterial
  >;
}

describe('GPUDepthConverter', () => {
  it('binds each incoming native texture through the three.js array sampler', () => {
    const {converter, renderer} = createConverter();
    const bindTexture = vi.fn();
    type TextureArgs = ConstructorParameters<typeof WebGLTextures>;
    const textures = new WebGLTextures(
      {TEXTURE_2D_ARRAY: 0x8c1a, TEXTURE0: 0x84c0} as TextureArgs[0],
      {has: () => false} as TextureArgs[1],
      {bindTexture} as unknown as TextureArgs[2],
      renderer.properties,
      {} as TextureArgs[4],
      {} as TextureArgs[5],
      {} as TextureArgs[6]
    );
    renderer.render.mockImplementation((scene) => {
      textures.setTexture2DArray(
        getDepthMesh(scene).material.uniforms.uTexture.value,
        0
      );
    });
    const first = createDepthData();
    const second = createDepthData();

    converter.convertGPUToCPU(first);
    const scene = renderer.render.mock.calls[0][0];
    const texture = getDepthMesh(scene).material.uniforms.uTexture
      .value as THREE.ExternalTexture;
    expect(bindTexture).toHaveBeenLastCalledWith(0x8c1a, first.texture, 0x84c0);

    converter.convertGPUToCPU(second);

    expect(bindTexture).toHaveBeenLastCalledWith(
      0x8c1a,
      second.texture,
      0x84c0
    );
    expect(bindTexture.mock.lastCall?.[1]).toBe(second.texture);
    expect(texture.sourceTexture).toBe(second.texture);
    expect(renderer.properties.get(texture).__webglTexture).toBe(
      second.texture
    );
    expect(texture.version).toBe(0);
    expect(renderer.render.mock.calls[1][0]).toBe(scene);
    expect(getDepthMesh(scene).material.uniforms.uTexture.value).toBe(texture);
  });

  it.each([false, true])(
    'restores the original render target and XR enabled state (%s)',
    (xrEnabled) => {
      const {converter, renderer, originalTarget} = createConverter(xrEnabled);
      renderer.render.mockImplementation(() => {
        expect(renderer.xr.enabled).toBe(false);
        expect(renderer.getRenderTarget()).not.toBe(originalTarget);
      });

      converter.convertGPUToCPU(createDepthData());

      expect(renderer.xr.enabled).toBe(xrEnabled);
      expect(renderer.getRenderTarget()).toBe(originalTarget);
    }
  );

  it.each(['render', 'readRenderTargetPixels'] as const)(
    'restores renderer state and propagates a %s error',
    (operation) => {
      const {converter, renderer, originalTarget} = createConverter();
      const error = new Error(`${operation} failed`);
      renderer[operation].mockImplementationOnce(() => {
        throw error;
      });

      expect(() => converter.convertGPUToCPU(createDepthData())).toThrow(error);
      expect(renderer.xr.enabled).toBe(true);
      expect(renderer.getRenderTarget()).toBe(originalTarget);
    }
  );
});
