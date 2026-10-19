import '../addons/testing/setup';
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import * as THREE from 'three';
import {XREstimatedLight} from 'three/addons/webxr/XREstimatedLight.js';
import type {WebGPURenderer} from 'three/webgpu';

import {Lighting} from './Lighting';
import {LightingOptions} from './LightingOptions';

vi.mock('three/addons/webxr/XREstimatedLight.js', () => {
  return {
    XREstimatedLight: vi.fn().mockImplementation(function (
      this: {
        directionalLight: THREE.DirectionalLight;
        lightProbe: THREE.LightProbe;
        addEventListener: ReturnType<typeof vi.fn>;
        removeEventListener: ReturnType<typeof vi.fn>;
        dispose: ReturnType<typeof vi.fn>;
      },
      _renderer: unknown,
      _environmentEstimation?: boolean
    ) {
      this.directionalLight = new THREE.DirectionalLight();
      this.lightProbe = new THREE.LightProbe();
      this.addEventListener = vi.fn();
      this.removeEventListener = vi.fn();
      this.removeFromParent = vi.fn();
      this.dispose = vi.fn();
    }),
  };
});

function createMockWebGLRenderer(): THREE.WebGLRenderer {
  return {
    shadowMap: {
      enabled: false,
      type: THREE.BasicShadowMap,
    },
    xr: {
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    },
  } as unknown as THREE.WebGLRenderer;
}

function createMockWebGPURenderer(): WebGPURenderer {
  return {
    isWebGPURenderer: true,
    shadowMap: {
      enabled: false,
      type: THREE.BasicShadowMap,
    },
    xr: {
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    },
  } as unknown as WebGPURenderer;
}

describe('Lighting', () => {
  beforeEach(() => {
    Lighting.instance?.dispose();
    Lighting.instance = undefined;
    vi.clearAllMocks();
  });

  afterEach(() => {
    Lighting.instance?.dispose();
    Lighting.instance = undefined;
  });

  it('disables environment estimation across renderers while keeping light estimation', () => {
    const lighting = new Lighting();
    const scene = new THREE.Scene();
    const renderer = createMockWebGLRenderer();
    const options = new LightingOptions();
    options.enabled = true;

    lighting.init(options, renderer, scene);

    expect(XREstimatedLight).toHaveBeenCalledWith(renderer, false);
  });

  it('disables environment estimation on WebGPURenderer while keeping light estimation', () => {
    const lighting = new Lighting();
    const scene = new THREE.Scene();
    const renderer = createMockWebGPURenderer();
    const options = new LightingOptions();
    options.enabled = true;

    lighting.init(options, renderer, scene);

    expect(XREstimatedLight).toHaveBeenCalledWith(renderer, false);
  });

  it('enables shadow map on renderer when castDirectionalLightShadow is true', () => {
    const lighting = new Lighting();
    const scene = new THREE.Scene();
    const renderer = createMockWebGPURenderer();
    const options = new LightingOptions();
    options.enabled = true;
    options.castDirectionalLightShadow = true;

    lighting.init(options, renderer, scene);

    expect(renderer.shadowMap.enabled).toBe(true);
    expect(renderer.shadowMap.type).toBe(THREE.PCFShadowMap);
    expect(lighting.dirLight.castShadow).toBe(true);
  });

  it('populates default lighting values when simulatorRunning is true', () => {
    const lighting = new Lighting();
    const scene = new THREE.Scene();
    const renderer = createMockWebGPURenderer();
    const options = new LightingOptions();
    options.enabled = true;

    lighting.init(options, renderer, scene);
    lighting.simulatorRunning = true;
    lighting.update();

    expect(lighting.dirLight.intensity).toBe(3.8);
    expect(lighting.dirLight.position.x).toBe(-10.0);
    expect(lighting.dirLight.position.y).toBe(10.0);
    expect(lighting.ambientProbe.intensity).toBe(1.0);
    expect(lighting.ambientLight.x).toBeGreaterThan(0);
  });

  it('disposes resources and clears singleton instance', () => {
    const lighting = new Lighting();
    const scene = new THREE.Scene();
    const renderer = createMockWebGLRenderer();
    const options = new LightingOptions();
    options.enabled = true;

    lighting.init(options, renderer, scene);
    expect(Lighting.instance).toBe(lighting);

    lighting.dispose();
    expect(Lighting.instance).toBeUndefined();
  });
});
