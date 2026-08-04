import type * as THREE from 'three';

import type {UIElement} from '../UIElement';
import type {UITheme} from '../UITheme';

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
  sync(
    theme: UITheme,
    viewport: {width: number; height: number},
    stateFor: UIPresentationStateFor,
    rootOrder: number
  ): UIHitMapping[];
  present(stateFor: UIPresentationStateFor): void;
  update(deltaSeconds: number): void;
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
