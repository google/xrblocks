import * as THREE from 'three';
import {
  Core,
  Simulator,
  User,
  World,
  type SimulatorHandPoseRotations,
} from 'xrblocks';

import {
  DEFAULT_EMBODIED_CONTROL_OPTIONS,
  type XRCompoundControl,
  type EmbodiedControlExecutorOptions,
  type EmbodiedControlOptions,
  type EmbodiedControlStep,
  type HandControl,
  type LocomotionControl,
} from './EmbodiedControlTypes';

export type EmbodiedControlExecutorDependencies = {
  core: Core;
  simulator: Simulator;
  camera: THREE.Camera;
};

const vector = new THREE.Vector3();
const euler = new THREE.Euler();
const quaternion = new THREE.Quaternion();

function mergeOptions(
  options: EmbodiedControlOptions
): EmbodiedControlExecutorOptions {
  return {
    tickMs: options.tickMs ?? DEFAULT_EMBODIED_CONTROL_OPTIONS.tickMs,
    applyHandRotationConstraints:
      options.applyHandRotationConstraints ??
      DEFAULT_EMBODIED_CONTROL_OPTIONS.applyHandRotationConstraints,
    realTime: options.realTime ?? DEFAULT_EMBODIED_CONTROL_OPTIONS.realTime,
  };
}

