import * as THREE from 'three';
import {NodeFrame, WebGPURenderer, WGSLNodeBuilder} from 'three/webgpu';
import {Container} from '@pmndrs/uikit';
import {afterEach, describe, expect, it, vi} from 'vitest';

import {
  createCardEdgeMaterial,
  createUnifiedPanelMaterial,
  ensureWebGPUUIMaterials,
  setWebGPUUIHandler,
  setWebGPUUIMaterialLoader,
  type PanelMaterialOptions,
} from './PanelMaterialFactory';
import {UnifiedPanelLayer} from '../primitives/layers/UnifiedPanelLayer';
import {updatePaintUniforms} from '../utils/GradientPanelUtils';
import {webgpuUIHandler} from './WebGPUUIMaterials';
import {UICardEdge} from './UICardEdge';

// The npm UIKit used by Vitest has no optional WebGPU registry. Model that
// boundary so the installed wrapper is exercised just as it is with the fork.
const registry = vi.hoisted(() => {
  let installedHandlers:
    | {applyPanelMaterial: (material: unknown, options: unknown) => void}
    | undefined;
  return {
    applyPanelMaterial: vi.fn(),
    setWebGPUHandlers: vi.fn(
      (handlers: {
        applyPanelMaterial: (material: unknown, options: unknown) => void;
      }) => {
        installedHandlers = handlers;
      }
    ),
    getInstalledHandlers: () => installedHandlers,
  };
});
vi.mock('@pmndrs/uikit/webgpu', () => ({
  getWebGPUHandlers: () => ({applyPanelMaterial: registry.applyPanelMaterial}),
  setWebGPUHandlers: registry.setWebGPUHandlers,
}));

