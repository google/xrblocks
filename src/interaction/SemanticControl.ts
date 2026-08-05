import type * as THREE from 'three';

import type {InteractionSource} from './InteractionTypes';

export interface SemanticControlInput {
  readonly source: InteractionSource;
  readonly point: THREE.Vector3;
  readonly uv?: THREE.Vector2;
}

export interface SemanticControlState {
  readonly kind: 'button' | 'slider';
  isDisabled(): boolean;
  activate(): void;
  begin?(input: SemanticControlInput): void;
  update?(input: SemanticControlInput): void;
  complete?(): void;
  cancel?(): void;
}

const CONTROLS = new WeakMap<THREE.Object3D, SemanticControlState>();

/** Registers one built-in semantic control without exposing UI internals. */
export function registerSemanticControl(
  object: THREE.Object3D,
  state: SemanticControlState
): void {
  CONTROLS.set(object, state);
}

export function isSemanticControl(object: THREE.Object3D): boolean {
  return CONTROLS.has(object);
}

export function isSemanticControlDisabled(object: THREE.Object3D): boolean {
  return CONTROLS.get(object)?.isDisabled() ?? true;
}

export function getSemanticControl(
  object: THREE.Object3D
): SemanticControlState | undefined {
  return CONTROLS.get(object);
}
