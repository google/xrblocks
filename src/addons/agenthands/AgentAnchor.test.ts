import * as THREE from 'three';
import {describe, expect, it} from 'vitest';

import {AgentAnchor, glideAround} from './AgentAnchor';

// A viewer at standing eye height, turned `yaw` radians from looking down -Z.
function viewer(
  yaw = 0,
  position = new THREE.Vector3(0, 1.6, 0),
  pitch = 0
): THREE.Object3D {
  const camera = new THREE.PerspectiveCamera();
  camera.position.copy(position);
  camera.rotation.set(pitch, yaw, 0, 'YXZ');
  return camera;
}

describe('AgentAnchor', () => {
  it('places the agent in front of the viewer at its heading', () => {
    const anchor = new AgentAnchor({distance: 0.7, height: -0.35});
    expect(anchor.placed).toBe(false);
    // Looking down does not tilt the placement.
    anchor.placeInFront(viewer(0, undefined, -0.5));
    expect(anchor.placed).toBe(true);
    expect(anchor.position.x).toBeCloseTo(0);
    expect(anchor.position.y).toBeCloseTo(1.25);
    expect(anchor.position.z).toBeCloseTo(-0.7);
    expect(anchor.heading).toBeCloseTo(0);

    anchor.placeInFront(viewer(Math.PI / 2));
    expect(anchor.position.x).toBeCloseTo(-0.7);
    expect(anchor.position.z).toBeCloseTo(0);
    expect(anchor.heading).toBeCloseTo(Math.PI / 2);
  });

  it('keeps the heading it was placed with until placed again', () => {
    const anchor = new AgentAnchor();
    anchor.placeInFront(viewer(0.4));
    const aside = viewer(0, new THREE.Vector3(1, 1.6, 0));
    expect(anchor.headingFrom(aside)).not.toBeCloseTo(0.4);
    expect(anchor.heading).toBeCloseTo(0.4);

    anchor.comeIntoView(viewer(2));
    expect(anchor.heading).toBeCloseTo(2);
  });

  it('faces the viewer only when faceViewer is on', () => {
    const anchor = new AgentAnchor();
    expect(anchor.faceViewer).toBe(false);
    anchor.placeInFront(viewer(0.4));
    const aside = viewer(0, new THREE.Vector3(1, 1.6, 0));
    expect(anchor.facing(aside)).toBeCloseTo(0.4);

    anchor.faceViewer = true;
    expect(anchor.facing(aside)).toBeCloseTo(anchor.headingFrom(aside));
    const from = new THREE.Vector3(-0.7, 1.25, 0);
    expect(anchor.facing(aside, from)).toBeCloseTo(
      anchor.headingFrom(aside, from)
    );
    expect(new AgentAnchor({faceViewer: true}).faceViewer).toBe(true);
  });

  it('is in view only near where the viewer looks and within range', () => {
    const anchor = new AgentAnchor();
    expect(anchor.isInView(viewer())).toBe(false);
    anchor.placeInFront(viewer());
    expect(anchor.isInView(viewer())).toBe(true);
    expect(anchor.isInView(viewer(Math.PI / 2))).toBe(false);
    expect(anchor.isInView(viewer(Math.PI))).toBe(false);
    // Still facing it, but 4 m further back.
    expect(anchor.isInView(viewer(0, new THREE.Vector3(0, 1.6, 4)))).toBe(
      false
    );
  });

  it('stays put while in view and comes back in front when out of view', () => {
    const anchor = new AgentAnchor();
    expect(anchor.comeIntoView(viewer())).toBe(true);
    const placed = anchor.position.clone();

    // A step to the side while still facing it.
    expect(
      anchor.comeIntoView(viewer(0, new THREE.Vector3(0.3, 1.6, 0.5)))
    ).toBe(false);
    expect(anchor.position.equals(placed)).toBe(true);

    // Turned around.
    expect(anchor.comeIntoView(viewer(Math.PI))).toBe(true);
    expect(anchor.position.z).toBeCloseTo(0.7);
    expect(anchor.isInView(viewer(Math.PI))).toBe(true);
  });

  it('places the agent again after a reset', () => {
    const anchor = new AgentAnchor();
    anchor.placeInFront(viewer());
    anchor.reset();
    expect(anchor.placed).toBe(false);
    expect(anchor.isInView(viewer())).toBe(false);
    expect(anchor.comeIntoView(viewer())).toBe(true);
    expect(anchor.placed).toBe(true);
  });

  it('stays where it was placed unless followViewer is on', () => {
    const anchor = new AgentAnchor();
    expect(anchor.followViewer).toBe(false);
    // The first update places it.
    expect(anchor.update(viewer())).toBe(true);
    expect(anchor.position.z).toBeCloseTo(-0.7);
    // Turning around leaves it where it was.
    expect(anchor.update(viewer(Math.PI))).toBe(false);
    expect(anchor.position.z).toBeCloseTo(-0.7);

    anchor.followViewer = true;
    expect(anchor.update(viewer(Math.PI))).toBe(true);
    expect(anchor.position.z).toBeCloseTo(0.7);
    expect(anchor.heading).toBeCloseTo(Math.PI);
    expect(new AgentAnchor({followViewer: true}).followViewer).toBe(true);
  });

  it('gives the heading from the viewer to the agent', () => {
    const anchor = new AgentAnchor();
    anchor.placeInFront(viewer(0.4));
    expect(anchor.headingFrom(viewer(0.4))).toBeCloseTo(0.4);

    // From beside the agent, looking along -X at it.
    anchor.placeInFront(viewer());
    expect(
      anchor.headingFrom(viewer(0, new THREE.Vector3(0.7, 1.6, -0.7)))
    ).toBeCloseTo(Math.PI / 2);

    // Toward another point, such as the hands partway through a glide.
    expect(
      anchor.headingFrom(viewer(), new THREE.Vector3(-0.7, 1.25, 0))
    ).toBeCloseTo(Math.PI / 2);
  });
});

