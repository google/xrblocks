import * as THREE from 'three';
import {afterEach, expect, it} from 'vitest';
import {Registry} from '../core/components/Registry';
import {Depth} from './Depth';
import {DepthOptions} from './DepthOptions';
import {
  createConverter,
  createDepthData,
} from './GPUDepthConverter.test-fixture';

afterEach(() => {
  Depth.instance?.dispose();
  Depth.instance = undefined;
});
function initialize(
  renderer: ReturnType<typeof createConverter>['renderer'],
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
  const f = createConverter(),
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
  const f = createConverter(),
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
  const f = createConverter(),
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
  const f = createConverter(),
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
