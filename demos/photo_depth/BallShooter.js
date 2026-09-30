/**
 * A pool of bouncing balls, trimmed from samples/advanced/ballpit's
 * BallShooter (copied so this demo stands alone). Differences: it is a plain
 * group driven by the caller's physics world, CCD is on by default (a 5 m/s
 * ball crosses a thin trimesh in one step otherwise), and balls expire by
 * age only: the sample also retired balls that fell behind the *sensed*
 * depth, which this demo must not consult.
 */
import * as THREE from 'three';

export class BallShooter extends THREE.Group {
  constructor({
    numBalls = 100,
    radius = 0.08,
    palette = null,
    liveDuration = 3000,
    deflateDuration = 200,
  } = {}) {
    super();
    this.liveDuration = liveDuration;
    this.deflateDuration = deflateDuration;
    this.geometry = new THREE.IcosahedronGeometry(radius, 3);
    this.spheres = [];
    for (let i = 0; i < numBalls; ++i) {
      const material = new THREE.MeshLambertMaterial({transparent: true});
      if (palette) material.color.copy(palette.getRandomLiteGColor());
      const sphere = new THREE.Mesh(this.geometry, material);
      sphere.castShadow = true;
      sphere.receiveShadow = true;
      sphere.raycast = () => {};
      this.spheres.push(sphere);
    }
    this.spawnTimes = new Array(numBalls).fill(0);
    this.rigidBodies = new Array(numBalls).fill(null);
    this.nextBall = 0;
  }

  /** Binds the pool to a Rapier world (balls of an earlier world are dropped). */
  setupPhysics({RAPIER, world, continuousCollisionDetection = true}) {
    this.clear();
    this.RAPIER = RAPIER;
    this.world = world;
    this.continuousCollisionDetection = continuousCollisionDetection;
  }

  /** Spawns the next ball of the pool at `position` with `velocity`. */
  spawnBallAt(
    position,
    velocity = new THREE.Vector3(),
    now = performance.now()
  ) {
    if (!this.world) return;
    const index = this.nextBall;
    const ball = this.spheres[index];
    ball.position.copy(position);
    ball.scale.setScalar(1.0);
    ball.material.opacity = 1.0;
    this.createRigidBody(
      index,
      position,
      velocity,
      this.geometry.parameters.radius
    );
    this.spawnTimes[index] = now;
    this.nextBall = (index + 1) % this.spheres.length;
    this.add(ball);
  }

  createRigidBody(index, position, velocity, radius) {
    if (this.rigidBodies[index]) {
      this.world.removeRigidBody(this.rigidBodies[index]);
    }
    const desc = this.RAPIER.RigidBodyDesc.dynamic()
      .setTranslation(position.x, position.y, position.z)
      .setLinvel(velocity.x, velocity.y, velocity.z)
      .setCcdEnabled(this.continuousCollisionDetection);
    const body = this.world.createRigidBody(desc);
    this.world.createCollider(
      this.RAPIER.ColliderDesc.ball(radius).setRestitution(0.5),
      body
    );
    this.rigidBodies[index] = body;
  }

  /** Copies body poses onto the balls and deflates the old ones. */
  physicsStep(now = performance.now()) {
    for (let i = 0; i < this.spheres.length; i++) {
      const body = this.rigidBodies[i];
      if (!this.isBallActive(i) || !body) continue;
      const sphere = this.spheres[i];
      const age = now - this.spawnTimes[i];
      const visibility =
        age > this.liveDuration
          ? 1 - Math.min(1, (age - this.liveDuration) / this.deflateDuration)
          : 1;
      sphere.material.opacity = visibility;
      if (visibility < 0.001) {
        this.removeBall(i);
      } else {
        sphere.position.copy(body.translation());
        sphere.quaternion.copy(body.rotation());
      }
    }
  }

  removeBall(index) {
    const ball = this.spheres[index];
    ball.material.opacity = 0.0;
    ball.scale.setScalar(0);
    const body = this.rigidBodies[index];
    if (body) {
      this.world?.removeRigidBody(body);
      this.rigidBodies[index] = null;
    }
    this.remove(ball);
  }

  isBallActive(index) {
    return this.spheres[index].parent === this;
  }

  get activeCount() {
    return this.spheres.filter((_, i) => this.isBallActive(i)).length;
  }

  /** Removes every ball (and its body). */
  clear() {
    for (let i = 0; i < this.spheres.length; i++) {
      if (this.isBallActive(i) || this.rigidBodies[i]) this.removeBall(i);
    }
  }

  dispose() {
    this.clear();
    this.geometry.dispose();
    for (const sphere of this.spheres) sphere.material.dispose();
  }
}
