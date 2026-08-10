import * as THREE from 'three';

import {
  DEFAULT_FACE_CAMERA_SMOOTHING,
  faceCameraSlerpAlpha,
} from '../../../utils/FaceCameraMath';
import {
  faceCameraQuaternion,
  isFiniteVector,
  worldPositionToLocal,
} from '../ManipulationMath';
import {ManipulationAction} from '../ManipulationTypes';
import type {
  ManipulationDriver,
  ManipulationDriverSession,
  Proposal,
  TranslateBaseline,
} from './DriverTypes';

/** Captures and proposes Translate data. It does not own sessions or events. */
export class TranslateDriver implements ManipulationDriver<TranslateBaseline> {
  readonly action = ManipulationAction.Translate;

  constructor(
    private readonly camera?: THREE.Camera,
    private readonly timer?: THREE.Timer
  ) {}

  capture(session: ManipulationDriverSession): TranslateBaseline | undefined {
    const snapshot = session.primary.snapshot;
    const options = session.config.translate ?? {};
    if (
      options.faceCamera &&
      ((options.mode !== undefined &&
        options.mode !== 'cylindrical' &&
        options.mode !== 'spherical') ||
        (options.smoothing !== undefined &&
          (!Number.isFinite(options.smoothing) || options.smoothing < 0)))
    ) {
      return undefined;
    }
    const baseline: TranslateBaseline = {
      action: this.action,
      worldPosition: session.owner.getWorldPosition(new THREE.Vector3()),
      sourcePosition: snapshot.position.clone(),
      options: {...options},
    };
    if (snapshot.ray) {
      baseline.rayDepth = snapshot.ray.direction.dot(
        session.primary.capture.point.clone().sub(snapshot.ray.origin)
      );
      baseline.rayPoint = snapshot.ray
        .at(baseline.rayDepth, new THREE.Vector3())
        .clone();
    }
    return baseline;
  }

  propose(
    session: ManipulationDriverSession,
    baseline: TranslateBaseline
  ): Proposal | undefined {
    const snapshot = session.primary.snapshot;
    let delta: THREE.Vector3;
    let point: THREE.Vector3;
    if (snapshot.ray && baseline.rayDepth !== undefined && baseline.rayPoint) {
      point = snapshot.ray.at(baseline.rayDepth, new THREE.Vector3());
      delta = point.clone().sub(baseline.rayPoint);
    } else {
      delta = snapshot.position.clone().sub(baseline.sourcePosition);
      point = session.primary.capture.point.clone().add(delta);
    }
    const worldPosition = baseline.worldPosition.clone().add(delta);
    const parent = session.owner.parent;
    parent?.updateWorldMatrix(true, false);
    const localPosition = worldPositionToLocal(
      worldPosition,
      parent?.matrixWorld
    );
    const localQuaternion = baseline.options.faceCamera
      ? faceCameraQuaternion(
          worldPosition,
          this.camera?.getWorldPosition(new THREE.Vector3()),
          parent?.getWorldQuaternion(new THREE.Quaternion()),
          baseline.options.mode
        )
      : undefined;
    const rotationAlpha = this.timer
      ? faceCameraSlerpAlpha(
          baseline.options.smoothing ?? DEFAULT_FACE_CAMERA_SMOOTHING,
          this.timer.getDelta()
        )
      : 1;
    if (
      !isFiniteVector(point) ||
      !isFiniteVector(delta) ||
      !isFiniteVector(worldPosition) ||
      !isFiniteVector(localPosition)
    ) {
      return undefined;
    }
    return {
      action: this.action,
      point,
      delta,
      position: localPosition,
      worldPosition,
      apply: () => {
        if (!isFiniteVector(localPosition)) return;
        session.owner.position.copy(localPosition);
        if (localQuaternion) {
          session.owner.quaternion.slerp(localQuaternion, rotationAlpha);
        }
      },
    };
  }
}
