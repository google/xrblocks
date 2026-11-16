import * as THREE from 'three';
import {afterEach, describe, expect, it, vi} from 'vitest';
import {Registry} from '../core/components/Registry';
import {Depth} from './Depth';
import {DepthOptions} from './DepthOptions';

import {WebGLProperties} from 'three/src/renderers/webgl/WebGLProperties.js';
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

function nativeRenderer(xrEnabled = true) {
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
  return {renderer, originalTarget};
}
function createConverter() {
  const output = nativeRenderer();
  return {
    ...output,
    converter: new GPUDepthConverter(
      output.renderer as unknown as THREE.WebGLRenderer
    ),
  };
}

function getDepthMesh(scene: THREE.Scene) {
  return scene.children[0] as THREE.Mesh<
    THREE.PlaneGeometry,
    THREE.ShaderMaterial
  >;
}

afterEach(() => {
  Depth.instance?.dispose();
  Depth.instance = undefined;
});
function initialize(
  renderer: ReturnType<typeof nativeRenderer>['renderer'],
  options = new DepthOptions({enabled: true, depthTexture: {enabled: true}})
) {
  const depth = new Depth();
  depth.init(
    new THREE.PerspectiveCamera(),
    options,
    renderer as never,
    new Registry(),
    new THREE.Scene()
  );
  return depth;
}
function cpu(
  values: number[],
  width: number,
  height: number,
  scale: number,
  transform = new THREE.Matrix4()
) {
  return {
    width,
    height,
    data: new Float32Array(values).buffer,
    rawValueToMeters: scale,
    normDepthBufferFromNormView: {matrix: transform.toArray()},
  } as unknown as XRCPUDepthInformation;
}
it('uses independent dimensions and units for each view with top-origin depth coordinates', () => {
  const f = nativeRenderer(),
    depth = initialize(f.renderer);
  try {
    depth.updateCPUDepthData(cpu([10, 20, 30, 40], 2, 2, 0.1), 0, 'float32');
    depth.updateCPUDepthData(cpu([10, 20, 30, 40], 1, 4, 0.01), 1, 'float32');
    expect(depth.getDepth(0, 1, 0)).toBeCloseTo(1);
    expect(depth.getDepth(1, 0, 0)).toBeCloseTo(4);
    expect(depth.getDepth(0, 0, 1)).toBeCloseTo(0.4);
  } finally {
    depth.dispose();
    f.originalTarget.dispose();
  }
});
it('applies the depth-view transform before lookup and reconstructs the vertex in depth camera space', () => {
  const f = nativeRenderer(),
    depth = initialize(f.renderer);
  const swap = new THREE.Matrix4().set(
    0,
    1,
    0,
    0,
    1,
    0,
    0,
    0,
    0,
    0,
    1,
    0,
    0,
    0,
    0,
    1
  );
  try {
    depth.updateCPUDepthData(
      cpu(
        Array.from({length: 16}, (_, i) => i + 1),
        4,
        4,
        1,
        swap
      ),
      0,
      'float32'
    );
    expect(depth.getDepth(0.25, 0.75)).toBe(6);
    expect(depth.getDepth(0.75, 0.25)).toBe(16);
    const vertex = depth.getVertex(0.25, 0.75)!;
    expect(vertex.y).toBeGreaterThan(0);
    expect(vertex.z).toBeCloseTo(-6);
  } finally {
    depth.dispose();
    f.originalTarget.dispose();
  }
});
it('returns requested secondary CPU depth on the next native frame', () => {
  const f = nativeRenderer(),
    depth = initialize(f.renderer),
    views = [{}, {}] as XRView[];
  const frame = {
    session: {depthUsage: 'cpu-optimized', depthDataFormat: 'float32'},
    getViewerPose: () => ({views}),
    getDepthInformation: (view: XRView) =>
      cpu(view === views[0] ? [1, 2, 3, 4] : [5, 6, 7, 8], 2, 2, 1),
  } as unknown as XRFrame;
  try {
    depth.updateLocalDepth(frame);
    depth.getTexture(1);
    depth.updateLocalDepth(frame);
    expect(depth.getDepth(0, 1, 1)).toBe(5);
    expect((depth.getTexture(1)! as THREE.DataTexture).image.data).toEqual(
      new Float32Array([5, 6, 7, 8])
    );
  } finally {
    depth.dispose();
    f.originalTarget.dispose();
  }
});
it('serves GPU queries with real conversion and replaces stale dimensions', () => {
  const f = nativeRenderer(),
    depth = initialize(f.renderer, new DepthOptions({enabled: true}));
  let pixels = [1, 2, 3, 4];
  f.renderer.readRenderTargetPixels.mockImplementation(
    (_t, _x, _y, _w, _h, out) => {
      out.set(pixels);
    }
  );
  try {
    expect(depth.getDepth(0, 1)).toBe(0);
    depth.updateGPUDepthData(createDepthData(), 0);
    expect(depth.getDepth(0, 1)).toBe(1);
    pixels = [7, 8, 9];
    depth.getDepth(0, 0, 1);
    depth.updateGPUDepthData(
      {...createDepthData(), width: 1, height: 3, rawValueToMeters: 0.1},
      1
    );
    expect(depth.getDepth(0, 0, 1)).toBeCloseTo(0.9);
    expect(Array.from(depth.depthArray[1])).toEqual([7, 8, 9]);
  } finally {
    depth.dispose();
    f.originalTarget.dispose();
  }
});

