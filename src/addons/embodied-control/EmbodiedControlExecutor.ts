import * as THREE from 'three';
import {Core, Simulator, User, World} from 'xrblocks';

import {
  DEFAULT_EMBODIED_CONTROL_OPTIONS,
  type XRCompoundControl,
  type EmbodiedControlExecutorOptions,
  type EmbodiedControlOptions,
  type EmbodiedControlStep,
  type HandControl,
  type LocomotionControl,
} from './EmbodiedControlTypes';
import {runTimedMotion, type TimedMotionTick} from './EmbodiedControlTiming';

export type EmbodiedControlExecutorDependencies = {
  core: Core;
  simulator: Simulator;
  camera: THREE.Camera;
};

const vector = new THREE.Vector3();
const targetCameraPosition = new THREE.Vector3();
const euler = new THREE.Euler();
const quaternion = new THREE.Quaternion();

function requirePositiveFinite(value: number, name: string): number {
  if (!Number.isFinite(value) || value <= 0) {
    throw new RangeError(`${name} must be a finite number greater than zero.`);
  }
  return value;
}

function mergeOptions(
  options: EmbodiedControlOptions
): EmbodiedControlExecutorOptions {
  const tickMs = options.tickMs ?? DEFAULT_EMBODIED_CONTROL_OPTIONS.tickMs;
  return {
    tickMs: requirePositiveFinite(tickMs, 'tickMs'),
    applyHandRotationConstraints:
      options.applyHandRotationConstraints ??
      DEFAULT_EMBODIED_CONTROL_OPTIONS.applyHandRotationConstraints,
    realTime: options.realTime ?? DEFAULT_EMBODIED_CONTROL_OPTIONS.realTime,
  };
}

export class EmbodiedControlBusyError extends Error {
  constructor() {
    super('EmbodiedControl already has an active step.');
    this.name = 'EmbodiedControlBusyError';
  }
}

export class EmbodiedControlExecutor {
  private activeStep = false;
  private options: EmbodiedControlExecutorOptions;

  constructor(
    private dependencies: EmbodiedControlExecutorDependencies,
    options: EmbodiedControlOptions = {}
  ) {
    this.options = mergeOptions(options);
  }

  configure(options: EmbodiedControlOptions) {
    this.options = mergeOptions({
      ...this.options,
      ...options,
    });
  }

  get busy() {
    return this.activeStep;
  }

  private async runTimedMotion(
    requestedDurationMs: number,
    applyTick: TimedMotionTick
  ) {
    return runTimedMotion({
      requestedDurationMs: requirePositiveFinite(
        requestedDurationMs,
        'durationMs'
      ),
      tickMs: this.options.tickMs,
      realTime: this.options.realTime,
      applyTick,
    });
  }

  applyControl(control: XRCompoundControl) {
    if (this.activeStep) {
      throw new EmbodiedControlBusyError();
    }
    this.validateControl(control);
    this.applyControlFraction(
      control,
      1,
      this.dependencies.camera.quaternion.clone()
    );
  }

  async step(step: EmbodiedControlStep): Promise<void> {
    if (this.activeStep) {
      throw new EmbodiedControlBusyError();
    }
    const control = step.control ?? {};
    this.validateControl(control);
    this.activeStep = true;

    try {
      const durationMs = step.durationMs ?? this.options.tickMs;
      const initialCameraQuaternion =
        this.dependencies.camera.quaternion.clone();

      await this.runTimedMotion(durationMs, (_elapsed, currentTick, total) => {
        this.applyControlFraction(
          control,
          currentTick / total,
          initialCameraQuaternion
        );
        this.dependencies.core.stepFrame(currentTick);
      });
    } finally {
      this.activeStep = false;
    }
  }

  private applyControlFraction(
    control: XRCompoundControl,
    fraction: number,
    initialCameraQuaternion: THREE.Quaternion
  ) {
    this.applyInstantHandControls(control.leftHand, 0);
    this.applyInstantHandControls(control.rightHand, 1);
    this.applyLocomotion(control.locomotion, fraction, initialCameraQuaternion);
    this.applyHandMotion(control.leftHand, 0, fraction);
    this.applyHandMotion(control.rightHand, 1, fraction);
  }

  private applyLocomotion(
    control: LocomotionControl | undefined,
    fraction: number,
    initialCameraQuaternion: THREE.Quaternion
  ) {
    if (!control) return;
    const {camera} = this.dependencies;

    if (control.move) {
      vector
        .fromArray(control.move)
        .multiplyScalar(fraction)
        .applyQuaternion(initialCameraQuaternion);
      vector.add(camera.position);
      this.dependencies.simulator.navMesh.applyUserMovement(camera, vector);
    }

    if (control.rotate) {
      euler.set(
        THREE.MathUtils.degToRad(control.rotate[0]) * fraction,
        THREE.MathUtils.degToRad(control.rotate[1]) * fraction,
        THREE.MathUtils.degToRad(control.rotate[2]) * fraction,
        'YXZ'
      );
      quaternion.setFromEuler(euler);
      camera.quaternion.multiply(quaternion);
    }
  }