function nextAnimationFrame() {
  return new Promise<void>((resolve) => {
    if (typeof requestAnimationFrame === 'function') {
      requestAnimationFrame(() => resolve());
    } else {
      setTimeout(resolve, 0);
    }
  });
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

  applyControl(control: XRCompoundControl) {
    if (this.activeStep) {
      throw new EmbodiedControlBusyError();
    }
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
    this.activeStep = true;

    try {
      const tickMs = this.options.tickMs;
      const durationMs = step.durationMs ?? tickMs;
      const stepCount = Math.max(1, Math.ceil(durationMs / tickMs));
      let elapsedMs = 0;
      const initialCameraQuaternion =
        this.dependencies.camera.quaternion.clone();

      for (let i = 0; i < stepCount; i++) {
        const remainingMs = Math.max(0, durationMs - elapsedMs);
        const currentTickMs =
          i === stepCount - 1
            ? remainingMs || tickMs
            : Math.min(tickMs, remainingMs);
        const fraction = durationMs > 0 ? currentTickMs / durationMs : 1;

        this.applyControlFraction(
          step.control || {},
          fraction,
          initialCameraQuaternion
        );

        this.dependencies.core.stepFrame(currentTickMs);
        elapsedMs += currentTickMs;
        if (this.options.realTime && i < stepCount - 1) {
          await nextAnimationFrame();
        }
      }
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
      camera.position.add(vector);
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

    if (control.rotations) {
      this.applyHandRotations(handIndex, control.rotations);
    }

    if (control.selectStart) {
      this.applyHandSelect(handIndex, true);
    } else if (control.selectEnd) {
      this.applyHandSelect(handIndex, false);
    }
  }

  private applyHandSelect(handIndex: number, selected: boolean) {
    const {simulator} = this.dependencies;
    if (handIndex === 0) {
      simulator.hands.setLeftHandPinching(selected);
    } else {
      simulator.hands.setRightHandPinching(selected);
    }
  }

  private applyHandRotations(
    handIndex: number,
    rotations: SimulatorHandPoseRotations
  ) {
    const {simulator} = this.dependencies;
    const mergedRotations =
      handIndex === 0
        ? {...simulator.hands.leftHandTargetRotations, ...rotations}
        : {...simulator.hands.rightHandTargetRotations, ...rotations};

    if (handIndex === 0) {
      simulator.hands.setLeftHandRotations(
        mergedRotations,
        this.options.applyHandRotationConstraints
      );
    } else {
      simulator.hands.setRightHandRotations(
        mergedRotations,
        this.options.applyHandRotationConstraints
      );
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

      if (target instanceof THREE.Object3D) {
        const forward = new THREE.Vector3(0, 0, 1).applyQuaternion(
          target.quaternion
        );
        camera.position.copy(targetWorldPos).addScaledVector(forward, distance);
      } else {
        camera.position.copy(targetWorldPos);
      }

      if (snapToGround && world?.planes && user) {
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

      if (velocity === undefined || velocity <= 0) {
        camera.lookAt(targetWorldPos);
        core.stepFrame(this.options.tickMs);
        return;
      }

      const Q_s = camera.quaternion.clone();
      camera.lookAt(targetWorldPos);
      const Q_t = camera.quaternion.clone();
      camera.quaternion.copy(Q_s);

      const angle = Q_s.angleTo(Q_t);
      const durationMs = (angle / velocity) * 1000;

      let elapsedMs = 0;
      const tickMs = this.options.tickMs;
      const stepCount = Math.max(1, Math.ceil(durationMs / tickMs));
      for (let i = 0; i < stepCount; i++) {
        const remainingMs = Math.max(0, durationMs - elapsedMs);
        const currentTickMs =
          i === stepCount - 1
            ? remainingMs || tickMs
            : Math.min(tickMs, remainingMs);
        elapsedMs += currentTickMs;
        const u = durationMs > 0 ? elapsedMs / durationMs : 1;
        camera.quaternion.slerpQuaternions(Q_s, Q_t, u);
        core.stepFrame(currentTickMs);
        if (this.options.realTime && i < stepCount - 1) {
          await nextAnimationFrame();
        }
      }
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

      if (velocity === undefined || velocity <= 0) {
        simulator.simulatorControllerState.localControllerOrientations[
          handIndex
        ].copy(targetQuat);
        core.stepFrame(this.options.tickMs);
        return;
      }

      const startQuat =
        simulator.simulatorControllerState.localControllerOrientations[
          handIndex
        ].clone();

      const angle = startQuat.angleTo(targetQuat);
      const durationMs = (angle / velocity) * 1000;

      let elapsedMs = 0;
      const tickMs = this.options.tickMs;
      const stepCount = Math.max(1, Math.ceil(durationMs / tickMs));
      for (let i = 0; i < stepCount; i++) {
        const remainingMs = Math.max(0, durationMs - elapsedMs);
        const currentTickMs =
          i === stepCount - 1
            ? remainingMs || tickMs
            : Math.min(tickMs, remainingMs);
        elapsedMs += currentTickMs;
        const u = durationMs > 0 ? elapsedMs / durationMs : 1;
        simulator.simulatorControllerState.localControllerOrientations[
          handIndex
        ].slerpQuaternions(startQuat, targetQuat, u);
        core.stepFrame(currentTickMs);
        if (this.options.realTime && i < stepCount - 1) {
          await nextAnimationFrame();
        }
      }
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

      if (velocity === undefined || velocity <= 0) {
        simulator.simulatorControllerState.localControllerPositions[
          handIndex
        ].copy(targetCamSpace);
        core.stepFrame(this.options.tickMs);
        return;
      }

      const startPos =
        simulator.simulatorControllerState.localControllerPositions[
          handIndex
        ].clone();

      const distance = startPos.distanceTo(targetCamSpace);
      const durationMs = (distance / velocity) * 1000;

      let elapsedMs = 0;
      const tickMs = this.options.tickMs;
      const stepCount = Math.max(1, Math.ceil(durationMs / tickMs));
      for (let i = 0; i < stepCount; i++) {
        const remainingMs = Math.max(0, durationMs - elapsedMs);
        const currentTickMs =
          i === stepCount - 1
            ? remainingMs || tickMs
            : Math.min(tickMs, remainingMs);
        elapsedMs += currentTickMs;
        const u = durationMs > 0 ? elapsedMs / durationMs : 1;
        simulator.simulatorControllerState.localControllerPositions[
          handIndex
        ].lerpVectors(startPos, targetCamSpace, u);
        core.stepFrame(currentTickMs);
        if (this.options.realTime && i < stepCount - 1) {
          await nextAnimationFrame();
        }
      }
    });
  }

  async click(
    handIndex = 1,
    options: {durationMs?: number} = {}
  ): Promise<void> {
    const {durationMs = 200} = options;
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
