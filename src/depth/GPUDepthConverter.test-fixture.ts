import {vi} from 'vitest';
import * as THREE from 'three';
import {WebGLProperties} from 'three/src/renderers/webgl/WebGLProperties.js';

import {GPUDepthConverter} from './GPUDepthConverter';

export function createDepthData(texture = {}) {
  return {
    texture,
    depthNear: 0.1,
    width: 2,
    height: 2,
    rawValueToMeters: 1,
    imageIndex: 0,
  } as XRWebGLDepthInformation & {depthNear: number};
}

export function createConverter(xrEnabled = true) {
  const originalTarget = new THREE.WebGLRenderTarget(1, 1);
  let currentTarget: THREE.WebGLRenderTarget | null = originalTarget;
  const renderer = {
    xr: {
      enabled: xrEnabled,
      getCamera: () => new THREE.ArrayCamera([]),
      getReferenceSpace: () => ({}),
    },
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

export function getDepthMesh(scene: THREE.Scene) {
  return scene.children[0] as THREE.Mesh<
    THREE.PlaneGeometry,
    THREE.ShaderMaterial
  >;
}
