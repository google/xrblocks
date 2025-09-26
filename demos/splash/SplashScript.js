import * as THREE from 'three';
import * as xb from 'xrblocks';
import {palette} from 'xrblocks/addons/utils/Palette.js';

import {BallShooter} from '../ballpit/BallShooter.js';

import {PaintSplash} from './PaintSplash.js';

const kLightX = xb.getUrlParamFloat('lightX', 0);
const kLightY = xb.getUrlParamFloat('lightY', 500);
const kLightZ = xb.getUrlParamFloat('lightZ', -10);
const kBallsPerSecond = xb.getUrlParamFloat('ballsPerSecond', 10);
const kVelocityScale = xb.getUrlParamInt('velocityScale', 1.0);
const kBallRadius = xb.getUrlParamFloat('ballRadius', 0.04);


export class SplashScript extends xb.Script {
  constructor() {
    super();
    this.ballShooter = new BallShooter({
      numBalls: 100,
      radius: kBallRadius,
      palette: palette,
    });
    this.add(this.ballShooter);
    this.lastBallTime = new Map();

    this.raycaster = new THREE.Raycaster();
    this.paintballs = [];
    this.listener = new THREE.AudioListener();

    this.pointer = new THREE.Vector2();
    this.velocity = new THREE.Vector3();
  }

  init() {
    this.addLights();
    xb.core.input.addReticles();
    xb.showReticleOnDepthMesh(true);
    xb.core.camera.add(this.listener);
  }

  initPhysics(xrPhysics) {
    this.physics = xrPhysics;
    this.ballShooter.setupPhysics({
      RAPIER: xrPhysics.RAPIER,
      blendedWorld: xrPhysics.blendedWorld,
      colliderActiveEvents: xrPhysics.RAPIER.ActiveEvents.CONTACT_FORCE_EVENTS,
      continuousCollisionDetection: true
    });
  }

  generateDecalAtIntersection(intersection) {
    const paintball =
        new PaintSplash(this.listener, palette.getRandomLiteGColor());

    const scaleMultiplier = 0.4;

    if (xb.core.depth.depthData.length > 0) {
      xb.core.depth.depthMesh.updateFullResolutionGeometry(xb.core.depth.depthData[0]);
    }
    paintball.splatFromIntersection(
        intersection, /*scale=*/
        xb.lerp(scaleMultiplier * 0.3, scaleMultiplier * 0.5, Math.random()));
    this.add(paintball);
    this.paintballs.push(paintball);
  }

  generateDecalFromCollision(position, direction, color) {
    const paintball = new PaintSplash(this.listener, color);
    const orientation = new THREE.Quaternion().setFromUnitVectors(
        new THREE.Vector3(0.0, 0.0, -1.0), direction);
    const scaleMultiplier = 0.4;
    const scale =
        xb.lerp(scaleMultiplier * 0.3, scaleMultiplier * 0.5, Math.random());
    if (xb.core.depth.depthData.length > 0) {
      xb.core.depth.depthMesh.updateFullResolutionGeometry(xb.core.depth.depthData[0]);
    }
    paintball.splatOnMesh(
        xb.core.depth.depthMesh, position, orientation, scale);
    this.add(paintball);
    this.paintballs.push(paintball);
  }

  // Handles controller interactions for spawning and launching spheres.
  controllerUpdate(controller) {
    const now = performance.now();
    if (!this.lastBallTime.has(controller)) {
      this.lastBallTime.set(controller, -99);
    }
    if (controller.userData.selected &&
        now - this.lastBallTime.get(controller) >= 1000 / kBallsPerSecond) {
      // Place this 10 cm in front of the controller.
      const newPosition = new THREE.Vector3(0.0, 0.0, -0.1)
                              .applyQuaternion(controller.quaternion)
                              .add(controller.position);
      this.velocity.set(0, 0, -5.0 * kVelocityScale)
          .applyQuaternion(controller.quaternion);
      this.ballShooter.spawnBallAt(newPosition, this.velocity);
      this.lastBallTime.set(controller, now);
    }
  }

  update() {
    for (let controller of xb.core.input.controllers) {
      this.controllerUpdate(controller);
    }

    for (let paintball of this.paintballs) {
      paintball.update();
    }
  }

  physicsStep() {
    const contactPoint = new THREE.Vector3();
    const forceDirection = new THREE.Vector3();
    const ballShooter = this.ballShooter;
    this.physics.eventQueue.drainContactForceEvents(event => {
      const handle1 = event.collider1();
      const handle2 = event.collider2();
      const depthMeshCollider =
          xb.core.depth.depthMesh.getColliderFromHandle(handle1) ||
          xb.core.depth.depthMesh.getColliderFromHandle(handle2);
      const ballIndex = ballShooter.getIndexForColliderHandle(handle1) ||
          ballShooter.getIndexForColliderHandle(handle2);
      let generatedDecal = false;
      if (depthMeshCollider && ballIndex != null &&
          ballShooter.isBallActive(ballIndex)) {
        const ball = ballShooter.spheres[ballIndex];
        this.physics.blendedWorld.contactPair(
            depthMeshCollider, ballShooter.colliders[ballIndex],
            (manifold, flipped) => {
              if (!generatedDecal && manifold.numSolverContacts() > 0) {
                contactPoint.copy(manifold.solverContactPoint(0));
                forceDirection.copy(event.maxForceDirection());
                this.generateDecalFromCollision(
                    contactPoint, forceDirection, ball.material.color);
                generatedDecal = true;
              }
            });
        ballShooter.removeBall(ballIndex);
      }
    });
    ballShooter.physicsStep();
  }

  // Adds hemisphere light for ambient lighting and directional light.
  addLights() {
    this.add(new THREE.HemisphereLight(0xbbbbbb, 0x888888, 3));
    const light = new THREE.DirectionalLight(0xffffff, 2);
    light.position.set(kLightX, kLightY, kLightZ);
    light.castShadow = true;
    light.shadow.mapSize.width = 2048;   // Default is usually 1024
    light.shadow.mapSize.height = 2048;  // Default is usually 1024
    this.add(light);
  }

  onPointerUp(event) {
    this.mouseReticle.setPressed(false);
  }
}
