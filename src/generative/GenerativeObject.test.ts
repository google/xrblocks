import * as THREE from 'three';
import {describe, it, expect, vi} from 'vitest';

import {OCCLUDABLE_ITEMS_LAYER} from '../constants';

import {GenerativeObject} from './GenerativeObject';
import type {LoadedTexture} from './TextureSource';

function fakeLoaded(width = 200, height = 100): LoadedTexture {
  return {texture: new THREE.Texture(), width, height};
}

describe('GenerativeObject', () => {
  it('builds a textured plane from the loaded texture', () => {
    const loaded = fakeLoaded();
    const obj = new GenerativeObject('a red apple', loaded, 0.6);
    expect(obj.mesh.material.map).toBe(loaded.texture);
    expect(obj.children).toContain(obj.mesh);
  });

  it('scales the plane to preserve the image aspect ratio', () => {
    const obj = new GenerativeObject('x', fakeLoaded(200, 100), 0.6);
    expect(obj.mesh.scale.x).toBeCloseTo(0.6);
    expect(obj.mesh.scale.y).toBeCloseTo(0.3);
  });

  it('is draggable', () => {
    const obj = new GenerativeObject('x', fakeLoaded(), 0.6);
    expect(obj.draggable).toBe(true);
  });

  it('opts into the occludable items layer', () => {
    const obj = new GenerativeObject('x', fakeLoaded(), 0.6);
    expect(obj.mesh.layers.isEnabled(OCCLUDABLE_ITEMS_LAYER)).toBe(true);
  });

  it('remembers the prompt that produced it', () => {
    const obj = new GenerativeObject('a small red dragon', fakeLoaded(), 0.6);
    expect(obj.prompt).toBe('a small red dragon');
  });

  it('dispose() releases the geometry, texture, and material', () => {
    const obj = new GenerativeObject('x', fakeLoaded(), 0.6);
    const geometrySpy = vi.spyOn(obj.mesh.geometry, 'dispose');
    const materialSpy = vi.spyOn(obj.mesh.material, 'dispose');
    const textureSpy = vi.spyOn(obj.mesh.material.map!, 'dispose');
    obj.dispose();
    expect(geometrySpy).toHaveBeenCalled();
    expect(materialSpy).toHaveBeenCalled();
    expect(textureSpy).toHaveBeenCalled();
  });
});