describe('GPU depth conversion', () => {
  it('returns distinct view pixels and correct dimensions after resizing', () => {
    const {converter, renderer, originalTarget} = createConverter();
    let layer = 0;
    renderer.render.mockImplementation((scene) => {
      layer = getDepthMesh(scene).material.uniforms.uImageIndex.value;
    });
    renderer.readRenderTargetPixels.mockImplementation(
      (_t, _x, _y, _w, _h, pixels) => {
        pixels.fill(layer === 0 ? 10 : 20);
      }
    );
    try {
      const first = converter.convertGPUToCPU(createDepthData());
      const second = converter.convertGPUToCPU({
        ...createDepthData(),
        imageIndex: 1,
        width: 3,
        height: 1,
        rawValueToMeters: 0.01,
      });
      expect(Array.from(new Float32Array(first.data))).toEqual([
        10, 10, 10, 10,
      ]);
      expect(Array.from(new Float32Array(second.data))).toEqual([20, 20, 20]);
      expect([second.width, second.height, second.rawValueToMeters]).toEqual([
        3, 1, 0.01,
      ]);
      expect(renderer.getRenderTarget()).toBe(originalTarget);
      expect(renderer.xr.enabled).toBe(true);
    } finally {
      converter.dispose();
      originalTarget.dispose();
    }
  });
  it('restores the borrowed render target and XR state after readback fails', () => {
    const {converter, renderer, originalTarget} = createConverter();
    renderer.readRenderTargetPixels.mockImplementation(() => {
      throw new Error('read failed');
    });
    try {
      expect(() => converter.convertGPUToCPU(createDepthData())).toThrow(
        'read failed'
      );
      expect(renderer.getRenderTarget()).toBe(originalTarget);
      expect(renderer.xr.enabled).toBe(true);
    } finally {
      converter.dispose();
      originalTarget.dispose();
    }
  });
  it('releases all conversion resources after one disposal listener fails', () => {
    const {converter, renderer, originalTarget} = createConverter();
    converter.convertGPUToCPU(createDepthData());
    const target = renderer.setRenderTarget.mock.calls[0][0]!,
      scene = renderer.render.mock.calls[0][0],
      mesh = getDepthMesh(scene);
    const texture = mesh.material.uniforms.uTexture.value;
    const released = [target, mesh.geometry, mesh.material, texture].map(
      (resource) => vi.spyOn(resource, 'dispose')
    );
    mesh.geometry.addEventListener('dispose', () => {
      throw new Error('release failed');
    });
    try {
      expect(() => converter.dispose()).toThrow('release failed');
      expect(() => converter.dispose()).not.toThrow();
      for (const dispose of released) expect(dispose).toHaveBeenCalledOnce();
      expect(texture.sourceTexture).toBeNull();
      expect(scene.children).toEqual([]);
    } finally {
      converter.dispose();
      originalTarget.dispose();
    }
  });
});
