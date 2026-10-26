/**
 * A Rapier world whose only static surface is the photo-depth mesh.
 *
 * The demo keeps its own world instead of the SDK's physics: with sensed
 * depth on (for scoring), the SDK turns its sensed depth mesh into a collider
 * as soon as physics is enabled, and the balls would bounce off the sensor's
 * surface instead of the photo's. The target is glasses without depth
 * sensing, so the photo mesh must be the only thing balls can hit.
 */
import * as THREE from 'three';

/**
 * World-space trimesh arrays for Rapier from an indexed geometry placed by
 * `matrixWorld` (baked into the vertices, so any pose works).
 */
export function worldTrimesh(geometry, matrixWorld) {
  const position = geometry.getAttribute('position');
  const vertices = new Float32Array(position.count * 3);
  const p = new THREE.Vector3();
  for (let i = 0; i < position.count; i++) {
    p.fromBufferAttribute(position, i).applyMatrix4(matrixWorld);
    vertices[i * 3] = p.x;
    vertices[i * 3 + 1] = p.y;
    vertices[i * 3 + 2] = p.z;
  }
  const indices = Uint32Array.from(geometry.getIndex().array);
  return {vertices, indices};
}

export class PhotoPhysics {
  /** Loads Rapier's wasm (compat build) and creates the world. */
  static async create(RAPIER, options) {
    await RAPIER.init?.();
    return new PhotoPhysics(RAPIER, options);
  }

  constructor(RAPIER, {gravity = {x: 0, y: -9.81, z: 0}, fps = 60} = {}) {
    this.RAPIER = RAPIER;
    this.world = new RAPIER.World(gravity);
    this.timestep = 1 / fps;
    this.world.timestep = this.timestep;
    this.surfaceBody = null;
    this.floorBody = null;
    this.floorY = null;
    this.accumulator = 0;
  }

  /**
   * Replaces the static surface with `geometry` placed by `matrixWorld`
   * (`null` removes it).
   */
  setSurface(geometry, matrixWorld) {
    if (this.surfaceBody) {
      this.world.removeRigidBody(this.surfaceBody);
      this.surfaceBody = null;
    }
    if (!geometry) return;
    const {vertices, indices} = worldTrimesh(geometry, matrixWorld);
    this.surfaceBody = this.world.createRigidBody(
      this.RAPIER.RigidBodyDesc.fixed()
    );
    this.world.createCollider(
      this.RAPIER.ColliderDesc.trimesh(vertices, indices),
      this.surfaceBody
    );
  }

  /**
   * Puts a floor plane at world height `y` (`null` removes it): a single
   * photo has no floor behind or under what stands on it, and balls must not
   * fall through those holes forever. The height comes from the photo too
   * (see `photoFloorHeight`).
   */
  setFloor(y) {
    if (this.floorBody) {
      this.world.removeRigidBody(this.floorBody);
      this.floorBody = null;
    }
    this.floorY = y;
    if (y == null) return;
    const halfThickness = 0.1;
    this.floorBody = this.world.createRigidBody(
      this.RAPIER.RigidBodyDesc.fixed().setTranslation(0, y - halfThickness, 0)
    );
    this.world.createCollider(
      this.RAPIER.ColliderDesc.cuboid(20, halfThickness, 20),
      this.floorBody
    );
  }

  /**
   * Advances the world by `deltaSeconds` in fixed steps (at most
   * `maxSteps`, so a stalled frame does not trigger a catch-up spiral).
   * @returns The number of steps taken.
   */
  step(deltaSeconds, maxSteps = 4) {
    this.accumulator = Math.min(
      this.accumulator + Math.max(0, deltaSeconds),
      maxSteps * this.timestep
    );
    let steps = 0;
    while (this.accumulator >= this.timestep) {
      this.world.step();
      this.accumulator -= this.timestep;
      steps++;
    }
    return steps;
  }

  dispose() {
    this.world.free();
  }
}
