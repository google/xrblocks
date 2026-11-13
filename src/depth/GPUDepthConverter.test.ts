import {expect, it, vi} from 'vitest';
import {
  createConverter,
  createDepthData,
  getDepthMesh,
} from './GPUDepthConverter.test-fixture';
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
    expect(Array.from(new Float32Array(first.data))).toEqual([10, 10, 10, 10]);
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
