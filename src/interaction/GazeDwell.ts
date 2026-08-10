import * as THREE from 'three';

import type {Controller} from '../input/Controller.js';
import type {ResolvedRay} from './InteractionTypes.js';

interface GazeDwellState {
  target?: THREE.Object3D;
  elapsed: number;
  lastPoint?: THREE.Vector3;
  armed: boolean;
}

export interface GazeDwellUpdate {
  progress: number;
  completed: boolean;
}

const DWELL_SECONDS = 1.5;
const MOVEMENT_THRESHOLD = 0.2;

/** Tracks stable gaze time for each source and emits one completion per target. */
export class GazeDwell {
  private readonly states = new Map<Controller, GazeDwellState>();

  update(
    controller: Controller,
    resolved: ResolvedRay | undefined,
    deltaSeconds: number,
    paused = false
  ): GazeDwellUpdate {
    const target = resolved?.target;
    const point = target ? resolved?.intersection.point : undefined;
    let state = this.states.get(controller);
    if (!state || state.target !== target) {
      state = {
        target,
        elapsed: 0,
        lastPoint: point?.clone(),
        armed: true,
      };
      this.states.set(controller, state);
      return {progress: 0, completed: false};
    }
    if (!target || !point) return {progress: 0, completed: false};
    if (paused) {
      state.lastPoint?.copy(point);
      return {
        progress: state.elapsed / DWELL_SECONDS,
        completed: false,
      };
    }
    if (!state.armed) {
      state.lastPoint?.copy(point);
      return {progress: 1, completed: false};
    }

    const delta = Math.max(0, deltaSeconds);
    const movement =
      (state.lastPoint?.distanceTo(point) ?? 0) /
      Math.max(delta, Number.EPSILON);
    state.lastPoint ??= point.clone();
    state.lastPoint.copy(point);
    if (movement > MOVEMENT_THRESHOLD) state.elapsed = 0;
    else state.elapsed = Math.min(DWELL_SECONDS, state.elapsed + delta);

    const completed = state.elapsed === DWELL_SECONDS;
    if (completed) state.armed = false;
    return {progress: state.elapsed / DWELL_SECONDS, completed};
  }

  remove(controller: Controller): void {
    this.states.delete(controller);
  }
}
