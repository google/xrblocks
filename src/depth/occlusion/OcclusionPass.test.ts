import * as THREE from 'three';
import {expect, it} from 'vitest';
import {OcclusionPass} from './OcclusionPass';
import {WebGPUOcclusionPass} from './WebGPUOcclusionPass';
import {addWebGPUOcclusionToMaterial} from './WebGPUOcclusionUtils';

function boundary() {
  const original = new THREE.WebGLRenderTarget(2, 2);
  let target: THREE.RenderTarget | null = original;
  const targets = new Set<THREE.RenderTarget>(),
    materials = new Set<THREE.Material>();
  const renderer = {
    isWebGLRenderer: true,
    xr: {getCamera: () => new THREE.ArrayCamera([])},
    getRenderTarget: () => target,
    setRenderTarget(value: THREE.RenderTarget | null) {
      target = value;
      if (value && value !== original) targets.add(value);
    },
    getDrawingBufferSize: (out: THREE.Vector2) => out.set(32, 16),
    clear() {},
    render(object: THREE.Object3D) {
      const material =
        object instanceof THREE.Scene
          ? object.overrideMaterial
          : (object as THREE.Mesh).material;
      if (material && !Array.isArray(material)) materials.add(material);
    },
  };
  return {renderer, original, targets, materials};
}
it('projects occlusion with the measured depth camera instead of the render camera', () => {
  const f = boundary(),
    scene = new THREE.Scene(),
    camera = new THREE.PerspectiveCamera(50, 1);
  camera.position.x = 99;
  camera.updateMatrixWorld(true);
  const pass = new OcclusionPass(scene, camera),
    texture = new THREE.Texture();
  const depthView = new THREE.Matrix4().makeTranslation(-1, -2, -3),
    depthProjection = new THREE.PerspectiveCamera(90, 1, 0.1, 20)
      .projectionMatrix;
  pass.setDepthTexture(texture, 0.01, 0, undefined, depthView, depthProjection);
  try {
    pass.render(f.renderer as never);
    const material = [...f.materials].find(
      (material) =>
        'uniforms' in material &&
        (material as THREE.ShaderMaterial).uniforms.uDepthViewMatrix
    ) as THREE.ShaderMaterial;
    const point = new THREE.Vector3(4, 2, -1)
      .applyMatrix4(material.uniforms.uDepthViewMatrix.value)
      .applyMatrix4(material.uniforms.uDepthProjectionMatrix.value);
    expect(point.x).toBeCloseTo(0.75);
    expect(point.y).toBeCloseTo(0);
    expect(material.uniforms.uDepthTexture.value).toBe(texture);
    expect(scene.overrideMaterial).toBeNull();
    expect(f.renderer.getRenderTarget()).toBe(f.original);
  } finally {
    pass.dispose();
    texture.dispose();
    f.original.dispose();
  }
});
it('uses the current environment depth in the read-buffer shader', () => {
  const f = boundary(),
    pass = new OcclusionPass(new THREE.Scene(), new THREE.PerspectiveCamera()),
    environment = new THREE.Texture();
  const read = new THREE.WebGLRenderTarget(8, 4);
  read.depthTexture = new THREE.DepthTexture(8, 4);
  try {
    pass.setDepthTexture(environment, 0.01, 0);
    pass.render(f.renderer as never, undefined, read);
    expect(
      [...f.materials].some(
        (material) =>
          material instanceof THREE.ShaderMaterial &&
          material.uniforms.uDepthTexture?.value === environment
      )
    ).toBe(true);
  } finally {
    pass.dispose();
    environment.dispose();
    read.depthTexture.dispose();
    read.dispose();
    f.original.dispose();
  }
});
it.each([
  ['WebGL', OcclusionPass],
  ['WebGPU', WebGPUOcclusionPass],
] as const)(
  '%s restores renderer state and releases output resources without disposing its input',
  (_, Pass) => {
    const f = boundary(),
      scene = new THREE.Scene(),
      camera = new THREE.PerspectiveCamera(90, 1, 0.1, 10);
    camera.position.z = 2;
    camera.updateMatrixWorld(true);
    const pass = new Pass(scene, camera),
      input = new THREE.DataTexture(
        new Float32Array([1, 2, 3, 4]),
        2,
        2,
        THREE.RedFormat,
        THREE.FloatType
      );
    let inputDisposed = false;
    input.addEventListener('dispose', () => {
      inputDisposed = true;
    });
    try {
      pass.setDepthTexture(input, 1, 0);
      pass.render(f.renderer as never);
      expect(f.renderer.getRenderTarget()).toBe(f.original);
      expect(scene.overrideMaterial).toBeNull();
      if (pass instanceof WebGPUOcclusionPass) {
        const material = new THREE.MeshStandardMaterial(),
          shader = addWebGPUOcclusionToMaterial(material);
        pass.updateOcclusionMapUniforms(shader.uniforms, f.renderer as never);
        const clip = new THREE.Vector3(1, 0, 0).applyMatrix4(
          shader.uniforms.uOcclusionClipFromWorld.value
        );
        expect(clip.x).toBeCloseTo(0.5);
        expect(
          [...f.targets].some(
            (target) => target.texture === shader.uniforms.tOcclusionMap.value
          )
        ).toBe(true);
        material.dispose();
      }
      const released = new Set<object>();
      for (const resource of [...f.targets, ...f.materials])
        resource.addEventListener('dispose', () => {
          released.add(resource);
        });
      pass.dispose();
      for (const resource of [...f.targets, ...f.materials])
        expect(released.has(resource)).toBe(true);
      expect(inputDisposed).toBe(false);
    } finally {
      pass.dispose();
      input.dispose();
      f.original.dispose();
    }
  }
);
