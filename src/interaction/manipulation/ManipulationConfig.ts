import * as THREE from 'three';

import type {ResolvedManipulationAction} from '../InteractionTypes';
import {
  ManipulationAction,
  type ManipulationOptions,
  type RotateOptions,
  type ScaleOptions,
  type TranslateOptions,
} from './ManipulationTypes';

const EPSILON = 1e-8;

export type NormalizedManipulationConfig = {
  translate?: TranslateOptions;
  rotate?: RotateOptions;
  scale?: ScaleOptions;
  handle?: ResolvedManipulationAction | typeof ManipulationAction.None;
};

export function normalizeManipulationConfig(
  value: boolean | ManipulationOptions | undefined
): NormalizedManipulationConfig | undefined {
  if (!value) return undefined;
  if (value === true) {
    return {
      translate: {},
      scale: {},
      handle: ManipulationAction.Translate,
    };
  }
  const translate = normalizeAction(value.actions?.translate);
  const rotate = normalizeAction(value.actions?.rotate);
  const scale = normalizeAction(value.actions?.scale);
  const handle = value.handle?.action;
  if (handle !== undefined && !isHandleAction(handle)) return undefined;
  if (!translate && !rotate && !scale) return undefined;
  return {translate, rotate, scale, handle};
}

export function isManipulationActionEnabled(
  config: NormalizedManipulationConfig,
  action: ResolvedManipulationAction
): boolean {
  if (action === ManipulationAction.Translate) return !!config.translate;
  if (action === ManipulationAction.Rotate) return !!config.rotate;
  if (action === ManipulationAction.Scale) return !!config.scale;
  return false;
}

export function isHandleAction(
  value: unknown
): value is ResolvedManipulationAction | typeof ManipulationAction.None {
  return value === ManipulationAction.None || isManipulationAction(value);
}

export function normalizeRotationAxis(
  axis: RotateOptions['axis']
): THREE.Vector3 | undefined {
  const vector =
    axis === undefined || axis === 'y'
      ? new THREE.Vector3(0, 1, 0)
      : axis === 'x'
        ? new THREE.Vector3(1, 0, 0)
        : axis === 'z'
          ? new THREE.Vector3(0, 0, 1)
          : new THREE.Vector3(axis.x, axis.y, axis.z);
  if (!isFiniteVector(vector) || vector.lengthSq() < EPSILON) return undefined;
  return vector.normalize();
}

export function cloneScaleOptions(
  options: ScaleOptions | undefined
): ScaleOptions {
  const cloneLimit = (
    value: number | THREE.Vector3Like | undefined
  ): number | THREE.Vector3Like | undefined =>
    typeof value === 'object' && value !== null
      ? {x: value.x, y: value.y, z: value.z}
      : value;
  return {
    minScale: cloneLimit(options?.minScale),
    maxScale: cloneLimit(options?.maxScale),
  };
}

function normalizeAction<T extends object>(
  value: boolean | T | undefined
): T | undefined {
  return value === true ? ({} as T) : value || undefined;
}

function isManipulationAction(
  value: unknown
): value is ResolvedManipulationAction {
  return (
    value === ManipulationAction.Translate ||
    value === ManipulationAction.Rotate ||
    value === ManipulationAction.Scale
  );
}

function isFiniteVector(value: THREE.Vector3): boolean {
  return (
    Number.isFinite(value.x) &&
    Number.isFinite(value.y) &&
    Number.isFinite(value.z)
  );
}
