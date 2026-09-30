import * as THREE from 'three';
import {beforeAll, describe, expect, it, vi} from 'vitest';

import {BallShooter} from './BallShooter.js';
import {buildDepthMesh, createDepthMesh} from './depthmesh.js';
import {MOGE_SIZE} from './moge.js';
import {PhotoPhysics, worldTrimesh} from './PhotoPhysics.js';
import {Pins, pinPlacement, raycastMesh} from './Pins.js';
import {PLANE, cameraPose, planeDepth} from './testScenes';

// The package's main entry is CommonJS despite declaring type: module (as
// in the SDK's own tests).
const {default: RAPIER} = await vi.importActual<
  typeof import('@dimforge/rapier3d-simd-compat')
>('@dimforge/rapier3d-simd-compat/rapier.es.js');

const K = {fx: 280, fy: 280, cx: 224, cy: 224};

/** A photo mesh of the floor (y = 0) seen from 1.5 m, pitched down. */
function floorMesh() {
  const pose = cameraPose(new THREE.Vector3(0, 1.5, 0), -0.9);
  const floor = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  const depthAt = planeDepth(K, pose, floor);
  const data = new Float32Array(PLANE);
  for (let py = 0; py < MOGE_SIZE; py++) {
    for (let px = 0; px < MOGE_SIZE; px++) {
      const d = depthAt(px, py);
      data[py * MOGE_SIZE + px] = d > 0 && d < 20 ? d : 0;
    }
  }
  const geometry = buildDepthMesh(
    {width: MOGE_SIZE, height: MOGE_SIZE, data, ...K},
    {stride: 8}
  );
  const mesh = createDepthMesh(geometry);
  mesh.matrixAutoUpdate = false;
  mesh.matrix.copy(pose);
  mesh.updateMatrixWorld(true);
  return mesh;
}

beforeAll(async () => {
  await RAPIER.init();
});

describe('worldTrimesh', () => {
  it('bakes the pose into valid, non-degenerate triangles', () => {
    const mesh = floorMesh();
    const {vertices, indices} = worldTrimesh(mesh.geometry, mesh.matrix);
    const count = vertices.length / 3;
    expect(indices.length % 3).toBe(0);
    expect(Math.max(...indices)).toBeLessThan(count);
    // The floor lands on y = 0 in world space.
    for (let i = 1; i < vertices.length; i += 3 * 97) {
      expect(vertices[i]).toBeCloseTo(0, 4);
    }
    const [a, b, c] = [0, 1, 2].map(
      (k) =>
        new THREE.Vector3(
          vertices[indices[k] * 3],
          vertices[indices[k] * 3 + 1],
          vertices[indices[k] * 3 + 2]
        )
    );
    expect(new THREE.Triangle(a, b, c).getArea()).toBeGreaterThan(0);
  });
});

describe('PhotoPhysics', () => {
  it('lets balls land on the photo surface, and only on it', () => {
    const mesh = floorMesh();
    const physics = new PhotoPhysics(RAPIER);
    physics.setSurface(mesh.geometry, mesh.matrix);
    const shooter = new BallShooter({numBalls: 4, radius: 0.05});
    shooter.setupPhysics({RAPIER, world: physics.world});
    // A slow drop and a fast throw straight down, both in view of the photo.
    const target = new THREE.Vector3(0, 0, -1.2);
    shooter.spawnBallAt(target.clone().setY(0.5), new THREE.Vector3(), 0);
    shooter.spawnBallAt(
      target.clone().setX(0.3).setY(0.3),
      new THREE.Vector3(0, -8, 0),
      0
    );
    for (let i = 0; i < 120; i++) physics.step(1 / 60);
    shooter.physicsStep(100);
    for (const index of [0, 1]) {
      expect(shooter.spheres[index].position.y).toBeCloseTo(0.05, 1);
    }
    // Without the surface, they fall through.
    physics.setSurface(null);
    for (let i = 0; i < 60; i++) physics.step(1 / 60);
    shooter.physicsStep(200);
    expect(shooter.spheres[0].position.y).toBeLessThan(-1);
    shooter.dispose();
    physics.dispose();
  });

  it('catches balls that fall through holes on the photo floor plane', () => {
    const physics = new PhotoPhysics(RAPIER);
    physics.setFloor(0.3);
    const shooter = new BallShooter({numBalls: 1, radius: 0.05});
    shooter.setupPhysics({RAPIER, world: physics.world});
    // Behind the photo's field of view: no mesh there, only the floor.
    shooter.spawnBallAt(new THREE.Vector3(3, 1, 3), new THREE.Vector3(), 0);
    for (let i = 0; i < 120; i++) physics.step(1 / 60);
    shooter.physicsStep(100);
    expect(shooter.spheres[0].position.y).toBeCloseTo(0.35, 2);
    physics.setFloor(null);
    for (let i = 0; i < 60; i++) physics.step(1 / 60);
    shooter.physicsStep(200);
    expect(shooter.spheres[0].position.y).toBeLessThan(0);
    shooter.dispose();
    physics.dispose();
  });

  it('steps at a fixed rate and caps catch-up', () => {
    const physics = new PhotoPhysics(RAPIER, {fps: 60});
    expect(physics.step(1 / 30)).toBe(2);
    expect(physics.step(5)).toBe(4);
    expect(physics.step(0.001)).toBe(0);
    physics.dispose();
  });
});

