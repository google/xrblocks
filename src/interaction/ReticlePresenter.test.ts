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

  it('offsets a hit along the surface normal and scales with camera distance', () => {
    const viewer = new THREE.Group();
    viewer.position.set(0, 0, 1);
    const camera = new THREE.PerspectiveCamera();
    viewer.add(camera);
    const presenter = new ReticlePresenter(new ReticleOptions(), camera);
    const {snapshot, reticle} = createSnapshot();

    presenter.present(snapshot, createHit(2));

    expect(reticle.position.x).toBeCloseTo(0);
    expect(reticle.position.y).toBeCloseTo(0);
    expect(reticle.position.z).toBeCloseTo(-2 + reticle.offset);
    const distance = 3 - reticle.offset;
    expect(reticle.scale.x).toBeCloseTo(0.5 + 0.5 * distance);
  });

  it('composes the distance scale with the pressed scale', () => {
    const presenter = new ReticlePresenter(
      new ReticleOptions(),
      new THREE.PerspectiveCamera()
    );
    const {snapshot, reticle} = createSnapshot(true);

    presenter.present(snapshot, createHit(1 + reticle.offset));

    expect(reticle.scale.x).toBeCloseTo(0.7);
  });

  it('offsets and scales the reticle at the default render distance', () => {
    const options = new ReticleOptions();
    options.defaultRenderDistance = 2;
    const presenter = new ReticlePresenter(
      options,
      new THREE.PerspectiveCamera()
    );
    const {snapshot, reticle} = createSnapshot();

    presenter.present(snapshot, undefined);

    expect(reticle.visible).toBe(true);
    expect(reticle.position.z).toBeCloseTo(-2 + reticle.offset);
    expect(reticle.scale.x).toBeCloseTo(0.5 + 0.5 * (2 - reticle.offset));
  });

  it('keeps the base scale without a camera', () => {
    const presenter = new ReticlePresenter();
    const {snapshot, reticle} = createSnapshot();

    presenter.present(snapshot, createHit(3));

    expect(reticle.position.z).toBeCloseTo(-3 + reticle.offset);
    expect(reticle.scale.x).toBe(1);
  });

  it('does not show the hover ring over a target by default', () => {
    const presenter = new ReticlePresenter();
    const {snapshot, reticle} = createSnapshot();

    presenter.present(snapshot, createHit(1));

    expect(reticle.children.some((child) => child.visible)).toBe(false);
  });
});
