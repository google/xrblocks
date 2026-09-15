import type {InteractionSourceState} from '../../InteractionTypes';
import {cloneScaleOptions} from '../ManipulationConfig';
import {
  clampScaleFactor,
  isPositiveFinite,
  isPositiveVector,
} from '../ManipulationMath';
import {ManipulationAction} from '../ManipulationTypes';
import type {
  ManipulationDriver,
  ManipulationDriverSession,
  Proposal,
  ScaleBaseline,
} from './DriverTypes';

/** Captures and proposes Scale data. It does not own sessions or events. */
export class ScaleDriver implements ManipulationDriver<ScaleBaseline> {
  readonly action = ManipulationAction.Scale;

  capture(
    session: ManipulationDriverSession,
    auxiliary?: InteractionSourceState
  ): ScaleBaseline | undefined {
    if (!auxiliary) return undefined;
    const distance = session.primary.snapshot.position.distanceTo(
      auxiliary.position
    );
    if (!isPositiveFinite(distance) || !isPositiveVector(session.owner.scale)) {
      return undefined;
    }
    const options = cloneScaleOptions(session.config.scale);
    if (!isPositiveFinite(clampScaleFactor(1, session.owner.scale, options))) {
      return undefined;
    }
    return {
      action: this.action,
      scale: session.owner.scale.clone(),
      distance,
      options,
    };
  }

  propose(
    session: ManipulationDriverSession,
    baseline: ScaleBaseline
  ): Proposal | undefined {
    if (!session.auxiliary) return undefined;
    const currentDistance = session.primary.snapshot.position.distanceTo(
      session.auxiliary.position
    );
    let factor = currentDistance / baseline.distance;
    if (!isPositiveFinite(factor)) return undefined;
    factor = clampScaleFactor(factor, baseline.scale, baseline.options);
    if (!isPositiveFinite(factor)) return undefined;
    const scale = baseline.scale.clone().multiplyScalar(factor);
    if (!isPositiveVector(scale)) return undefined;
    const center = session.primary.snapshot.position
      .clone()
      .add(session.auxiliary.position)
      .multiplyScalar(0.5);
    return {
      action: this.action,
      factor,
      center,
      scale,
      apply: () => session.owner.scale.copy(scale),
    };
  }
}
