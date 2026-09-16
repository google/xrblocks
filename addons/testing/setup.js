import { vi } from 'vitest';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

/*
Mock THREE and WebGL/WebAudio API for JSDOM/Vitest environments.
Runs globally before XRBlocks instantiates.

Stubs WebGL/WebAudio APIs, mocks GLTFLoader to return
hands with bones immediately under the root scene.
*/
// Stub AudioContext globally.
const globalRecord = globalThis;
if (typeof globalRecord.AudioContext === 'undefined') {
    const mockAudioParam = {
        value: 0,
        setValueAtTime: () => { },
        linearRampToValueAtTime: () => { },
        setTargetAtTime: () => { },
        cancelScheduledValues: () => { },
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
        setPosition: () => { },
        setOrientation: () => { },
    };
    globalRecord.AudioContext = function () {
        return {
            createGain: () => ({
                connect: () => { },
            }),
            destination: {},
            listener: mockAudioListener,
        };
    };
}
// Mock three WebGLRenderer for JSDOM headless testing.
vi.mock('three', async (importOriginal) => {
    const original = await importOriginal();
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
            hand.joints = {};
        });
        self.xr = {
            enabled: false,
            isPresenting: false,
            addEventListener: () => { },
            removeEventListener: () => { },
            getDepthSensingMesh: () => null,
            setReferenceSpaceType: () => { },
            setAnimationLoop: () => { },
            getController: (i) => controllers[i],
            getControllerGrip: (i) => controllerGrips[i],
            getHand: (i) => hands[i],
            getCamera: () => ({ cameras: [] }),
            cameraAutoUpdate: true,
        };
        self.shadowMap = { enabled: false };
        self.capabilities = { isWebGL2: false };
        self.autoClearColor = true;
        self.localClippingEnabled = false;
        self.setPixelRatio = () => { };
        self.setSize = () => { };
        self.setRenderTarget = () => { };
        self.setAnimationLoop = () => { };
        self.clear = () => { };
        self.render = () => { };
        self.setTransparentSort = () => { };
        self.clearDepth = () => { };
        self.dispose = () => { };
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
    const original = await vi.importActual('three');
    class MockWebGPURenderer {
        constructor() {
            this.isWebGPURenderer = true;
            this.domElement = document.createElement('canvas');
            this.shadowMap = { enabled: false };
            this.xr = {
                enabled: false,
                isPresenting: false,
                getCamera: vi.fn(() => ({ cameras: [] })),
                getController: vi.fn(() => new original.Group()),
                getControllerGrip: vi.fn(() => new original.Group()),
                getHand: vi.fn(() => {
                    const hand = new original.Group();
                    hand.joints = {};
                    return hand;
                }),
                addEventListener: vi.fn(),
                removeEventListener: vi.fn(),
                setReferenceSpaceType: vi.fn(),
                setAnimationLoop: vi.fn(),
                getDepthSensingMesh: vi.fn(() => null),
            };
            this.init = vi.fn().mockResolvedValue(undefined);
            this.setPixelRatio = vi.fn();
            this.setSize = vi.fn();
            this.setAnimationLoop = vi.fn();
            this.render = vi.fn();
            this.dispose = vi.fn();
            this.hasFeature = vi.fn(() => false);
            this.clear = vi.fn();
            this.clearDepth = vi.fn();
            this.setRenderTarget = vi.fn();
        }
    }
    class MockNodeMaterial extends original.Material {
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
        return !!(canvas.getContext('webgl') || canvas.getContext('experimental-webgl'));
    }
    catch {
        return false;
    }
};
if (!isWebGLSupported()) {
    const { HAND_JOINT_NAMES } = await import('xrblocks');
    GLTFLoader.prototype.load = function (_url, onLoad) {
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
            });
        }
    };
}
