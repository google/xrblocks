import {it, expect, vi} from 'vitest';
import * as THREE from 'three';

import {GPUDepthConverter} from './GPUDepthConverter';

function createRenderer() {
  const canvas = document.createElement('canvas');
  const enabled = new Set<number>();
  let viewport = [0, 0, canvas.width, canvas.height];
  let scissor = [...viewport];
  let framebuffer: WebGLFramebuffer | null = null;
  const methods: Record<string, unknown> = {
    canvas,
    getContextAttributes: () => ({alpha: false}),
    getExtension: () => null,
    getShaderPrecisionFormat: () => ({precision: 23}),
    createTexture: () => ({}),
    createFramebuffer: () => ({}),
    createVertexArray: () => ({}),
    bindFramebuffer: (_target: number, value: WebGLFramebuffer | null) => {
      framebuffer = value;
    },
    viewport: (...value: number[]) => {
      viewport = value;
    },
    scissor: (...value: number[]) => {
      scissor = value;
    },
    enable: (capability: number) => enabled.add(capability),
    disable: (capability: number) => enabled.delete(capability),
    isEnabled: (capability: number) => enabled.has(capability),
    getParameter: (parameter: number) => {
      if (parameter === gl.VERSION) return 'WebGL 2.0';
      if (parameter === gl.VIEWPORT) return Int32Array.from(viewport);
      if (parameter === gl.SCISSOR_BOX) return Int32Array.from(scissor);
      if (parameter === gl.FRAMEBUFFER_BINDING) return framebuffer;
      return 8;
    },
  };
  for (const name of [
    'activeTexture',
    'bindTexture',
    'texParameteri',
    'texImage2D',
    'texImage3D',
    'clearColor',
    'clearDepth',
    'clearStencil',
    'depthFunc',
    'frontFace',
    'cullFace',
    'drawBuffers',
    'framebufferTexture2D',
    'framebufferTextureLayer',
  ]) {
    methods[name] = vi.fn();
  }
  let nextConstant = 1;
  const gl = new Proxy(methods, {
    get(target, key: string) {
      if (!(key in target) && /^[A-Z][A-Z0-9_]*$/.test(key)) {
        target[key] = nextConstant++;
      }
      if (!(key in target)) throw new Error(`Unexpected WebGL access: ${key}`);
      return target[key];
    },
  }) as unknown as WebGL2RenderingContext;
  const renderer = new THREE.WebGLRenderer({canvas, context: gl});
  vi.spyOn(renderer, 'render').mockImplementation(() => {});
  vi.spyOn(renderer, 'readRenderTargetPixels').mockImplementation(() => {});
  // Keep binding/state code real, but avoid allocating GPU attachments.
  const setRenderTarget = renderer.setRenderTarget.bind(renderer);
  vi.spyOn(renderer, 'setRenderTarget').mockImplementation(
    (target, face, mip) => {
      if (target && !renderer.properties.has(target)) {
        (
          renderer.properties.get(target) as Record<string, unknown>
        ).__webglFramebuffer = {};
      }
      setRenderTarget(target, face, mip);
    }
  );
  return {renderer, gl};
}

it.each([
  ['cube', false],
  ['array', true],
  ['canvas', true],
] as const)(
  'restores the live %s binding after conversion (failure: %s)',
  (binding, fail) => {
    const {renderer, gl} = createRenderer();
    renderer.setPixelRatio(1.5);
    const target =
      binding === 'canvas'
        ? null
        : binding === 'cube'
          ? new THREE.WebGLCubeRenderTarget(8, {depthBuffer: false})
          : new THREE.WebGLArrayRenderTarget(8, 8, 4, {depthBuffer: false});
    if (target) {
      (
        renderer.properties.get(target) as Record<string, unknown>
      ).__webglFramebuffer =
        binding === 'cube' ? Array.from({length: 6}, () => ({})) : {};
      (
        renderer.properties.get(target.texture) as Record<string, unknown>
      ).__webglTexture = {};
    }
    const face = target ? 2 : 0,
      mip = target ? 1 : 0;
    renderer.setRenderTarget(target, face, mip);
    renderer.setViewport(0.5, 1, 1.5, 2);
    renderer.setScissor(1, 0.5, 2, 1.5);
    renderer.setScissorTest(true);
    const viewport = gl.getParameter(gl.VIEWPORT),
      scissor = gl.getParameter(gl.SCISSOR_BOX),
      framebuffer = gl.getParameter(gl.FRAMEBUFFER_BINDING);
    const logical = renderer.getViewport(new THREE.Vector4());
    vi.mocked(renderer.readRenderTargetPixels).mockImplementation(
      (_t, _x, _y, _w, _h, pixels) => {
        if (fail) throw new Error('read failed');
        (pixels as Float32Array).fill(7);
      }
    );
    const converter = new GPUDepthConverter(renderer);
    try {
      const convert = () =>
        converter.convertGPUToCPU({
          texture: {},
          width: 2,
          height: 2,
          rawValueToMeters: 1,
          depthNear: 0.1,
        } as unknown as XRWebGLDepthInformation);
      if (fail) expect(convert).toThrow('read failed');
      else
        expect(Array.from(new Float32Array(convert().data))).toEqual([
          7, 7, 7, 7,
        ]);
      expect(renderer.getRenderTarget()).toBe(target);
      expect(renderer.getActiveCubeFace()).toBe(face);
      expect(renderer.getActiveMipmapLevel()).toBe(mip);
      expect(gl.getParameter(gl.FRAMEBUFFER_BINDING)).toBe(framebuffer);
      expect(gl.getParameter(gl.VIEWPORT)).toEqual(viewport);
      expect(gl.getParameter(gl.SCISSOR_BOX)).toEqual(scissor);
      expect(gl.isEnabled(gl.SCISSOR_TEST)).toBe(true);
      expect(renderer.getViewport(new THREE.Vector4())).toEqual(logical);
    } finally {
      converter.dispose();
      target?.dispose();
      vi.restoreAllMocks();
    }
  }
);
