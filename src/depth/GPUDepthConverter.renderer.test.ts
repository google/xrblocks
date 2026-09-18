import {describe, it, expect, vi} from 'vitest';
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
        renderer.properties.get(target).__webglFramebuffer = {};
      }
      setRenderTarget(target, face, mip);
    }
  );
  return {renderer, gl};
}

describe('GPUDepthConverter with real renderer binding state', () => {
  describe.each([
    'cube',
    'array',
    'target defaults',
    'canvas',
    'canvas defaults',
  ] as const)('%s', (binding) => {
    it.each(['success', 'render', 'readRenderTargetPixels'] as const)(
      'preserves live binding state and logical defaults after %s',
      (outcome) => {
        const {renderer, gl} = createRenderer();
        const isCanvas = binding.startsWith('canvas');
        renderer.setPixelRatio(isCanvas ? 1.5 : 2);
        renderer.setViewport(9, 10, 11, 12);
        renderer.setScissor(13, 14, 15, 16);
        renderer.setScissorTest(false);
        const target = isCanvas
          ? null
          : binding === 'cube'
            ? new THREE.WebGLCubeRenderTarget(8, {depthBuffer: false})
            : new THREE.WebGLArrayRenderTarget(8, 8, 4, {
                depthBuffer: false,
              });
        if (target) {
          renderer.properties.get(target).__webglFramebuffer =
            binding === 'cube' ? Array.from({length: 6}, () => ({})) : {};
          renderer.properties.get(target.texture).__webglTexture = {};
          if (binding === 'target defaults') {
            target.viewport.set(1, 2, 3, 4);
            target.scissor.set(2, 1, 4, 3);
            target.scissorTest = true;
          }
        }
        const targetViewport = target?.viewport.clone();
        const targetScissor = target?.scissor.clone();
        const targetViewportReference = target?.viewport;
        const targetScissorReference = target?.scissor;
        const targetScissorTest = target?.scissorTest;
        const face = target ? 3 : 0;
        const mip = target ? 1 : 0;
        renderer.setRenderTarget(target, face, mip);
        if (!binding.endsWith('defaults')) {
          renderer.setViewport(0.5, 1, 1.5, 2);
          renderer.setScissor(1, 0.5, 2, 1.5);
          renderer.setScissorTest(true);
        }
        const logicalViewport = renderer.getViewport(new THREE.Vector4());
        const logicalScissor = renderer.getScissor(new THREE.Vector4());
        const logicalScissorTest = renderer.getScissorTest();
        const liveFramebuffer = gl.getParameter(gl.FRAMEBUFFER_BINDING);
        const liveViewport = gl.getParameter(gl.VIEWPORT);
        const liveScissor = gl.getParameter(gl.SCISSOR_BOX);
        const liveScissorTest = gl.isEnabled(gl.SCISSOR_TEST);
        const nativeTexture = target
          ? renderer.properties.get(target.texture).__webglTexture
          : null;
        if (outcome !== 'success') {
          vi.mocked(renderer[outcome]).mockImplementationOnce(() => {
            throw new Error('conversion failed');
          });
        }
        const converter = new GPUDepthConverter(renderer);
        const convert = () =>
          converter.convertGPUToCPU({
            texture: {},
            width: 2,
            height: 2,
            rawValueToMeters: 1,
            depthNear: 0.1,
          } as XRWebGLDepthInformation);

        vi.mocked(gl.framebufferTexture2D).mockClear();
        vi.mocked(gl.framebufferTextureLayer).mockClear();
        if (outcome === 'success') {
          convert();
        } else {
          expect(convert).toThrow('conversion failed');
        }

        expect(renderer.getRenderTarget()).toBe(target);
        expect.soft(renderer.getActiveCubeFace()).toBe(face);
        expect.soft(renderer.getActiveMipmapLevel()).toBe(mip);
        expect
          .soft(gl.getParameter(gl.FRAMEBUFFER_BINDING))
          .toBe(liveFramebuffer);
        expect.soft(gl.getParameter(gl.VIEWPORT)).toEqual(liveViewport);
        expect.soft(gl.getParameter(gl.SCISSOR_BOX)).toEqual(liveScissor);
        expect.soft(gl.isEnabled(gl.SCISSOR_TEST)).toBe(liveScissorTest);
        expect(
          renderer.getCurrentViewport(new THREE.Vector4()).toArray()
        ).toEqual(Array.from(liveViewport));
        expect(renderer.getViewport(new THREE.Vector4())).toEqual(
          logicalViewport
        );
        expect(renderer.getScissor(new THREE.Vector4())).toEqual(
          logicalScissor
        );
        expect(renderer.getScissorTest()).toBe(logicalScissorTest);
        if (target) {
          expect(target.viewport).toBe(targetViewportReference);
          expect(target.scissor).toBe(targetScissorReference);
          expect(target.viewport).toEqual(targetViewport);
          expect(target.scissor).toEqual(targetScissor);
          expect(target.scissorTest).toBe(targetScissorTest);
          if (binding === 'cube') {
            expect(gl.framebufferTexture2D).toHaveBeenLastCalledWith(
              gl.FRAMEBUFFER,
              gl.COLOR_ATTACHMENT0,
              gl.TEXTURE_CUBE_MAP_POSITIVE_X + face,
              nativeTexture,
              mip
            );
            expect(vi.mocked(gl.framebufferTexture2D).mock.lastCall?.[3]).toBe(
              nativeTexture
            );
          } else {
            expect(gl.framebufferTextureLayer).toHaveBeenLastCalledWith(
              gl.FRAMEBUFFER,
              gl.COLOR_ATTACHMENT0,
              nativeTexture,
              mip,
              face
            );
            expect(
              vi.mocked(gl.framebufferTextureLayer).mock.lastCall?.[2]
            ).toBe(nativeTexture);
          }
        }
      }
    );
  });
});
