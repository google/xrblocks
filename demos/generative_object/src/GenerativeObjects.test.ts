import * as THREE from 'three';
import {afterEach, describe, expect, it, vi} from 'vitest';
import {AI, Depth, DepthMesh, ScriptsManager} from 'xrblocks';

import {HitRegistry} from '../../../src/interaction/HitRegistry';
import {GenerativeObjects} from './GenerativeObjects.js';
import type {LoadedTexture} from './TextureSource.js';

vi.mock('../../../src/singletons', () => ({}));

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return {promise, resolve};
}

function loaded(): LoadedTexture {
  return {
    texture: new THREE.Texture(),
    displacementTexture: new THREE.Texture(),
    width: 100,
    height: 200,
  };
}

function setup() {
  const ai = new AI();
  vi.spyOn(ai, 'isAvailable').mockReturnValue(true);
  const generate = vi.spyOn(ai, 'generate').mockResolvedValue('data:image');
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera();
  Depth.instance = undefined;
  const depth = new Depth();
  const helper = new GenerativeObjects();
  const initialize = () => helper.init({ai, camera, scene, depth});
  initialize();
  const load = vi.fn(async () => loaded());
  helper.textureSource = {load};
  return {ai, generate, scene, camera, depth, helper, load, initialize};
}

function compile(material: THREE.Material) {
  const shader = {
    uniforms: {},
    vertexShader: THREE.ShaderLib.basic.vertexShader,
    fragmentShader: THREE.ShaderLib.basic.fragmentShader,
  } as THREE.WebGLProgramParametersWithUniforms;
  material.onBeforeCompile(shader, {} as THREE.WebGLRenderer);
  return shader;
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('GenerativeObjects cancellation and ownership', () => {
  it('does not decode or place an AI response received after Clear', async () => {
    const s = setup();
    const ai = deferred<string>();
    s.generate.mockReturnValue(ai.promise);
    const pending = s.helper.imagine('dragon');
    s.helper.clearObjects();
    ai.resolve('data:image');

    expect(await pending).toBeNull();
    expect(s.load).not.toHaveBeenCalled();
    expect(s.helper.objects).toHaveLength(0);
    expect(s.scene.children).toHaveLength(0);
  });

  it('discards both decoded textures after Clear during decoding', async () => {
    const s = setup();
    const decoding = deferred<LoadedTexture>();
    const result = loaded();
    const color = vi.spyOn(result.texture, 'dispose');
    const displacement = vi.spyOn(result.displacementTexture!, 'dispose');
    s.load.mockReturnValue(decoding.promise);
    const pending = s.helper.imagine('dragon');
    await vi.waitFor(() => expect(s.load).toHaveBeenCalledOnce());
    s.helper.clearObjects();
    decoding.resolve(result);

    expect(await pending).toBeNull();
    expect(color).toHaveBeenCalledOnce();
    expect(displacement).toHaveBeenCalledOnce();
  });

  it('invalidates AI work across disposal and reinitialization', async () => {
    const s = setup();
    const ai = deferred<string>();
    s.generate.mockReturnValue(ai.promise);
    const pending = s.helper.imagine('old dragon');
    s.helper.dispose();
    s.initialize();
    s.helper.textureSource = {load: s.load};
    ai.resolve('data:image');

    expect(await pending).toBeNull();
    expect(s.load).not.toHaveBeenCalled();
    s.generate.mockResolvedValue('data:new-image');
    expect(await s.helper.imagine('new dragon')).not.toBeNull();
  });

  it('discards decoded data and refuses new work after disposal', async () => {
    const s = setup();
    const decoding = deferred<LoadedTexture>();
    const result = loaded();
    const color = vi.spyOn(result.texture, 'dispose');
    s.load.mockReturnValue(decoding.promise);
    const pending = s.helper.generateBillboard('data:image');
    s.helper.dispose();
    decoding.resolve(result);

    expect(await pending).toBeNull();
    expect(color).toHaveBeenCalledOnce();
    expect(await s.helper.imagine('late callback')).toBeNull();
    expect(await s.helper.generateBillboard('data:late')).toBeNull();
    expect(s.load).toHaveBeenCalledOnce();
    expect(s.generate).not.toHaveBeenCalled();
  });

  it('leaves the shared depth raycast untouched through update and teardown', () => {
    const s = setup();
    s.depth.depthMesh = new DepthMesh(s.depth.options, 4, 4);
    const raycast = s.depth.depthMesh.raycast;
    expect(s.depth.depthMesh.xb?.pointerEvents).toBe('none');

    s.helper.update();
    expect(s.depth.depthMesh.raycast).toBe(raycast);
    s.helper.dispose();
    expect(s.depth.depthMesh.raycast).toBe(raycast);
  });

  it('grounds on depth directly while the shared pointer query skips it', async () => {
    const s = setup();
    s.depth.options.enabled = true;
    s.depth.options.depthMesh.useDownsampledGeometry = false;
    const mesh = new DepthMesh(s.depth.options, 4, 4);
    mesh.position.z = -0.75;
    s.depth.depthMesh = mesh;
    s.scene.add(mesh);
    s.helper.update();

    const hits = new HitRegistry(s.camera).raycast(
      s.scene,
      new THREE.Ray(new THREE.Vector3(), new THREE.Vector3(0, 0, -1)),
      []
    );
    expect(hits).toHaveLength(0);
    const object = (await s.helper.generateBillboard('data:image'))!;
    expect(object.position.x).toBeCloseTo(0);
    expect(object.position.y).toBeCloseTo(0);
    expect(object.position.z).toBeCloseTo(-0.75 + 0.08);
    s.helper.dispose();
    mesh.geometry.dispose();
    for (const material of Array.isArray(mesh.material)
      ? mesh.material
      : [mesh.material]) {
      material.dispose();
    }
  });

  it('does not register shaders for a registered but disabled Depth', async () => {
    const s = setup();
    s.depth.options.occlusion.enabled = true;
    const object = (await s.helper.generateBillboard('data:image'))!;
    const shader = compile(object.mesh.material);

    expect(s.depth.occludableShaders.size).toBe(0);
    expect(shader.uniforms.occlusionEnabled).toBeUndefined();
  });

  it('does not register shaders when occlusion alone is disabled', async () => {
    const s = setup();
    s.depth.options.enabled = true;
    const object = (await s.helper.generateBillboard('data:image'))!;
    compile(object.mesh.material);
    expect(s.depth.occludableShaders.size).toBe(0);
  });

  it('unregisters every material program variant on Clear', async () => {
    const s = setup();
    s.depth.options.enabled = true;
    s.depth.options.occlusion.enabled = true;
    const object = (await s.helper.generateBillboard('data:image'))!;
    compile(object.mesh.material);
    compile(object.mesh.material);
    expect(s.depth.occludableShaders.size).toBe(2);

    s.helper.clearObjects();
    expect(s.depth.occludableShaders.size).toBe(0);
    compile(object.mesh.material);
    expect(s.depth.occludableShaders.size).toBe(0);
  });

  it('releases shader registrations when an object itself is disposed', async () => {
    const s = setup();
    s.depth.options.enabled = true;
    s.depth.options.occlusion.enabled = true;
    const object = (await s.helper.generateBillboard('data:image'))!;
    compile(object.mesh.material);
    object.dispose();
    expect(s.depth.occludableShaders.size).toBe(0);
  });

  it('releases siblings when the lifecycle removes and recreates the helper', async () => {
    const s = setup();
    const manager = new ScriptsManager(async (script) => {
      if (script instanceof GenerativeObjects) {
        script.init(s);
        script.textureSource = {load: s.load};
      }
    });
    s.scene.add(s.helper);
    await manager.syncScriptsWithScene(s.scene);
    const object = (await s.helper.generateBillboard('data:image'))!;
    const geometry = vi.spyOn(object.mesh.geometry, 'dispose');
    await manager.syncScriptsWithScene(s.scene);
    s.helper.removeFromParent();
    await manager.syncScriptsWithScene(s.scene);
    await manager.syncScriptsWithScene(s.scene);

    expect(object.parent).toBeNull();
    expect(geometry).toHaveBeenCalledOnce();
    expect(s.helper.objects).toHaveLength(0);

    const replacement = new GenerativeObjects();
    s.scene.add(replacement);
    await manager.syncScriptsWithScene(s.scene);
    expect(await replacement.imagine('new dragon')).not.toBeNull();
    replacement.removeFromParent();
    await manager.syncScriptsWithScene(s.scene);
    expect(s.scene.children).toHaveLength(0);
    await manager.dispose();
  });

  it('attempts all resource releases even when geometry disposal throws', async () => {
    const s = setup();
    const first = (await s.helper.generateBillboard('data:first'))!;
    const second = (await s.helper.generateBillboard('data:second'))!;
    const material = vi.spyOn(first.mesh.material, 'dispose');
    const secondDispose = vi.spyOn(second, 'dispose');
    const failure = new Error('geometry failed');
    vi.spyOn(first.mesh.geometry, 'dispose').mockImplementation(() => {
      throw failure;
    });
    vi.spyOn(console, 'error').mockImplementation(() => {});

    expect(() => s.helper.dispose()).toThrow(failure);
    expect(material).toHaveBeenCalledOnce();
    expect(secondDispose).toHaveBeenCalledOnce();
    expect(s.helper.objects).toHaveLength(0);
    expect(s.scene.children).toHaveLength(0);
    expect(() => s.helper.dispose()).not.toThrow();
  });

  it('keeps translation, aspect ratio, and distinct texture disposal', async () => {
    const s = setup();
    s.helper.options.relief = true;
    const result = loaded();
    s.load.mockResolvedValue(result);
    const object = (await s.helper.generateBillboard('data:image'))!;
    expect(object.xb?.manipulation).toEqual({
      actions: {translate: true},
      handle: {action: 'translate'},
    });
    expect(object.mesh.scale.toArray()).toEqual([0.3, 0.6, 1]);
    const color = vi.spyOn(result.texture, 'dispose');
    const displacement = vi.spyOn(result.displacementTexture!, 'dispose');
    s.helper.clearObjects();
    expect(color).toHaveBeenCalledOnce();
    expect(displacement).toHaveBeenCalledOnce();
    expect(object.parent).toBeNull();
  });
});
