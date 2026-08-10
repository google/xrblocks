import type * as THREE from 'three';

import type {UIElement} from '../UIElement';
import type {UITheme} from '../UITheme';
import type {UIValidationIssue} from '../UIValidation';

export interface UIHitMapping {
  readonly physical: THREE.Object3D;
  readonly logical: UIElement;
}

export interface UIPresentationState {
  readonly hovered: boolean;
  readonly active: boolean;
  readonly disabled: boolean;
  readonly cursorPointCount: 0 | 1 | 2;
}

export type UIPresentationStateFor = (
  element: UIElement,
  cursorPoints?: readonly [THREE.Vector3, THREE.Vector3]
) => UIPresentationState;

export interface UIMount {
  readonly object: THREE.Object3D;
  /**
   * Commits durable public state before layout and hit testing. A mapping list
   * is returned only when physical hit objects changed.
   */
  commit(
    theme: UITheme,
    viewport: {width: number; height: number},
    rootOrder: number
  ): readonly UIHitMapping[] | undefined;
  present(stateFor: UIPresentationStateFor): void;
  update(deltaSeconds: number): void;
  validate(): readonly UIValidationIssue[];
  dispose(): void;
}

export interface UIBackend {
  configureRenderer?(renderer: THREE.WebGLRenderer): void;
  createMount(root: UIElement): UIMount;
  dispose(): void;
}

export interface UIBackendModule {
  createUIBackend(): UIBackend;
}
