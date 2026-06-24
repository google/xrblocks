import * as THREE from 'three';
import {describe, it, expect, vi, beforeEach} from 'vitest';

import type {AI} from '../ai/AI';

import {GenerativeObjects} from './GenerativeObjects';
import {GenerativeOptions} from './GenerativeOptions';
import type {LoadedTexture, TextureSource} from './TextureSource';

const FIXTURE_DATA_URL = 'data:image/png;base64,AAAA';

function makeFakeTextureSource(width = 200, height = 100): TextureSource {
  return {
    load: vi.fn(
      async (): Promise<LoadedTexture> => ({
        texture: new THREE.Texture(),
        width,
        height,
      })
    ),
  };
}

function makeManager({
  available = true,
  generateResult = FIXTURE_DATA_URL as unknown,
  textureSource = makeFakeTextureSource(),
}: {
  available?: boolean;
  generateResult?: unknown;
  textureSource?: TextureSource;
} = {}) {
  const ai = {
    isAvailable: vi.fn(() => available),
    generate: vi.fn(async () => generateResult),
  } as unknown as AI;
  const camera = new THREE.PerspectiveCamera();
  camera.position.set(0, 0, 0);
  camera.updateMatrixWorld(true);
  const scene = new THREE.Scene();

  const manager = new GenerativeObjects();
  manager.init({ai, camera, scene});
  manager.textureSource = textureSource;
  manager.options = new GenerativeOptions();
  return {manager, ai, camera, scene};
}

describe('GenerativeObjects.imagine', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('generates an image and places a draggable object in the scene', async () => {
    const {manager, ai, scene} = makeManager();
    const object = await manager.imagine('a red apple');

    expect(object).not.toBeNull();
    expect(ai.generate).toHaveBeenCalled();
    expect(scene.children).toContain(object);
    expect(manager.objects).toHaveLength(1);
    expect(object!.draggable).toBe(true);
  });

  it('passes the system instruction to the image model', async () => {
    const {manager, ai} = makeManager();
    await manager.imagine('a red apple');
    expect(ai.generate).toHaveBeenCalledWith(
      'a red apple',
      'image',
      manager.options.systemInstruction
    );
  });

  it('scales the placed object to the source aspect ratio', async () => {
    const {manager} = makeManager({
      textureSource: makeFakeTextureSource(200, 100),
    });
    const object = await manager.imagine('x');
    expect(object!.mesh.scale.x).toBeCloseTo(0.6);
    expect(object!.mesh.scale.y).toBeCloseTo(0.3);
  });

  it('places the object in front of the user', async () => {
    const {manager} = makeManager();
    const object = await manager.imagine('x', {distance: 2});
    expect(object!.position.z).toBeCloseTo(-2);
  });

  it('returns null and does not call generate when AI is unavailable', async () => {
    const {manager, ai} = makeManager({available: false});
    const object = await manager.imagine('x');
    expect(object).toBeNull();
    expect(ai.generate).not.toHaveBeenCalled();
    expect(manager.objects).toHaveLength(0);
  });

  it('returns null when generation produces no image', async () => {
    const {manager, scene} = makeManager({generateResult: ''});
    const object = await manager.imagine('x');
    expect(object).toBeNull();
    expect(scene.children).toHaveLength(0);
  });

  it('honors a per-call maxSize override', async () => {
    const {manager} = makeManager({
      textureSource: makeFakeTextureSource(100, 100),
    });
    const object = await manager.imagine('x', {maxSize: 0.2});
    expect(object!.mesh.scale.x).toBeCloseTo(0.2);
    expect(object!.mesh.scale.y).toBeCloseTo(0.2);
  });
});

describe('GenerativeObjects.clear', () => {
  it('removes all generated objects from the scene', async () => {
    const {manager, scene} = makeManager();
    await manager.imagine('a');
    await manager.imagine('b');
    expect(manager.objects).toHaveLength(2);

    manager.clearObjects();
    expect(manager.objects).toHaveLength(0);
    expect(scene.children).toHaveLength(0);
  });
});

describe('GenerativeObjects billboarding', () => {
  it('turns objects to face the camera on update when billboard is on', async () => {
    const {manager, camera} = makeManager();
    const object = await manager.imagine('x');
    // Move the camera off to the side; the object should re-face it on update.
    camera.position.set(3, 0, 0);
    camera.updateMatrixWorld(true);
    manager.update();
    const normal = new THREE.Vector3(0, 0, 1).applyQuaternion(
      object.quaternion
    );
    const toCamera = camera.position.clone().sub(object.position).normalize();
    expect(normal.dot(toCamera)).toBeGreaterThan(0.99);
  });

  it('leaves orientation unchanged when billboard is off', async () => {
    const {manager, camera} = makeManager();
    const object = await manager.imagine('x');
    manager.options.billboard = false;
    const before = object.quaternion.clone();
    camera.position.set(3, 0, 0);
    camera.updateMatrixWorld(true);
    manager.update();
    expect(object.quaternion.equals(before)).toBe(true);
  });
});

describe('GenerativeObjects grounded placement', () => {
  it('stands the object on a horizontal surface, lifted by half its height', async () => {
    const {manager} = makeManager({
      textureSource: makeFakeTextureSource(100, 100),
    });
    manager.options.groundOnSurface = true;
    manager.raycastSurface_ = () => ({
      point: new THREE.Vector3(1, 0, -2),
      normal: new THREE.Vector3(0, 1, 0),
    });
    const object = await manager.imagine('x');
    // 100x100 image at maxSize 0.6 -> 0.6 tall, lifted half = 0.3.
    expect(object.position.x).toBeCloseTo(1);
    expect(object.position.y).toBeCloseTo(0.3);
    expect(object.position.z).toBeCloseTo(-2);
  });

  it('floats the object off a vertical surface along its normal', async () => {
    const {manager} = makeManager({
      textureSource: makeFakeTextureSource(100, 100),
    });
    manager.options.groundOnSurface = true;
    // A wall facing +Z (normal points toward the room).
    manager.raycastSurface_ = () => ({
      point: new THREE.Vector3(0, 1, -3),
      normal: new THREE.Vector3(0, 0, 1),
    });
    const object = await manager.imagine('x');
    // Offset 0.08 along the normal, stays at the hit height (no half-height lift).
    expect(object.position.x).toBeCloseTo(0);
    expect(object.position.y).toBeCloseTo(1);
    expect(object.position.z).toBeCloseTo(-2.92);
  });

  it('falls back to front-of-camera when there is no surface hit', async () => {
    const {manager} = makeManager();
    manager.options.groundOnSurface = true;
    manager.raycastSurface_ = () => null;
    const object = await manager.imagine('x', {distance: 2});
    expect(object.position.z).toBeCloseTo(-2);
    expect(object.position.y).toBeCloseTo(0);
  });
});

describe('GenerativeObjects occlusion', () => {
  it('opts the material into the occlusion shader when depth is present', async () => {
    const occludableShaders = new Set();
    const depth = {occludableShaders};
    const ai = {
      isAvailable: () => true,
      generate: async () => FIXTURE_DATA_URL,
    };
    const camera = new THREE.PerspectiveCamera();
    camera.updateMatrixWorld(true);
    const scene = new THREE.Scene();
    const manager = new GenerativeObjects();
    manager.init({ai, camera, scene, depth});
    manager.textureSource = makeFakeTextureSource();
    manager.options = new GenerativeOptions();
    const object = await manager.imagine('x');
    expect(typeof object.mesh.material.onBeforeCompile).toBe('function');
  });
});
