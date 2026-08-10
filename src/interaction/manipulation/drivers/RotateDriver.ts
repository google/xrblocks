import * as THREE from 'three';

import {normalizeRotationAxis} from '../ManipulationConfig';
import {isFiniteQuaternion, worldQuaternionToLocal} from '../ManipulationMath';
import {ManipulationAction} from '../ManipulationTypes';
import type {
  ManipulationDriver,
  ManipulationDriverSession,
  Proposal,
  RotateBaseline,
} from './DriverTypes';

/** Captures and proposes Rotate data. It does not own sessions or events. */
export class RotateDriver implements ManipulationDriver<RotateBaseline> {
  readonly action = ManipulationAction.Rotate;

  capture(session: ManipulationDriverSession): RotateBaseline | undefined {
    const raw = session.config.rotate ?? {};
    const axis = normalizeRotationAxis(raw.axis);
    const sensitivity = raw.sensitivity ?? 10;
    if (!axis || !Number.isFinite(sensitivity)) return undefined;
    return {
      action: this.action,
      localQuaternion: session.owner.quaternion.clone(),
      worldQuaternion: session.owner.getWorldQuaternion(new THREE.Quaternion()),
      sourcePosition: session.primary.snapshot.position.clone(),
      sourceOrientationInverse: session.primary.snapshot.orientation
        .clone()
        .invert(),
      axis,
      options: {space: raw.space ?? 'world', sensitivity},
    };
  }

  propose(
    session: ManipulationDriverSession,
    baseline: RotateBaseline
  ): Proposal | undefined {
    const snapshot = session.primary.snapshot;
    let angle: number;
    if (snapshot.sourceType === 'mouse') {
      const deltaRotation = snapshot.orientation
        .clone()
        .multiply(baseline.sourceOrientationInverse);
      angle =
        -new THREE.Euler().setFromQuaternion(deltaRotation, 'YXZ').y *
        baseline.options.sensitivity;
    } else {
      const localDelta = snapshot.position
        .clone()
        .sub(baseline.sourcePosition)
        .applyQuaternion(baseline.sourceOrientationInverse);
      angle = localDelta.x * baseline.options.sensitivity;
    }
    const offset = new THREE.Quaternion().setFromAxisAngle(
      baseline.axis,
      angle
    );
    let quaternion: THREE.Quaternion;
    if (baseline.options.space === 'local') {
      quaternion = baseline.localQuaternion.clone().multiply(offset);
    } else {
      const world = offset.multiply(baseline.worldQuaternion);
      const parent = session.owner.parent;
      parent?.updateWorldMatrix(true, false);
      quaternion = worldQuaternionToLocal(
        world,
        parent?.getWorldQuaternion(new THREE.Quaternion())
      );
    }
    if (!Number.isFinite(angle) || !isFiniteQuaternion(quaternion)) {
      return undefined;
    }
    return {
      action: this.action,
      angle,
      quaternion,
      apply: () => {
        if (Number.isFinite(angle) && isFiniteQuaternion(quaternion)) {
          session.owner.quaternion.copy(quaternion).normalize();
        }
      },
    };
  }
}
