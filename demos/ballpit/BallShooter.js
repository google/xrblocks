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

    const matrix = new THREE.Matrix4();
    for (let i = 0; i < this.spheres.length; i++) {
      const x = Math.random() * 2 - 2;
      const y = Math.random() * 2;
      const z = Math.random() * 2 - 2;

      matrix.setPosition(x, y, z);
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
    continuousCollisionDetection = false
  }) {
    for (let i = 0; i < this.spheres.length; ++i) {
      const position = this.spheres[i].position;
      const desc = RAPIER.RigidBodyDesc.dynamic()
                       .setTranslation(...position)
                       .setCcdEnabled(continuousCollisionDetection);
      const body = blendedWorld.createRigidBody(desc);
      const shape =
          RAPIER.ColliderDesc.ball(this.spheres[i].geometry.parameters.radius)
              .setActiveEvents(colliderActiveEvents);
      const collider = blendedWorld.createCollider(shape, body);
      this.colliderHandleToIndex.set(collider.handle, i);
      this.rigidBodies.push(body);
      this.colliders.push(collider);
    }
  }

  /**
   * Spawns a ball at the given location with the given velocity.
   * @param {THREE.Vector3} position Position to place the ball.
   * @param {THREE.Vector3} velocity Velocity of the ball.
   * @param {number} now Time when the ball is spawned.
   */
  spawnBallAt(
      position, velocity = new THREE.Vector3(), now = performance.now()) {
    const ball = this.spheres[this.nextBall];
    ball.position.copy(position);
    ball.scale.setScalar(1.0);
    ball.opacity = 1.0;
    if (this.rigidBodies.length > 0) {
      const body = this.rigidBodies[this.nextBall];
      body.setTranslation(position);
      body.setLinvel(velocity);
    }
    this.spawnTimes[this.nextBall] = now;
    this.nextBall = (this.nextBall + 1) % this.spheres.length;
    this.add(ball);
  }

  physicsStep(now = performance.now()) {
    const camera = xb.core.camera;
    for (let i = 0; i < this.spheres.length; i++) {
      const sphere = this.spheres[i];
      const body = this.rigidBodies[i];
      let spawnTime = this.spawnTimes[i];

      if (this.isBallActive(i)) {
        let ballVisibility = 1.0;
        const position = sphere.position.copy(body.translation());
        // If the ball falls behind the depth then adjust the spawnTime to begin
        // expiring the ball.
        const viewSpacePosition =
            this.viewSpacePosition.copy(position).applyMatrix4(
                camera.matrixWorldInverse);
        const clipSpacePosition = this.clipSpacePosition.copy(viewSpacePosition)
                                      .applyMatrix4(camera.projectionMatrix);
        const ballIsInView = -1.0 <= clipSpacePosition.x &&
            clipSpacePosition.x <= 1.0 && -1.0 <= clipSpacePosition.y &&
            clipSpacePosition.y <= 1.0;
        if (ballIsInView) {
          const projectedPosition =
              xb.core.depth.getProjectedDepthViewPositionFromWorldPosition(
                  position, this.projectedPosition);
          const distanceBehindDepth =
              Math.max(projectedPosition.z - viewSpacePosition.z, 0.0);
          if (distanceBehindDepth > this.distanceThreshold) {
            const deflateAmount = Math.max(
                (distanceBehindDepth - this.distanceThreshold) /
                    this.distanceFadeout,
                1.0);
            spawnTime = Math.min(
                spawnTime,
                now - this.liveDuration - this.deflateDuration * deflateAmount);
          }
        }

        // Compute the visibility if the ball has lived too long.
        if (now - spawnTime > this.liveDuration) {
          const timeSinceDeflateStarted = now - spawnTime - this.liveDuration;
          const deflateAmount =
              Math.min(1, timeSinceDeflateStarted / this.deflateDuration);
          ballVisibility = 1.0 - deflateAmount;
        }

        body.setTranslation(position);
        sphere.material.opacity = ballVisibility;

        if (ballVisibility < 0.001) {
          sphere.material.opacity = 0.0;
          sphere.scale.setScalar(0);
          position.set(0.0, -1000.0, 0.0);
          body.setTranslation(position);
          this.removeBall(i);
        }
      }

      sphere.position.copy(body.translation());
      sphere.quaternion.copy(body.rotation());
    }
  }

  getIndexForColliderHandle(handle) {
    return this.colliderHandleToIndex.get(handle);
  }

  removeBall(index) {
    const ball = this.spheres[index];
    const body = this.rigidBodies[index];
    ball.position.set(0.0, -1000.0, 0.0);
    body.setTranslation(ball.position);
    this.remove(ball);
  }

  isBallActive(index) {
    return this.spheres[index].parent == this;
  }
}
