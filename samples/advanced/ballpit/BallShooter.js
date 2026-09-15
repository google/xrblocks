import * as THREE from 'three';
import * as xb from 'xrblocks';

export class BallShooter extends xb.Script {
  constructor({
    numBalls = 100,
    radius = 0.08,
    palette = null,
    liveDuration = 3000,
    deflateDuration = 200,
    distanceThreshold = 0.25,
    distanceFadeout = 0.25,
  }) {
    super();
    this.liveDuration = liveDuration;
    this.deflateDuration = deflateDuration;
    this.distanceThreshold = distanceThreshold;
    this.distanceFadeout = distanceFadeout;
    const geometry = new THREE.IcosahedronGeometry(radius, 3);
    this.spheres = [];
    for (let i = 0; i < numBalls; ++i) {
      const material = new THREE.MeshLambertMaterial({transparent: true});
      const sphere = new THREE.Mesh(geometry, material);
      sphere.castShadow = true;
      sphere.receiveShadow = true;
      this.spheres.push(sphere);
    }

    for (let i = 0; i < this.spheres.length; i++) {
      const x = Math.random() * 2 - 2;
      const y = Math.random() * 2;
      const z = Math.random() * 2 - 2;

      this.spheres[i].position.set(x, y, z);
      if (palette != null) {
        this.spheres[i].material.color.copy(palette.getRandomLiteGColor());
      }
    }

    const now = performance.now();
    this.spawnTimes = [];
    for (let i = 0; i < numBalls; ++i) {
      this.spawnTimes[i] = now;
    }

    this.nextBall = 0;
    this.rigidBodies = [];
    this.colliders = [];
    this.colliderHandleToIndex = new Map();
    this.viewSpacePosition = new THREE.Vector3();
    this.clipSpacePosition = new THREE.Vector3();
    this.projectedPosition = new THREE.Vector3();
    this.clipFromWorld = new THREE.Matrix4();
  }

  initPhysics(physics) {
    this.setupPhysics({
      RAPIER: physics.RAPIER,
      blendedWorld: physics.blendedWorld,
      colliderActiveEvents: physics.RAPIER.ActiveEvents.CONTACT_FORCE_EVENTS,
    });
  }

  setupPhysics({
    RAPIER,
    blendedWorld,
    colliderActiveEvents = 0,
    continuousCollisionDetection = false,
  }) {
    this.RAPIER = RAPIER;
    this.blendedWorld = blendedWorld;
    this.colliderActiveEvents = colliderActiveEvents;
    this.continuousCollisionDetection = continuousCollisionDetection;
  }

  /**
   * Spawns a ball at the given location with the given velocity.
   * @param {THREE.Vector3} position Position to place the ball.
   * @param {THREE.Vector3} velocity Velocity of the ball.
   * @param {number} now Time when the ball is spawned.
   */
  spawnBallAt(
    position,
    velocity = new THREE.Vector3(),
    now = performance.now()
  ) {
    const ball = this.spheres[this.nextBall];
    ball.position.copy(position);
    ball.scale.setScalar(1.0);
    ball.opacity = 1.0;
    this._createRigidBody(
      this.nextBall,
      position,
      velocity,
      ball.geometry.parameters.radius
    );
    this.spawnTimes[this.nextBall] = now;
    this.nextBall = (this.nextBall + 1) % this.spheres.length;
    this.add(ball);
  }

  _createRigidBody(index, position, velocity, radius) {
    // Delete existing body if one already exists for this index
    if (this.rigidBodies[index] != null) {
      const existingBody = this.rigidBodies[index];
      this.blendedWorld.removeRigidBody(existingBody);
    }

    // Create new body
    const desc = this.RAPIER.RigidBodyDesc.dynamic()
      .setTranslation(position.x, position.y, position.z)
      .setLinvel(velocity.x, velocity.y, velocity.z)
      .setCcdEnabled(this.continuousCollisionDetection);
    const body = this.blendedWorld.createRigidBody(desc);
    const shape = this.RAPIER.ColliderDesc.ball(radius).setActiveEvents(
      this.colliderActiveEvents
    );
    const collider = this.blendedWorld.createCollider(shape, body);
    this.colliderHandleToIndex.set(collider.handle, index);
    this.rigidBodies[index] = body;
    this.colliders[index] = collider;
  }

  physicsStep(now = performance.now()) {
    for (let i = 0; i < this.spheres.length; i++) {
      const sphere = this.spheres[i];
      const body = this.rigidBodies[i];
      let spawnTime = this.spawnTimes[i];

      if (this.isBallActive(i) && body != null) {
        let ballVisibility = 1.0;
        const position = sphere.position.copy(body.translation());
        // If the ball falls behind the depth then adjust the spawnTime to begin
        // expiring the ball.

        // Use depth matrices if depth is enabled, otherwise fall back to camera matrices
        const viewMatrix = xb.depth?.enabled
          ? xb.depth.depthViewMatrices[0]
          : xb.core.camera.matrixWorldInverse;
        const projectionMatrix = xb.depth?.enabled
          ? xb.depth.depthProjectionMatrices[0]
          : xb.core.camera.projectionMatrix;

        const viewSpacePosition = this.viewSpacePosition
          .copy(position)
          .applyMatrix4(viewMatrix);
        const clipSpacePosition = this.clipSpacePosition
          .copy(viewSpacePosition)
          .applyMatrix4(projectionMatrix);
        const ballIsInView =
          -1.0 <= clipSpacePosition.x &&
          clipSpacePosition.x <= 1.0 &&
          -1.0 <= clipSpacePosition.y &&
          clipSpacePosition.y <= 1.0;
        if (ballIsInView && xb.depth.enabled) {
          const projectedPosition =
            xb.depth.getProjectedDepthViewPositionFromWorldPosition(
              position,
              this.projectedPosition
            );
          const distanceBehindDepth = Math.max(
            projectedPosition.z - viewSpacePosition.z,
            0.0
          );
          if (distanceBehindDepth > this.distanceThreshold) {
            const deflateAmount = Math.max(
              (distanceBehindDepth - this.distanceThreshold) /
                this.distanceFadeout,
              1.0
            );
            spawnTime = Math.min(
              spawnTime,
              now - this.liveDuration - this.deflateDuration * deflateAmount
            );
          }
        }

        // Compute the visibility if the ball has lived too long.
        if (now - spawnTime > this.liveDuration) {
          const timeSinceDeflateStarted = now - spawnTime - this.liveDuration;
          const deflateAmount = Math.min(
            1,
            timeSinceDeflateStarted / this.deflateDuration
          );
          ballVisibility = 1.0 - deflateAmount;
        }

        sphere.material.opacity = ballVisibility;

        if (ballVisibility < 0.001) {
          this.removeBall(i);
        } else {
          sphere.position.copy(body.translation());
          sphere.quaternion.copy(body.rotation());
        }
      }
    }
  }

  getIndexForColliderHandle(handle) {
    return this.colliderHandleToIndex.get(handle);
  }

  removeBall(index) {
    const ball = this.spheres[index];
    ball.material.opacity = 0.0;
    ball.scale.setScalar(0);
    const body = this.rigidBodies[index];
    if (body != null) {
      this.blendedWorld.removeRigidBody(body);
      this.rigidBodies[index] = null;
      this.colliders[index] = null;
    }
    this.remove(ball);
  }

  isBallActive(index) {
    return this.spheres[index].parent == this;
  }
}
