import * as THREE from 'three';
import {NodeMaterial} from 'three/webgpu';
import {describe, expect, it, vi} from 'vitest';

import {GazeController} from '../../input/GazeController';
import {Input} from '../../input/Input';
import {Reticle} from './Reticle';
import {applyWebGPUReticleMaterial} from './ReticleWebGPUMaterial';

function getHoverRing(reticle: Reticle) {
  return (
    reticle as unknown as {
      hoverRing: THREE.Mesh<THREE.RingGeometry, THREE.MeshBasicMaterial>;
    }
  ).hoverRing;
}

describe('Reticle', () => {
  it('defaults to a 0.01 m outer radius', () => {
    const reticle = new Reticle();
    expect(
      (reticle.geometry as THREE.RingGeometry).parameters.outerRadius
    ).toBe(0.01);
    reticle.dispose();
  });

  it('scales with camera distance and composes with the pressed scale', () => {
    const reticle = new Reticle();
    const camera = new THREE.Vector3(0, 0, 0);

    for (const [distance, scale] of [
      [0.5, 0.75],
      [1, 1],
      [2, 1.5],
      [0, 0.5],
    ]) {
      reticle.position.set(0, 0, -distance);
      reticle.updateDistanceScale(camera);
      expect(reticle.scale.x).toBeCloseTo(scale);
      expect(reticle.scale.y).toBeCloseTo(scale);
      expect(reticle.scale.z).toBeCloseTo(scale);
    }

    reticle.position.set(0, 0, -2);
    reticle.updateDistanceScale(camera);
    reticle.setPressed(true);
    expect(reticle.scale.x).toBeCloseTo(1.5 * 0.7);
    reticle.setPressedAmount(0.5);
    expect(reticle.scale.x).toBeCloseTo(1.5 * 0.85);
    reticle.setPressed(false);
    expect(reticle.scale.x).toBeCloseTo(1.5);

    reticle.setPressed(true);
    reticle.position.set(0, 0, -0.5);
    reticle.updateDistanceScale(camera);
    expect(reticle.scale.x).toBeCloseTo(0.75 * 0.7);

    reticle.dispose();
  });

  it('measures distance from the reticle world position', () => {
    const parent = new THREE.Group();
    parent.position.set(0, 0, -1);
    parent.updateMatrixWorld();
    const reticle = new Reticle();
    parent.add(reticle);
    reticle.position.set(0, 0, -1);
    reticle.updateDistanceScale(new THREE.Vector3());
    expect(reticle.scale.x).toBeCloseTo(1.5);
    reticle.dispose();
  });

  it('keeps the hover ring hidden unless enabled', () => {
    const reticle = new Reticle();
    const hoverRing = getHoverRing(reticle);

    reticle.setHovering(true);
    expect(hoverRing.visible).toBe(false);

    reticle.hoverRingEnabled = true;
    reticle.setHovering(true);
    expect(hoverRing.visible).toBe(true);
    reticle.setHovering(false);
    expect(hoverRing.visible).toBe(false);

    reticle.dispose();
  });

  it('defaults to THREE.ShaderMaterial sharing uniforms by reference', () => {
    const reticle = new Reticle();
    expect(reticle.material).toBeInstanceOf(THREE.ShaderMaterial);
    expect((reticle.material as THREE.ShaderMaterial).uniforms).toBe(
      reticle.uniforms
    );
    reticle.dispose();
  });

  it('updates uniforms, color, and hoverRing color via accessors on default path', () => {
    const reticle = new Reticle();
    const hoverRing = getHoverRing(reticle);

    reticle.setColor(0xff0000);
    expect(reticle.uniforms.uColor.value.getHex()).toBe(0xff0000);
    expect(reticle.getColor().getHex()).toBe(0xff0000);
    const expectedHoverColor = new THREE.Color(0xff0000).multiplyScalar(0.4);
    expect(hoverRing.material.color.getHex()).toBe(expectedHoverColor.getHex());

    reticle.setPressed(true);
    expect(reticle.uniforms.uPressed.value).toBe(1.0);

    reticle.setPressed(false);
    expect(reticle.uniforms.uPressed.value).toBe(0.0);

    reticle.setPressedAmount(0.5);
    expect(reticle.uniforms.uPressed.value).toBe(0.5);

    reticle.dispose();
  });

  it('setCustomMaterial disposes old material, assigns new material, and synchronizes uniforms', () => {
    const reticle = new Reticle();
    const oldMaterial = reticle.material;
    const disposeSpy = vi.spyOn(oldMaterial, 'dispose');

    const customMaterial = new THREE.MeshBasicMaterial();
    const syncSpy = vi.fn();

    reticle.setCustomMaterial(customMaterial, syncSpy);

    expect(disposeSpy).toHaveBeenCalledTimes(1);
    expect(reticle.material).toBe(customMaterial);
    expect(syncSpy).toHaveBeenCalledTimes(1);

    syncSpy.mockClear();
    reticle.setColor(0x00ff00);
    expect(syncSpy).toHaveBeenCalledTimes(1);

    syncSpy.mockClear();
    reticle.setPressed(true);
    expect(syncSpy).toHaveBeenCalledTimes(1);

    syncSpy.mockClear();
    reticle.setPressedAmount(0.25);
    expect(syncSpy).toHaveBeenCalledTimes(1);

    reticle.dispose();
  });

  it('applyWebGPUReticleMaterial upgrades Reticle to NodeMaterial and preserves depthTest', () => {
    const reticle = new Reticle(0, 0.01, true);
    reticle.setColor(0x123456);
    reticle.setPressedAmount(0.6);

    applyWebGPUReticleMaterial(reticle);

    expect(reticle.material).toBeInstanceOf(NodeMaterial);
    expect(reticle.material.depthTest).toBe(true);
    expect(reticle.material.depthWrite).toBe(false);
    expect(reticle.material.transparent).toBe(true);

    reticle.setColor(0xabcdef);
    expect(reticle.getColor().getHex()).toBe(0xabcdef);

    reticle.setPressed(true);
    expect(reticle.uniforms.uPressed.value).toBe(1.0);

    reticle.dispose();
  });

  it('Input.setReticleConfigurer upgrades existing and newly registered controller reticles without global state leakage', () => {
    const inputWebGPU = new Input();
    const inputWebGL = new Input();

    const gazeReticleWebGPU = inputWebGPU.gazeController.reticle!;
    const gazeReticleWebGL = inputWebGL.gazeController.reticle!;

    expect(gazeReticleWebGPU.material).toBeInstanceOf(THREE.ShaderMaterial);
    expect(gazeReticleWebGL.material).toBeInstanceOf(THREE.ShaderMaterial);

    // Configure only inputWebGPU
    inputWebGPU.setReticleConfigurer(applyWebGPUReticleMaterial);

    // Existing gaze reticle on inputWebGPU is upgraded immediately
    expect(gazeReticleWebGPU.material).toBeInstanceOf(NodeMaterial);
    // Independent inputWebGL instance remains untouched (ShaderMaterial)
    expect(gazeReticleWebGL.material).toBeInstanceOf(THREE.ShaderMaterial);

    // Register a new controller with a reticle on inputWebGPU
    const lateController = new GazeController();
    expect(lateController.reticle.material).toBeInstanceOf(
      THREE.ShaderMaterial
    );

    inputWebGPU.registerController(lateController);
    expect(lateController.reticle.material).toBeInstanceOf(NodeMaterial);

    inputWebGPU.dispose();
    inputWebGL.dispose();
  });
});