describe('glideAround', () => {
  it('swings around the center instead of passing through it', () => {
    const center = new THREE.Vector3(0, 1.6, 0);
    const current = new THREE.Vector3(0, 1.6, 0.7);
    const target = new THREE.Vector3(0, 1.6, -0.7);
    let closest = Infinity;
    for (let i = 0; i < 100; i++) {
      glideAround(current, target, center, 0.1);
      closest = Math.min(closest, current.distanceTo(center));
    }
    expect(closest).toBeGreaterThan(0.69);
    expect(current.distanceTo(target)).toBeLessThan(0.01);
  });

  it('takes the short way around', () => {
    // Either side of straight ahead (-Z), across the +/-180 degree seam.
    const current = new THREE.Vector3(0.1, 0, -0.7);
    glideAround(
      current,
      new THREE.Vector3(-0.1, 0, -0.7),
      new THREE.Vector3(),
      0.5
    );
    expect(current.x).toBeCloseTo(0);
    expect(current.z).toBeLessThan(-0.7);
  });

  it('eases the distance and height toward the target', () => {
    const current = new THREE.Vector3(0, 0, -2);
    glideAround(
      current,
      new THREE.Vector3(0, 1, -0.7),
      new THREE.Vector3(),
      0.5
    );
    expect(current.x).toBeCloseTo(0);
    expect(current.y).toBeCloseTo(0.5);
    expect(current.z).toBeCloseTo(-1.35);
  });

  it('moves in a straight line when starting at the center', () => {
    const current = new THREE.Vector3();
    glideAround(current, new THREE.Vector3(1, 0, 0), new THREE.Vector3(), 0.5);
    expect(current.x).toBeCloseTo(0.5);
    expect(current.z).toBeCloseTo(0);
  });
});
