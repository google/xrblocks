/*
Mock THREE and WebGL/WebAudio API for JSDOM/Vitest environments. 
Runs globally before XRBlocks instantiates.

Stubs WebGL/WebAudio APIs, mocks GLTFLoader to return
hands with bones immediately under the root scene.
*/

import {vi} from 'vitest';
import * as THREE from 'three';
import {GLTFLoader, type GLTF} from 'three/addons/loaders/GLTFLoader.js';

// Stub AudioContext globally.
const globalRecord = globalThis as unknown as Record<string, unknown>;
if (typeof globalRecord.AudioContext === 'undefined') {
  const mockAudioParam = {
    value: 0,
    setValueAtTime: () => {},
    linearRampToValueAtTime: () => {},
    setTargetAtTime: () => {},
    cancelScheduledValues: () => {},
    defaultValue: 0,
    minValue: 0,
    maxValue: 0,
  };

  const mockAudioListener = {
    positionX: mockAudioParam,
    positionY: mockAudioParam,
    positionZ: mockAudioParam,
    forwardX: mockAudioParam,
    forwardY: mockAudioParam,
    forwardZ: mockAudioParam,
    upX: mockAudioParam,
    upY: mockAudioParam,
    upZ: mockAudioParam,
    setPosition: () => {},
    setOrientation: () => {},
  };

  globalRecord.AudioContext = function () {
    return {
      createGain: () => ({
        connect: () => {},
      }),
      destination: {},
      listener: mockAudioListener,
    };
  };
}

// Mock three WebGLRenderer for JSDOM headless testing.
vi.mock('three', async (importOriginal) => {
  const original = await importOriginal<typeof import('three')>();

  const MockWebGLRenderer = function WebGLRenderer() {
    const self = Object.create(original.WebGLRenderer.prototype);
    self.constructor = MockWebGLRenderer;

    self.domElement = document.createElement('canvas');
    self.extensions = {
      has: () => false,
      get: () => null,
    };
    const controllers = [new original.Group(), new original.Group()];
    const controllerGrips = [new original.Group(), new original.Group()];
    const hands = [new original.Group(), new original.Group()];
    hands.forEach((hand) => {
      (hand as unknown as {joints: unknown}).joints = {};
    });

    self.xr = {
      enabled: false,
      isPresenting: false,
      addEventListener: () => {},
      removeEventListener: () => {},
      getDepthSensingMesh: () => null,
      setReferenceSpaceType: () => {},
      setAnimationLoop: () => {},
      getController: (i: number) => controllers[i],
      getControllerGrip: (i: number) => controllerGrips[i],
      getHand: (i: number) => hands[i],
      getCamera: () => ({cameras: []}),
      cameraAutoUpdate: true,
    };
    self.shadowMap = {enabled: false};
    self.capabilities = {isWebGL2: false};
    self.autoClearColor = true;
    self.localClippingEnabled = false;

    self.setPixelRatio = () => {};
    self.setSize = () => {};
    self.setRenderTarget = () => {};
    self.setAnimationLoop = () => {};
    self.clear = () => {};
    self.render = () => {};
    self.setTransparentSort = () => {};
    self.clearDepth = () => {};
    self.dispose = () => {};
    self.getRenderTarget = () => null;
    self.readRenderTargetPixelsAsync = () => Promise.resolve();

    return self;
  };

  MockWebGLRenderer.prototype = original.WebGLRenderer.prototype;

  return {
    ...original,
    WebGLRenderer: MockWebGLRenderer,
  };
});

// Mock three/webgpu WebGPURenderer for JSDOM headless testing.
vi.mock('three/webgpu', async () => {
  const original = await vi.importActual<typeof import('three')>('three');

  class MockWebGPURenderer {
    isWebGPURenderer = true;
    domElement = document.createElement('canvas');
    shadowMap = {enabled: false};
    xr = {
      enabled: false,
      isPresenting: false,
      getCamera: vi.fn(() => ({cameras: []})),
      getController: vi.fn(() => new original.Group()),
      getControllerGrip: vi.fn(() => new original.Group()),
      getHand: vi.fn(() => {
        const hand = new original.Group();
        (hand as unknown as {joints: unknown}).joints = {};
        return hand;
      }),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      setReferenceSpaceType: vi.fn(),
      setAnimationLoop: vi.fn(),
      getDepthSensingMesh: vi.fn(() => null),
    };
    init = vi.fn().mockResolvedValue(undefined);
    setPixelRatio = vi.fn();
    setSize = vi.fn();
    setAnimationLoop = vi.fn();
    render = vi.fn();
    dispose = vi.fn();
    hasFeature = vi.fn(() => false);
    clear = vi.fn();
    clearDepth = vi.fn();
    setRenderTarget = vi.fn();
  }

  class MockNodeMaterial extends original.Material {
    fragmentNode: unknown;
  }

  return {
    WebGPURenderer: MockWebGPURenderer,
    NodeMaterial: MockNodeMaterial,
  };
});

// Mock GLTFLoader to return a mock hand hierarchy with bones immediately under JSDOM.
const isWebGLSupported = () => {
  try {
    const canvas = document.createElement('canvas');
    return !!(
      canvas.getContext('webgl') || canvas.getContext('experimental-webgl')
    );
  } catch {
    return false;
  }
};

if (!isWebGLSupported()) {
  const {HAND_JOINT_NAMES} = await import('xrblocks');

  GLTFLoader.prototype.load = function (
    _url: string,
    onLoad?: (gltf: GLTF) => void
  ) {
    const mockHandScene = new THREE.Group();
    for (const jointName of HAND_JOINT_NAMES) {
      const bone = new THREE.Group();
      bone.name = jointName;
      mockHandScene.add(bone);
    }
    if (onLoad) {
      onLoad({
        scene: mockHandScene,
        scenes: [mockHandScene],
        animations: [],
        cameras: [],
        asset: {},
      } as unknown as GLTF);
    }
  } as typeof GLTFLoader.prototype.load;
}
