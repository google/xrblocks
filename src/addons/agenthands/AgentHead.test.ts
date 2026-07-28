import {describe, it, expect, vi} from 'vitest';

vi.hoisted(() => {
  vi.stubGlobal('AudioContext', function () {
    return {createGain: () => ({connect: () => {}}), destination: {}};
  });
});

import * as THREE from 'three';

import {AgentHead} from './AgentHead';

describe('AgentHead', () => {
  it('builds an orb under its root', () => {
    const head = new AgentHead();
    expect(head.root).toBeInstanceOf(THREE.Object3D);
    expect(head.root.children.length).toBeGreaterThan(0);
  });

  it('clamps the speaking level and smooths toward it', () => {
    const head = new AgentHead();
    head.setSpeaking(5); // out of range, should clamp to 1
    for (let i = 0; i < 60; i++) head.update(0.05);
    // Core scale grows past its idle range once speaking energy is high.
    const core = head.root.getObjectByProperty('type', 'Mesh') as THREE.Mesh;
    expect(core.scale.x).toBeGreaterThan(1.0);
  });

  it('returns to a calm scale after speaking stops', () => {
    const head = new AgentHead();
    head.setSpeaking(1);
    for (let i = 0; i < 30; i++) head.update(0.05);
    head.setSpeaking(0);
    for (let i = 0; i < 120; i++) head.update(0.05);
    const core = head.root.getObjectByProperty('type', 'Mesh') as THREE.Mesh;
    // Back near the idle breathing band (~1.0 +/- a few percent).
    expect(core.scale.x).toBeLessThan(1.1);
  });

  it('gazes toward a target then resets when cleared', () => {
    const head = new AgentHead();
    head.lookAt(new THREE.Vector3(1, 0, 0));
    for (let i = 0; i < 60; i++) head.update(0.05);
    const turned = head.root.children
      .map((c) => c.quaternion.clone())
      .find((q) => Math.abs(q.w) < 0.999);
    expect(turned).toBeDefined();
    head.lookAt(null);
    for (let i = 0; i < 120; i++) head.update(0.05);
    // The gaze group should settle back near identity.
    const gaze = head.root.children.find((c) => c.type === 'Group');
    expect(gaze).toBeDefined();
    expect(Math.abs((gaze as THREE.Object3D).quaternion.w)).toBeGreaterThan(
      0.98
    );
  });

  it('never lets the decorative orb intercept the reticle raycast', () => {
    const head = new AgentHead();
    const raycaster = new THREE.Raycaster();
    head.root.updateMatrixWorld(true);
    // Every visual under the orb (core, halo, point shell) must no-op its
    // raycast so it can't steal hover/select from UI behind it.
    head.root.traverse((object) => {
      const castable = object as THREE.Mesh | THREE.Points;
      if (
        (castable as THREE.Mesh).isMesh ||
        (castable as THREE.Points).isPoints
      ) {
        const hits: THREE.Intersection[] = [];
        castable.raycast(raycaster, hits);
        expect(hits).toHaveLength(0);
      }
    });
  });
});