  private applyHandMotion(
    control: HandControl | undefined,
    handIndex: number,
    fraction: number
  ) {
    if (!control) return;
    const controllerState =
      this.dependencies.simulator.simulatorControllerState;

    if (control.move) {
      vector.fromArray(control.move).multiplyScalar(fraction);
      controllerState.localControllerPositions[handIndex].add(vector);
    }

    if (control.rotate) {
      euler.set(
        THREE.MathUtils.degToRad(control.rotate[0]) * fraction,
        THREE.MathUtils.degToRad(control.rotate[1]) * fraction,
        THREE.MathUtils.degToRad(control.rotate[2]) * fraction,
        'YXZ'
      );
      quaternion.setFromEuler(euler);
      controllerState.localControllerOrientations[handIndex].multiply(
        quaternion
      );
    }
  }

  private applyInstantHandControls(
    control: HandControl | undefined,
    handIndex: number
  ) {
    if (!control) return;
    const {simulator} = this.dependencies;

    if (control.visible !== undefined) {
      const controller =
        handIndex === 0
          ? simulator.hands.leftController
          : simulator.hands.rightController;
      controller.visible = control.visible;
    }

    simulator.hands.setHandState(
      handIndex,
      {
        pose: control.pose,
        rotations: control.rotations,
        selected: control.selectStart
          ? true
          : control.selectEnd
            ? false
            : undefined,
      },
      this.options.applyHandRotationConstraints
    );
  }

  private validateControl(control: XRCompoundControl) {
    for (const hand of [control.leftHand, control.rightHand]) {
      if (hand?.selectStart && hand.selectEnd) {
        throw new Error(
          'A hand control cannot contain both selectStart and selectEnd.'
        );
      }
    }
  }

  private async executeAction(actionFn: () => Promise<void>): Promise<void> {
    if (this.activeStep) {
      throw new EmbodiedControlBusyError();
    }
    this.activeStep = true;
    try {
      await actionFn();
    } finally {
      this.activeStep = false;
    }
  }

  private getTargetWorldPosition(
    target: THREE.Object3D | THREE.Vector3 | [number, number, number],
    out: THREE.Vector3
  ) {
    if (target instanceof THREE.Vector3) {
      out.copy(target);
    } else if (Array.isArray(target)) {
      out.fromArray(target);
    } else if (target instanceof THREE.Object3D) {
      target.getWorldPosition(out);
    }
  }

  async teleportTo(
    target: THREE.Vector3 | [number, number, number] | THREE.Object3D,
    options: {
      distance?: number;
      faceTarget?: boolean;
      snapToGround?: boolean;
    } = {}
  ): Promise<void> {
    return this.executeAction(async () => {
      const {distance = 1.5, faceTarget = true, snapToGround = false} = options;
      const {camera, core} = this.dependencies;
      const user = core.registry.get(User);
      const world = core.registry.get(World);
      const targetWorldPos = new THREE.Vector3();
      this.getTargetWorldPosition(target, targetWorldPos);
      targetCameraPosition.copy(targetWorldPos);

      if (target instanceof THREE.Object3D) {
        const forward = new THREE.Vector3(0, 0, 1).applyQuaternion(
          target.quaternion
        );
        targetCameraPosition.addScaledVector(forward, distance);
      }
      this.dependencies.simulator.navMesh.applyUserMovement(
        camera,
        targetCameraPosition
      );

      if (
        snapToGround &&
        !this.dependencies.simulator.navMesh.constrained &&
        world?.planes &&
        user
      ) {
        const horizontalPlanes = world.planes.get().filter((p) => {
          const orientation = (p.orientation || '').toLowerCase();
          const label = (p.label || '').toLowerCase();
          return (
            orientation === 'horizontal' ||
            label === 'floor' ||
            label === 'horizontal'
          );
        });
        if (horizontalPlanes.length > 0) {
          const raycaster = new THREE.Raycaster();
          raycaster.set(
            new THREE.Vector3(
              camera.position.x,
              camera.position.y + 10,
              camera.position.z
            ),
            new THREE.Vector3(0, -1, 0)
          );
          const hits = raycaster.intersectObjects(horizontalPlanes);
          if (hits.length > 0) {
            camera.position.y = hits[0].point.y + user.height;
          }
        }
      }

      if (faceTarget && target instanceof THREE.Object3D) {
        camera.lookAt(targetWorldPos);
      }
      core.stepFrame(this.options.tickMs);
    });
  }

