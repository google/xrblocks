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
