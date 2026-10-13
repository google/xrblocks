import * as THREE from 'three';
import {afterEach, describe, expect, it, vi} from 'vitest';

import {
  createCardEdgeMaterial,
  createUnifiedPanelMaterial,
  ensureWebGPUUIMaterials,
  setWebGPUUIHandler,
  setWebGPUUIMaterialLoader,
} from './PanelMaterialFactory';
import {UnifiedPanelLayer} from '../primitives/layers/UnifiedPanelLayer';
import {updatePaintUniforms} from '../utils/GradientPanelUtils';
import {webgpuUIHandler} from './WebGPUUIMaterials';

describe('WebGPUUIMaterials', () => {
  afterEach(() => {
    setWebGPUUIHandler(webgpuUIHandler);
    setWebGPUUIMaterialLoader(undefined);
  });

  it('shares the structural program cache key across UnifiedPanelLayer instances while keeping per-material gradient arrays independent', () => {
    setWebGPUUIHandler(webgpuUIHandler);

    const layerA = new UnifiedPanelLayer(undefined, undefined);
    const layerB = new UnifiedPanelLayer(undefined, undefined);

    updatePaintUniforms(
      layerA.material.uniforms,
      {
        gradientType: 'radial',
        stops: [
          {position: 0, color: '#ff0000'},
          {position: 1, color: '#00ff00'},
        ],
      },
      'u_fill_'
    );
    updatePaintUniforms(
      layerB.material.uniforms,
      {
        gradientType: 'linear',
        stops: [
          {position: 0.2, color: '#0000ff'},
          {position: 0.8, color: '#ffff00'},
        ],
      },
      'u_fill_'
    );

    expect(layerA.material.customProgramCacheKey()).toBe(
      layerB.material.customProgramCacheKey()
    );

    const stopsA = layerA.material.uniforms.u_fill_gradientStops
      .value as number[];
    const stopsB = layerB.material.uniforms.u_fill_gradientStops
      .value as number[];
    expect(stopsA).not.toBe(stopsB);
    expect(stopsA[0]).toBe(0);
    expect(stopsA[1]).toBe(1);
    expect(stopsB[0]).toBe(0.2);
    expect(stopsB[1]).toBe(0.8);

    const colorsA = layerA.material.uniforms.u_fill_gradientColors
      .value as THREE.Vector4[];
    const colorsB = layerB.material.uniforms.u_fill_gradientColors
      .value as THREE.Vector4[];
    expect(colorsA).not.toBe(colorsB);
    expect(colorsA[0].x).toBeGreaterThan(0.9);
    expect(colorsB[0].z).toBeGreaterThan(0.9);

    layerA.material.dispose();
    layerB.material.dispose();
  });

  it('re-runs a newly registered material loader after handler reset', async () => {
    setWebGPUUIHandler(undefined);
    const loader = vi.fn(async () => {
      setWebGPUUIHandler(webgpuUIHandler);
    });
    setWebGPUUIMaterialLoader(loader);

    await ensureWebGPUUIMaterials();
    expect(loader).toHaveBeenCalledTimes(1);

    const unified = createUnifiedPanelMaterial({uniforms: {}});
    const edge = createCardEdgeMaterial({uniforms: {}});
    expect('colorNode' in unified).toBe(true);
    expect('colorNode' in edge).toBe(true);

    unified.dispose();
    edge.dispose();
  });
});
