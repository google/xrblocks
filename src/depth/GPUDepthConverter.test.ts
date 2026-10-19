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
    imageIndex: 0,
  } as XRWebGLDepthInformation & {depthNear: number};
}

function createConverter(xrEnabled = true) {
  const originalTarget = new THREE.WebGLRenderTarget(1, 1);
  let currentTarget: THREE.WebGLRenderTarget | null = originalTarget;
  const renderer = {
    xr: {enabled: xrEnabled},
    properties: new WebGLProperties(),
    getRenderTarget: vi.fn(() => currentTarget),
    getActiveCubeFace: () => 0,
    getActiveMipmapLevel: () => 0,
    getCurrentViewport: (target: THREE.Vector4) =>
      target.copy(currentTarget!.viewport),
    getViewport: (target: THREE.Vector4) => target.set(0, 0, 1, 1),
    getContext: () => ({
      SCISSOR_BOX: 0x0c10,
      SCISSOR_TEST: 0x0c11,
      getParameter: () => new Int32Array([0, 0, 1, 1]),
      isEnabled: () => false,
    }),
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

  it.each([
    [3, 2],
    [1, 2],
    [1, 4],
  ])('resizes the target and readback buffer to %sx%s', (width, height) => {
    const {converter, renderer} = createConverter();
    const first = converter.convertGPUToCPU(createDepthData());
    const target = renderer.setRenderTarget.mock.calls[0][0]!;
    const dispose = vi.spyOn(target, 'dispose');
    const scene = renderer.render.mock.calls[0][0];
    renderer.readRenderTargetPixels.mockImplementation(
      (readTarget, x, y, readWidth, readHeight, pixels) => {
        expect(readTarget).toBe(target);
        expect([readTarget.width, readTarget.height]).toEqual([width, height]);
        expect([x, y, readWidth, readHeight]).toEqual([0, 0, width, height]);
        expect(pixels).toBeInstanceOf(Float32Array);
        expect(pixels.length).toBe(width * height);
        pixels.fill(7);
      }
    );

    const result = converter.convertGPUToCPU({
      ...createDepthData(),
      width,
      height,
    });

    expect([result.width, result.height]).toEqual([width, height]);
    expect(Array.from(new Float32Array(result.data))).toEqual(
      Array(width * height).fill(7)
    );
    expect(result.data).not.toBe(first.data);
    expect(renderer.render.mock.calls[1][0]).toBe(scene);
    expect(dispose).toHaveBeenCalledOnce();
  });

  it('reuses the target when dimensions are unchanged and returns owned arrays', () => {
    const {converter, renderer} = createConverter();
    const first = converter.convertGPUToCPU(createDepthData());
    const target = renderer.setRenderTarget.mock.calls[0][0]!;
    const dispose = vi.spyOn(target, 'dispose');

    const second = converter.convertGPUToCPU(createDepthData());

    expect(second.data).not.toBe(first.data);
    expect(renderer.setRenderTarget.mock.calls[2][0]).toBe(target);
    expect(dispose).not.toHaveBeenCalled();
  });

  it('copies consecutive view results while reusing scratch pixels and selects each image layer', () => {
    const {converter, renderer} = createConverter();
    const sampledImageIndices: number[] = [];
    let readbackCount = 0;
    let scratchPixels: Float32Array | undefined;
    renderer.render.mockImplementation((scene) => {
      const material = getDepthMesh(scene).material;
      expect(material.fragmentShader).toContain('uniform int uImageIndex;');
      expect(material.fragmentShader).toMatch(
        /texture\s*\(\s*uTexture\s*,\s*vec3\s*\(\s*vUv\s*,\s*float\s*\(\s*uImageIndex\s*\)\s*\)\s*\)\s*\.r/
      );
      const imageIndex = material.uniforms.uImageIndex.value as number;
      sampledImageIndices.push(imageIndex);
    });
    renderer.readRenderTargetPixels.mockImplementation(
      (_target, _x, _y, _width, _height, pixels) => {
        if (scratchPixels) expect(pixels).toBe(scratchPixels);
        scratchPixels = pixels as Float32Array;
        (pixels as Float32Array).fill(++readbackCount * 10);
      }
    );

    const left = converter.convertGPUToCPU(createDepthData());
    const right = converter.convertGPUToCPU({
      ...createDepthData(),
      imageIndex: 1,
      rawValueToMeters: 0.01,
    });

    expect(sampledImageIndices).toEqual([0, 1]);
    expect(left.rawValueToMeters).toBe(1);
    expect(right.rawValueToMeters).toBe(0.01);
    expect(left.data).not.toBe(right.data);
    expect(Array.from(new Float32Array(left.data))).toEqual([10, 10, 10, 10]);
    expect(Array.from(new Float32Array(right.data))).toEqual([20, 20, 20, 20]);
  });

  it('can be disposed before its first conversion', () => {
    const {converter, renderer} = createConverter();

    expect(() => converter.dispose()).not.toThrow();
    expect(renderer.render).not.toHaveBeenCalled();
  });

  it('releases owned resources once and drops the borrowed native texture', () => {
    const {converter, renderer} = createConverter();
    converter.convertGPUToCPU(createDepthData());
    const target = renderer.setRenderTarget.mock.calls[0][0]!;
    const scene = renderer.render.mock.calls[0][0];
    const mesh = getDepthMesh(scene);
    const texture = mesh.material.uniforms.uTexture
      .value as THREE.ExternalTexture;
    renderer.properties.get(texture).__webglTexture = texture.sourceTexture;
    const disposals = [target, mesh.geometry, mesh.material, texture].map(
      (resource) => vi.spyOn(resource, 'dispose')
    );

    converter.dispose();
    converter.dispose();

    for (const dispose of disposals) {
      expect(dispose).toHaveBeenCalledOnce();
    }
    expect(texture.sourceTexture).toBeNull();
    expect(renderer.properties.has(texture)).toBe(false);
    expect(scene.children).toHaveLength(0);
  });

  it('allocates fresh resources when converting after disposal', () => {
    const {converter, renderer} = createConverter();
    const first = converter.convertGPUToCPU(createDepthData());
    const firstTarget = renderer.setRenderTarget.mock.calls[0][0];
    const firstScene = renderer.render.mock.calls[0][0];

    converter.dispose();
    const next = createDepthData();
    const second = converter.convertGPUToCPU(next);
    const secondScene = renderer.render.mock.calls[1][0];

    expect(second.data).not.toBe(first.data);
    expect(renderer.setRenderTarget.mock.calls[2][0]).not.toBe(firstTarget);
    expect(secondScene).not.toBe(firstScene);
    expect(
      getDepthMesh(secondScene).material.uniforms.uTexture.value.sourceTexture
    ).toBe(next.texture);
  });

  it.each(['target', 'geometry', 'material', 'texture', 'scene'] as const)(
    'finishes all cleanup and reports the first error when %s disposal throws',
    (operation) => {
      const {converter, renderer} = createConverter();
      const first = converter.convertGPUToCPU(createDepthData());
      const target = renderer.setRenderTarget.mock.calls[0][0]!;
      const scene = renderer.render.mock.calls[0][0];
      const mesh = getDepthMesh(scene);
      const texture = mesh.material.uniforms.uTexture
        .value as THREE.ExternalTexture;
      renderer.properties.get(texture).__webglTexture = texture.sourceTexture;
      const resources = {
        target,
        geometry: mesh.geometry,
        material: mesh.material,
        texture,
      };
      const disposals = Object.values(resources).map((resource) =>
        vi.spyOn(resource, 'dispose')
      );
      const removeProperties = vi.spyOn(renderer.properties, 'remove');
      const clearScene = vi.spyOn(scene, 'clear');
      const error = new Error(`${operation} disposal failed`);
      if (operation !== 'scene') {
        resources[operation].addEventListener('dispose', () => {
          throw error;
        });
      }
      const sceneError =
        operation === 'scene' ? error : new Error('scene cleanup failed');
      mesh.addEventListener('removed', () => {
        throw sceneError;
      });

      expect(() => converter.dispose()).toThrow(error);
      expect.soft(() => converter.dispose()).not.toThrow();

      for (const dispose of disposals) {
        expect.soft(dispose).toHaveBeenCalledOnce();
      }
      expect.soft(removeProperties).toHaveBeenCalledExactlyOnceWith(texture);
      expect.soft(clearScene).toHaveBeenCalledOnce();
      expect.soft(texture.sourceTexture).toBeNull();
      expect.soft(renderer.properties.has(texture)).toBe(false);
      expect.soft(scene.children).toHaveLength(0);
      expect.soft(converter['gpuPixels']).toHaveLength(0);

      const second = converter.convertGPUToCPU(createDepthData());
      expect(second.data).not.toBe(first.data);
      expect(renderer.setRenderTarget.mock.calls[2][0]).not.toBe(target);
      expect(renderer.render.mock.calls[1][0]).not.toBe(scene);
    }
  );
});