  async lookAtTarget(
    target: THREE.Object3D | THREE.Vector3 | [number, number, number],
    options: {velocity?: number} = {}
  ): Promise<void> {
    return this.executeAction(async () => {
      const {velocity} = options;
      const {camera, core} = this.dependencies;
      const targetWorldPos = new THREE.Vector3();
      this.getTargetWorldPosition(target, targetWorldPos);

      if (velocity === undefined) {
        camera.lookAt(targetWorldPos);
        core.stepFrame(this.options.tickMs);
        return;
      }
      requirePositiveFinite(velocity, 'velocity');

      const Q_s = camera.quaternion.clone();
      camera.lookAt(targetWorldPos);
      const Q_t = camera.quaternion.clone();
      camera.quaternion.copy(Q_s);

      const angle = Q_s.angleTo(Q_t);
      if (angle === 0) {
        core.stepFrame(this.options.tickMs);
        return;
      }
      const durationMs = (angle / velocity) * 1000;

      await this.runTimedMotion(durationMs, (elapsed, currentTick, total) => {
        const u = elapsed / total;
        camera.quaternion.slerpQuaternions(Q_s, Q_t, u);
        core.stepFrame(currentTick);
      });
    });
  }

  async pointTo(
    handIndex: number,
    target: THREE.Object3D | THREE.Vector3 | [number, number, number],
    options: {velocity?: number} = {}
  ): Promise<void> {
    return this.executeAction(async () => {
      const {velocity} = options;
      const {camera, simulator, core} = this.dependencies;
      const targetWorldPos = new THREE.Vector3();
      this.getTargetWorldPosition(target, targetWorldPos);

      const targetCamSpace = targetWorldPos
        .clone()
        .applyMatrix4(camera.matrixWorldInverse);
      const controllerPos =
        simulator.simulatorControllerState.localControllerPositions[handIndex];
      const up = new THREE.Vector3(0, 1, 0);
      const matrix = new THREE.Matrix4().lookAt(
        controllerPos,
        targetCamSpace,
        up
      );
      const targetQuat = new THREE.Quaternion().setFromRotationMatrix(matrix);

      if (velocity === undefined) {
        simulator.simulatorControllerState.localControllerOrientations[
          handIndex
        ].copy(targetQuat);
        core.stepFrame(this.options.tickMs);
        return;
      }
      requirePositiveFinite(velocity, 'velocity');

      const startQuat =
        simulator.simulatorControllerState.localControllerOrientations[
          handIndex
        ].clone();

      const angle = startQuat.angleTo(targetQuat);
      if (angle === 0) {
        core.stepFrame(this.options.tickMs);
        return;
      }
      const durationMs = (angle / velocity) * 1000;

      await this.runTimedMotion(durationMs, (elapsed, currentTick, total) => {
        const u = elapsed / total;
        simulator.simulatorControllerState.localControllerOrientations[
          handIndex
        ].slerpQuaternions(startQuat, targetQuat, u);
        core.stepFrame(currentTick);
      });
    });
  }

  async reachTo(
    handIndex: number,
    target: THREE.Vector3 | [number, number, number] | THREE.Object3D,
    options: {velocity?: number} = {}
  ): Promise<void> {
    return this.executeAction(async () => {
      const {velocity} = options;
      const {camera, simulator, core} = this.dependencies;
      const targetWorldPos = new THREE.Vector3();
      this.getTargetWorldPosition(target, targetWorldPos);

      const targetCamSpace = targetWorldPos
        .clone()
        .applyMatrix4(camera.matrixWorldInverse);

      if (velocity === undefined) {
        simulator.simulatorControllerState.localControllerPositions[
          handIndex
        ].copy(targetCamSpace);
        core.stepFrame(this.options.tickMs);
        return;
      }
      requirePositiveFinite(velocity, 'velocity');

      const startPos =
        simulator.simulatorControllerState.localControllerPositions[
          handIndex
        ].clone();

      const distance = startPos.distanceTo(targetCamSpace);
      if (distance === 0) {
        core.stepFrame(this.options.tickMs);
        return;
      }
      const durationMs = (distance / velocity) * 1000;

      await this.runTimedMotion(durationMs, (elapsed, currentTick, total) => {
        const u = elapsed / total;
        simulator.simulatorControllerState.localControllerPositions[
          handIndex
        ].lerpVectors(startPos, targetCamSpace, u);
        core.stepFrame(currentTick);
      });
    });
  }

  async click(
    handIndex = 1,
    options: {durationMs?: number} = {}
  ): Promise<void> {
    const {durationMs = 200} = options;
    requirePositiveFinite(durationMs, 'durationMs');
    const {simulator} = this.dependencies;
    // Change the lerp speed to allow the hand to pinch and open all the way.
    const originalLerpSpeed = simulator.hands.lerpSpeed;
    simulator.hands.lerpSpeed = 0.3;

    try {
      const pressControl: XRCompoundControl =
        handIndex === 0
          ? {leftHand: {selectStart: true}}
          : {rightHand: {selectStart: true}};
      await this.step({
        control: pressControl,
        durationMs,
      });

      const releaseControl: XRCompoundControl =
        handIndex === 0
          ? {leftHand: {selectEnd: true}}
          : {rightHand: {selectEnd: true}};
      await this.step({
        control: releaseControl,
        durationMs,
      });
    } finally {
      simulator.hands.lerpSpeed = originalLerpSpeed;
    }
  }
}
