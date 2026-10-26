import '../../addons/testing/setup';
import {describe, expect, it, vi} from 'vitest';
import * as THREE from 'three';
import type {WebGLOrWebGPURenderer} from '../../core/RendererTypes';

import {Depth} from '../Depth';
import {DepthOptions} from '../DepthOptions';
import {OcclusionUtils} from './OcclusionUtils';
import {WebGPUOcclusionPass} from './WebGPUOcclusionPass';
import {addWebGPUOcclusionToMaterial} from './WebGPUOcclusionUtils';

function createMockWebGPURenderer() {
  let currentRenderTarget: THREE.RenderTarget | null = null;
  return {
    isWebGPURenderer: true,
    xr: {
      enabled: true,
      isPresenting: false,
      getCamera: () => ({cameras: []}),
    },
    getRenderTarget: vi.fn(() => currentRenderTarget),
    setRenderTarget: vi.fn((target: THREE.RenderTarget | null) => {
      currentRenderTarget = target;
    }),
    getDrawingBufferSize: vi.fn((target: THREE.Vector2) =>
      target.set(256, 128)
    ),
    clear: vi.fn(),
    render: vi.fn(),
  } as unknown as WebGLOrWebGPURenderer;
}

describe('WebGPUOcclusionPass and WebGPUOcclusionUtils', () => {
  it('renders scene occlusion map, runs Kawase blur passes, and updates occludable shader uniforms', () => {
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera();
    camera.position.set(0, 1.5, 2);
    camera.updateMatrixWorld(true);

    const pass = new WebGPUOcclusionPass(scene, camera);
    const renderer = createMockWebGPURenderer();

    const depthTexture = new THREE.DataTexture(
      new Float32Array(16 * 16),
      16,
      16,
      THREE.RedFormat,
      THREE.FloatType
    );
    const depthView = new THREE.Matrix4().makeTranslation(0, -1.5, -2);
    const depthProj = camera.projectionMatrix.clone();

    pass.setDepthTexture(
      depthTexture,
      0.001,
      0,
      undefined,
      depthView,
      depthProj
    );
    pass.render(renderer, undefined, undefined, 0);

    // 1 scene pass into occlusionMapTexture + 6 Kawase blur passes
    expect(renderer.render).toHaveBeenCalledTimes(7);

    const material = new THREE.MeshStandardMaterial();
    const shader = addWebGPUOcclusionToMaterial(material);
    expect(material.transparent).toBe(true);
    expect((material as {opacityNode?: unknown}).opacityNode).toBeDefined();

    pass.updateOcclusionMapUniforms(shader.uniforms, renderer);
    expect(shader.uniforms.tOcclusionMap.value).toBe(
      pass['occlusionMapTexture'].texture
    );

    const expectedClipFromWorld = new THREE.Matrix4()
      .copy(camera.projectionMatrix)
      .multiply(camera.matrixWorldInverse);
    expect(
      (shader.uniforms.uOcclusionClipFromWorld.value as THREE.Matrix4).equals(
        expectedClipFromWorld
      )
    ).toBe(true);

    shader.uniforms.occlusionEnabled.value = false;
    expect(shader.uniforms.occlusionEnabled.value).toBe(false);

    pass.dispose();
  });

  it('supports Mode B readBuffer-to-writeBuffer post-processing and disposes cleanly', () => {
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera();
    const pass = new WebGPUOcclusionPass(scene, camera);
    const renderer = createMockWebGPURenderer();

    const readBuffer = new THREE.RenderTarget(256, 128);
    readBuffer.depthTexture = new THREE.DepthTexture(256, 128);
    const writeBuffer = new THREE.RenderTarget(256, 128);

    pass.render(renderer, writeBuffer, readBuffer, 0);
    // 1 occlusionMapQuad + 6 Kawase blur quads + 1 occlusionQuad composite
    expect(renderer.render).toHaveBeenCalledTimes(8);

    pass.dispose();
    pass.dispose();
    readBuffer.depthTexture.dispose();
    readBuffer.dispose();
    writeBuffer.dispose();
  });

  it('registers WebGPU materials via OcclusionUtils.addOcclusionToMaterial before and after handler setup', () => {
    OcclusionUtils.setWebGPUMaterialHandler(undefined);

    const earlyMaterial = new THREE.MeshStandardMaterial();
    let earlyShader:
      | ReturnType<typeof addWebGPUOcclusionToMaterial>
      | undefined;
    OcclusionUtils.addOcclusionToMaterial(earlyMaterial, (shader) => {
      earlyShader = shader;
    });
    expect(earlyShader).toBeUndefined();

    OcclusionUtils.setWebGPUMaterialHandler(addWebGPUOcclusionToMaterial);
    expect(earlyShader).toBeDefined();
    expect(
      (earlyMaterial as THREE.Material & {opacityNode?: unknown}).opacityNode
    ).toBeDefined();

    const lateMaterial = new THREE.MeshStandardMaterial();
    let lateShader: ReturnType<typeof addWebGPUOcclusionToMaterial> | undefined;
    OcclusionUtils.addOcclusionToMaterial(lateMaterial, (shader) => {
      lateShader = shader;
    });
    expect(lateShader).toBeDefined();

    OcclusionUtils.setWebGPUMaterialHandler(undefined);
  });

  it('temporarily disables renderer.xr.enabled during Depth.renderOcclusionPass without mutating isPresenting', async () => {
    const depth = new Depth();
    const renderer = createMockWebGPURenderer();
    let isPresentingGetterCalls = 0;
    Object.defineProperty(renderer.xr, 'isPresenting', {
      get() {
        isPresentingGetterCalls++;
        return true;
      },
      configurable: true,
    });

    const depthOptions = new DepthOptions();
    depthOptions.enabled = true;
    depthOptions.occlusion.enabled = true;

    await depth.init(
      new THREE.PerspectiveCamera(),
      depthOptions,
      renderer,
      {get: () => undefined, register: () => {}} as never,
      new THREE.Scene()
    );

    let xrEnabledDuringRender: boolean | undefined;
    const renderSpy = vi
      .spyOn(depth.occlusionPass!, 'render')
      .mockImplementation(() => {
        xrEnabledDuringRender = renderer.xr.enabled;
      });

    depth.renderOcclusionPass();

    expect(renderSpy).toHaveBeenCalledTimes(1);
    expect(xrEnabledDuringRender).toBe(false);
    expect(renderer.xr.enabled).toBe(true);
    expect(renderer.xr.isPresenting).toBe(true);
    expect(isPresentingGetterCalls).toBe(1);
  });
});
