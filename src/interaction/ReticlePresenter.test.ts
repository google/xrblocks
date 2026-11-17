import * as THREE from 'three';
import {afterEach, describe, expect, it} from 'vitest';

import {ReticleOptions} from '../core/Options';
import type {Controller} from '../input/Controller';
import {InteractionSourceState, type ResolvedRay} from './InteractionTypes';
import {Reticle} from './reticle/Reticle';
import {ReticlePresenter} from './ReticlePresenter';

const reticles: Reticle[] = [];

function createSnapshot(selected = false) {
  const controller = new THREE.Object3D() as Controller;
  const reticle = new Reticle();
  reticles.push(reticle);
  controller.reticle = reticle;
  const snapshot = new InteractionSourceState(controller).updateRay({
    controller,
    sourceType: 'controller-ray',
    ray: new THREE.Ray(new THREE.Vector3(), new THREE.Vector3(0, 0, -1)),
    selected,
  });
  return {snapshot, reticle};
}

function createHit(distance: number): ResolvedRay {
  const hitObject = new THREE.Mesh(new THREE.PlaneGeometry());
  hitObject.position.z = -distance;
  hitObject.updateMatrixWorld();
  return {
    intersection: {
      distance,
      point: new THREE.Vector3(0, 0, -distance),
      normal: new THREE.Vector3(0, 0, 1),
      object: hitObject,
    },
    hitObject,
    surface: hitObject,
    target: hitObject,
    scriptPath: [],
    objectPath: [hitObject],
    reticleMode: 'auto',
  };
}

describe('ReticlePresenter', () => {
  afterEach(() => {
    for (const reticle of reticles.splice(0)) reticle.dispose();
  });

  it('places the reticle at the hit and combines distance and press feedback', () => {
    const viewer = new THREE.Group();
    viewer.position.z = 1;
    const camera = new THREE.PerspectiveCamera();
    viewer.add(camera);
    const options = new ReticleOptions();
    options.defaultRenderDistance = 4;
    const presenter = new ReticlePresenter(options, camera);
    const {snapshot, reticle} = createSnapshot();
    const hit = createHit(2);
    try {
      presenter.present(snapshot, hit);
      expect(reticle.position.distanceTo(hit.intersection.point)).toBeCloseTo(
        reticle.offset
      );
      const unpressed = reticle.scale.x;
      snapshot.selected = true;
      presenter.present(snapshot, hit);
      expect(reticle.scale.x).toBeGreaterThan(0);
      expect(reticle.scale.x).toBeLessThan(unpressed);
      snapshot.selected = false;
      presenter.present(snapshot, undefined);
      expect(reticle.position.z).toBeCloseTo(-4 + reticle.offset);
      expect(reticle.scale.x).toBeGreaterThan(unpressed);
      options.scaleWithDistance = false;
      presenter.present(snapshot, undefined);
      expect(reticle.scale.x).toBe(1);
    } finally {
      const mesh = hit.hitObject as THREE.Mesh;
      mesh.geometry.dispose();
      (mesh.material as THREE.Material).dispose();
    }
  });
});