function compile(material: THREE.Material) {
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(), material);
  const renderer = new WebGPURenderer();
  const builder = new WGSLNodeBuilder(mesh, renderer);
  builder.scene = new THREE.Scene();
  builder.camera = new THREE.PerspectiveCamera();
  builder.build();
  mesh.geometry.dispose();
  return builder;
}

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
    const edge = new UICardEdge();
    expect(layerA.material.customProgramCacheKey()).not.toBe(
      edge.material.customProgramCacheKey()
    );
    edge.dispose();
    edge.material.dispose();

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

  it.each([
    ['unified', createUnifiedPanelMaterial, THREE.FrontSide, true],
    ['edge', createCardEdgeMaterial, THREE.DoubleSide, false],
  ] as const)(
    'matches GLSL %s material defaults and overrides',
    (_, create, side, depthWrite) => {
      for (const overrides of [
        {},
        {side: THREE.BackSide, depthWrite: false},
        {side: THREE.DoubleSide, depthWrite: true},
      ] satisfies Partial<PanelMaterialOptions>[]) {
        const uniforms = {u_opacity: {value: 0.4}};
        setWebGPUUIHandler(undefined);
        const gl = create({uniforms, ...overrides});
        setWebGPUUIHandler(webgpuUIHandler);
        const gpu = create({uniforms, ...overrides});
        for (const material of [gl, gpu]) {
          expect(material).toMatchObject({
            side,
            depthWrite,
            depthTest: true,
            transparent: true,
            fog: false,
            toneMapped: false,
            forceSinglePass: true,
            dithering: true,
            blending: THREE.NormalBlending,
            premultipliedAlpha: false,
            ...overrides,
          });
          expect(material.uniforms.u_opacity).toBe(uniforms.u_opacity);
          expect(material.uniforms.u_resolution.value).toEqual(
            new THREE.Vector2(1, 1)
          );
          material.dispose();
        }
      }
    }
  );

  it.each([
    ['unified', () => new UnifiedPanelLayer({fillColor: '#ffffff'})],
    ['edge', () => new UICardEdge()],
  ] as const)(
    'emits all four world-space clipping discards for %s panels',
    (_, create) => {
      const layer = create();
      const builder = compile(layer.material);
      const shader = builder.fragmentShader.replace(/\s+/g, ' ');
      for (let i = 0; i < 4; i++) {
        expect(shader).toContain(
          `if ( ( ( dot( v_positionWorld, object.xbPanelClip${i}.xyz ) + object.xbPanelClip${i}.w ) < 0.0 ) ) { discard;`
        );
      }
      layer.dispose();
      layer.material.dispose();
    }
  );

  it.each(['scroll', 'hidden'] as const)(
    'updates live UIKit %s planes under transformed parents without rebuilding',
    async (overflow) => {
      const mount = new THREE.Group();
      mount.position.set(0.3, 1.2, -2);
      mount.rotation.set(0.2, 0.4, -0.1);
      mount.scale.set(0.7, 0.9, 1.1);
      const viewport = new Container({
        width: 200,
        height: 100,
        pixelSize: 0.01,
        overflow,
      });
      const layer = new UnifiedPanelLayer({
        width: 300,
        height: 300,
        flexShrink: 0,
        fillColor: '#ffffff',
      });
      mount.add(viewport);
      viewport.add(layer);
      await vi.waitFor(() => {
        viewport.update(16);
        expect(viewport.size.peek()).toEqual([200, 100]);
      });
      mount.updateMatrixWorld(true);

      const builder = compile(layer.material);
      const planes = builder.updateNodes.filter((node) =>
        node.name?.startsWith('xbPanelClip')
      );
      expect(planes).toHaveLength(4);
      const frame = new NodeFrame();
      frame.material = layer.material;
      const update = () => {
        for (const plane of planes) plane.update(frame);
      };
      const inside = (x: number, y: number) => {
        const point = new THREE.Vector3(x, y, 0).applyMatrix4(
          mount.matrixWorld
        );
        return planes.every(
          ({value}) =>
            value.dot(new THREE.Vector4(point.x, point.y, point.z, 1)) >= 0
        );
      };
      update();
      expect(inside(0, 0)).toBe(true);
      for (const [x, y] of [
        [-1.1, 0],
        [1.1, 0],
        [0, -0.6],
        [0, 0.6],
      ]) {
        expect(inside(x, y)).toBe(false);
      }
      const before = planes.map(({value}) => value.clone());
      const key = layer.material.customProgramCacheKey();
      mount.position.x += 3;
      viewport.scrollPosition.value = [0, 50];
      viewport.update(16);
      mount.updateMatrixWorld(true);
      update();
      expect(planes.map(({value}) => value)).not.toEqual(before);
      expect(inside(0, 0)).toBe(true);
      expect(inside(1.1, 0)).toBe(false);
      expect(layer.material.customProgramCacheKey()).toBe(key);

      // A shared builder must bind the currently drawn material's planes, and
      // missing/null planes must disable clipping rather than retain stale data.
      const other = new UnifiedPanelLayer({fillColor: '#ff0000'});
      frame.material = other.material;
      update();
      expect(inside(1000, 1000)).toBe(true); // UIKit's no-clipping sentinels
      other.material.clippingPlanes = null;
      update();
      expect(planes.map(({value}) => value.toArray())).toEqual(
        Array(4).fill([0, 0, 0, 1])
      );
      other.material.clippingPlanes = [
        new THREE.Plane(new THREE.Vector3(1, 0, 0), -10),
      ];
      update();
      expect(planes[0].value.toArray()).toEqual([1, 0, 0, -10]);
      expect(planes[1].value.toArray()).toEqual([0, 0, 0, 1]);
      frame.material = layer.material;
      update();
      expect(inside(0, 0)).toBe(true);
      expect(inside(-1.1, 0)).toBe(false);

      other.dispose();
      other.material.dispose();
      layer.dispose();
      layer.material.dispose();
      viewport.dispose();
    }
  );

  it('keeps one cache revision suffix across image src changes and shows the converter the original key', () => {
    const handlers =
      registry.getInstalledHandlers() ??
      registry.setWebGPUHandlers.mock.calls[0]?.[0];
    if (!handlers) {
      throw new Error('WebGPU UI handlers were not registered');
    }
    const sourceKey = 'DarkBackgroundMaterial-uvGradient-v1';
    const material = {
      map: new THREE.Texture(),
      colorNode: undefined as unknown,
      customProgramCacheKey: () => sourceKey,
    };
    const converted = {rgb: 'converted color without alpha'};
    registry.applyPanelMaterial.mockImplementation((target) => {
      expect(target.customProgramCacheKey()).toBe(sourceKey);
      expect(target.colorNode).toBeUndefined();
      target.colorNode = converted;
    });
    const keys = new Set<string>();
    for (let i = 0; i < 100; i++) {
      material.map.dispose();
      material.map = new THREE.Texture();
      handlers.applyPanelMaterial(material, {type: 'normal'});
      const key = material.customProgramCacheKey();
      expect(key).toMatch(
        /^DarkBackgroundMaterial-uvGradient-v1\|xbTsl#\d+:\d+$/
      );
      expect(key.length).toBeLessThan(sourceKey.length + 25);
      expect(material.colorNode).toBe(converted);
      keys.add(key);
    }
    expect(keys.size).toBe(100); // new graph bindings for every replacement
    const other = {...material, customProgramCacheKey: () => sourceKey};
    handlers.applyPanelMaterial(other, {type: 'normal'});
    expect(keys.has(other.customProgramCacheKey())).toBe(false);
    // Removing the map restores the unsalted source key.
    handlers.applyPanelMaterial(Object.assign(material, {map: null}), {
      type: 'normal',
    });
    expect(material.customProgramCacheKey()).toBe(sourceKey);
    other.map.dispose();
  });
});