describe('BallShooter', () => {
  it('deflates balls by age and recycles the pool', () => {
    const physics = new PhotoPhysics(RAPIER);
    const shooter = new BallShooter({
      numBalls: 2,
      liveDuration: 1000,
      deflateDuration: 100,
    });
    shooter.setupPhysics({RAPIER, world: physics.world});
    shooter.spawnBallAt(new THREE.Vector3(), new THREE.Vector3(), 0);
    shooter.physicsStep(1050);
    expect(shooter.spheres[0].material.opacity).toBeCloseTo(0.5, 5);
    shooter.physicsStep(1100);
    expect(shooter.activeCount).toBe(0);
    expect(physics.world.bodies.len()).toBe(0);
    for (let i = 0; i < 3; i++) {
      shooter.spawnBallAt(new THREE.Vector3(), new THREE.Vector3(), 0);
    }
    expect(shooter.activeCount).toBe(2);
    expect(physics.world.bodies.len()).toBe(2);
    shooter.dispose();
    physics.dispose();
  });
});

describe('pins', () => {
  it('places a pin on the mesh with the normal facing the user', () => {
    const mesh = floorMesh();
    const raycaster = new THREE.Raycaster(
      new THREE.Vector3(0, 1.5, 0),
      new THREE.Vector3(0, -1.5, -1.2).normalize()
    );
    const hits = raycastMesh(mesh, raycaster);
    expect(hits.length).toBeGreaterThan(0);
    const {point, normal} = pinPlacement(hits[0], raycaster.ray);
    expect(point.y).toBeCloseTo(0, 3);
    expect(point.z).toBeCloseTo(-1.2, 2);
    expect(normal.y).toBeCloseTo(1, 4);
    // From below the floor, the normal flips towards that viewer.
    const below = new THREE.Ray(
      new THREE.Vector3(0, -1, -1.2),
      new THREE.Vector3(0, 1, 0)
    );
    expect(pinPlacement(hits[0], below).normal.y).toBeCloseTo(-1, 4);
  });

  it('numbers pins and clears them', () => {
    const pins = new Pins();
    pins.addPin(new THREE.Vector3(), new THREE.Vector3(0, 1, 0));
    const second = pins.addPin(
      new THREE.Vector3(1, 0, 0),
      new THREE.Vector3(0, 0, 1)
    );
    expect(pins.count).toBe(2);
    expect(second.name).toBe('Pin 2');
    const label = second.children.find((c) => (c as THREE.Sprite).isSprite)!;
    expect(label.position.z).toBeGreaterThan(0.08);
    const hits: THREE.Intersection[] = [];
    for (const part of second.children) {
      part.raycast(new THREE.Raycaster(), hits);
    }
    expect(hits).toHaveLength(0);
    pins.clear();
    expect(pins.count).toBe(0);
    expect(pins.addPin(new THREE.Vector3(), new THREE.Vector3()).name).toBe(
      'Pin 1'
    );
    pins.dispose();
  });
});
