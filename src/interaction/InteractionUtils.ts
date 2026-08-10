import * as THREE from 'three';

import type {
  InteractionCallbackDispatch,
  SelectionCapture,
  TargetedInteractionHook,
} from './InteractionTypes.js';

export function dispatchInteractionPath(
  callbacks: InteractionCallbackDispatch,
  path: readonly THREE.Object3D[],
  hook: TargetedInteractionHook,
  argument: unknown
): void {
  const state = {stopped: false};
  const event = eventWithPropagation(argument, state);
  for (const script of path) {
    callbacks.invokeTarget(script, hook, event);
    if (state.stopped) return;
  }
}

function eventWithPropagation(
  argument: unknown,
  state: {stopped: boolean}
): unknown {
  if (!argument || typeof argument !== 'object') return argument;
  const event = Object.create(Object.getPrototypeOf(argument)) as Record<
    PropertyKey,
    unknown
  >;
  Object.defineProperties(event, Object.getOwnPropertyDescriptors(argument));
  Object.defineProperty(event, 'stopPropagation', {
    enumerable: true,
    configurable: true,
    value() {
      state.stopped = true;
    },
  });
  return event;
}

export function selectionInvalidReason(
  selection: SelectionCapture,
  ancestry: readonly THREE.Object3D[],
  semanticDisabled: boolean
): 'removed' | 'hidden' | 'disabled' | undefined {
  const ownerIndex = ancestry.indexOf(selection.owner);
  if (ownerIndex < 0) return 'removed';

  for (let index = 0; index + 1 < ancestry.length; index++) {
    if (ancestry[index].parent !== ancestry[index + 1]) return 'removed';
  }

  for (let index = 0; index < ancestry.length; index++) {
    const object = ancestry[index];
    if (object.visible === false) return 'hidden';
  }

  if (semanticDisabled) return 'disabled';
  for (let index = 0; index < ancestry.length; index++) {
    const object = ancestry[index];
    if (object.xb?.pointerEvents === 'none') return 'disabled';
    if (index <= ownerIndex && object.xb?.interactionEnabled === false)
      return 'disabled';
  }
}
