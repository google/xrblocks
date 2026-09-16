import * as THREE from 'three';
import {NodeMaterial} from 'three/webgpu';
import {describe, expect, it, vi} from 'vitest';

import {GazeController} from '../../input/GazeController';
import {Input} from '../../input/Input';
import {Reticle} from './Reticle';
import {applyWebGPUReticleMaterial} from './ReticleWebGPUMaterial';

describe('Reticle', () => {
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
    const hoverRing = (
      reticle as unknown as {
        hoverRing: THREE.Mesh<THREE.RingGeometry, THREE.MeshBasicMaterial>;
      }
    ).hoverRing;

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
    const reticle = new Reticle(0, 0.019, true);
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
