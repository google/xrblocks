import * as THREE from 'three';
import {expect, it} from 'vitest';
import {Reticle} from './Reticle';

it('updates a custom material and releases replaced and owned materials', () => {
  const reticle = new Reticle();
  const released: string[] = [];
  reticle.material.addEventListener('dispose', () => released.push('original'));
  const material = new THREE.MeshBasicMaterial();
  material.addEventListener('dispose', () => released.push('custom'));
  reticle.setCustomMaterial(material, () => {
    material.color.copy(reticle.getColor());
    material.opacity = 1 - reticle.uniforms.uPressed.value;
  });
  reticle.setColor(0x123456);
  reticle.setPressedAmount(0.25);
  expect(material.color.getHex()).toBe(0x123456);
  expect(material.opacity).toBe(0.75);
  reticle.setPressed(true);
  expect(material.opacity).toBe(0);
  reticle.setPressed(false);
  expect(material.opacity).toBe(1);
  reticle.dispose();
  expect(released).toEqual(['original', 'custom']);
});
