import * as THREE from 'three';

import {
  type HoverEvent,
  type LongSelectEvent,
  type ObjectGrabEvent,
  type ObjectTouchEvent,
  type ObjectTouchStartEvent,
  type SelectEndEvent,
  type SelectEvent,
  type SelectionEndReason,
  type Script,
} from '../core/Script.js';
import {ReticleOptions, type RaycastMode} from '../core/Options.js';
import type {Controller} from '../input/Controller.js';
import {objectIsDescendantOf} from '../utils/SceneGraphUtils.js';
import {DirectTouch, type DirectTouchContact} from './DirectTouch.js';
import {GazeDwell} from './GazeDwell.js';
import {HitRegistry} from './HitRegistry.js';
import {HitResolver} from './HitResolver.js';
import {
  getInteractionSource,
  type InteractionDependencies,
  type InteractionFrameInput,
  InteractionSourceState,
  type RaySourceInput,
  type ResolvedRay,
  type SelectionCapture,
} from './InteractionTypes.js';
import {
  dispatchInteractionPath,
  selectionInvalidReason,
} from './InteractionUtils.js';
import {
  createPlanarSurfaceProjector,
  type PlanarSurfaceProjector,
} from './PlanarSurface.js';
import {ReticlePresenter} from './ReticlePresenter.js';
import {ManipulationManager} from './manipulation/ManipulationManager.js';
import {
  getSemanticControl,
  isSemanticControlDisabled,
  type SemanticControlState,
} from './SemanticControl.js';

type AutomaticAction = 'select' | 'semantic' | 'manipulate' | 'none';

interface TargetCapture {
  kind: 'target';
  action: AutomaticAction;
  selection: SelectionCapture;
  ancestry: readonly THREE.Object3D[];
  semantic?: SemanticControlState;
  semanticControl?: THREE.Object3D;
  sliderProjector?: PlanarSurfaceProjector;
  exclusiveControl?: THREE.Object3D;
  longSelectDuration: number;
  longSelectFired: boolean;
  lastStablePoint: THREE.Vector3;
  touch: boolean;
}

interface TouchState {
  readonly selection: SelectionCapture;
  readonly handIndex: number;
  readonly hand?: THREE.Object3D;
  point: THREE.Vector3;
  prevented: boolean;
  grabbing: boolean;
}

type ActiveCapture = {kind: 'none'} | {kind: 'auxiliary'} | TargetCapture;

const DEFAULT_LONG_SELECT_DURATION = 0.75;

/** Owns all logical target, hover, capture, completion, and cancellation state. */
export class Interaction {
  private readonly callbacks;
  private readonly manipulation;
  private readonly reticle;
  private readonly reticleOptions;
  private readonly scene?: THREE.Scene;
  private readonly registry = new HitRegistry();
  private readonly resolver;
  private readonly directTouch;
  private longSelectDuration;
  private readonly gazeDwell = new GazeDwell();
  private readonly sourceStates = new Map<Controller, InteractionSourceState>();
  private readonly frameSnapshots: InteractionSourceState[] = [];
  private readonly rawIntersections = new Map<
    Controller,
    THREE.Intersection[]
  >();
  private readonly resolvedRays = new Map<Controller, ResolvedRay>();
  private readonly hoverPaths = new Map<
    Controller,
    readonly THREE.Object3D[]
  >();
  private readonly captures = new Map<Controller, ActiveCapture>();
  private readonly exclusiveControls = new Map<THREE.Object3D, Controller>();
  private readonly touches = new Map<Controller, TouchState>();
  private readonly suppressedUntilRelease = new Set<Controller>();
  private readonly scaleIntents = new Map<Controller, number>();
  private raycastMode: RaycastMode;
  private frameSources = new Set<Controller>();
  private nextFrameSources = new Set<Controller>();

  constructor(dependencies: InteractionDependencies) {
    this.callbacks = dependencies.callbacks;
    this.scene = dependencies.scene;
    this.manipulation = new ManipulationManager(
      (script, event) => this.callbacks.invokeManipulation(script, event),
      (controller) => this.suppressedUntilRelease.add(controller),
      dependencies.camera,
      dependencies.timer
    );
    this.reticleOptions = dependencies.reticleOptions ?? new ReticleOptions();
    this.reticle =
      dependencies.reticle ?? new ReticlePresenter(this.reticleOptions);
    this.longSelectDuration =
      dependencies.longSelectDuration ?? DEFAULT_LONG_SELECT_DURATION;
    this.raycastMode = dependencies.raycastMode ?? 'continuous';
    this.resolver = new HitResolver(
      this.callbacks,
      this.manipulation,
      this.registry
    );
    this.directTouch = new DirectTouch(this.registry, this.resolver);
  }

  setLongSelectDuration(seconds: number): void {
    if (!Number.isFinite(seconds) || seconds < 0) {
      throw new Error(
        'Options.interaction.longSelectDuration must be finite and nonnegative.'
      );
    }
    this.longSelectDuration = seconds;
  }

  setRaycastMode(mode: RaycastMode): void {
    this.raycastMode = mode;
  }

  /** Replaces all sampled physical interaction state for one engine frame. */
  update(frame: InteractionFrameInput, deltaSeconds = 0): void {
    const nextSources = this.nextFrameSources;
    nextSources.clear();
    for (const input of frame.raySources) nextSources.add(input.controller);
    for (const input of frame.directTouches) nextSources.add(input.controller);
    for (const controller of this.frameSources) {
      if (!nextSources.has(controller)) {
        this.removeSource(controller, 'source-lost');
      }
    }
    this.nextFrameSources = this.frameSources;
    this.frameSources = nextSources;

    for (const [controller, capture] of this.captures) {
      if (capture.kind === 'target') {
        const reason = selectionInvalidReason(
          capture.selection,
          capture.ancestry,
          capture.semanticControl !== undefined &&
            isSemanticControlDisabled(capture.semanticControl)
        );
        if (reason) this.cancelCapture(controller, reason);
      }
    }

    const snapshots = this.frameSnapshots;
    snapshots.length = 0;
    const touchContacts = this.directTouch.update(frame.directTouches);
    for (const contact of touchContacts) {
      const snapshot = this.processTouchContact(contact);
      if (contact.phase !== 'end') snapshots.push(snapshot);
    }

    const deliberate = this.hasDeliberateInput(frame);
    for (const input of frame.raySources) {
      const snapshot = this.updateRay(input, deltaSeconds, deliberate);
      if (snapshot) snapshots.push(snapshot);
    }
    for (const [controller, factor] of this.scaleIntents) {
      this.applyScaleIntent(controller, factor);
    }
    this.scaleIntents.clear();

    if (snapshots.length > 0) {
      try {
        this.manipulation.update(snapshots);
      } catch (error) {
        this.cancelFailedManipulations(error);
      }
    }
    for (const [controller, capture] of this.captures) {
      if (
        (capture.kind === 'auxiliary' ||
          (capture.kind === 'target' && capture.action === 'manipulate')) &&
        this.manipulation.isSourceActive(controller) === false
      ) {
        this.cancelCapture(controller, 'disabled');
      }
    }
    for (const snapshot of snapshots) {
      const capture = this.captures.get(snapshot.controller);
      if (!capture) continue;
      try {
        if (capture.kind === 'target') {
          this.updateLongSelect(capture, snapshot, deltaSeconds);
          this.updateSemantic(capture, snapshot);
        }
        this.callbacks.invokeGlobal(
          'onSelecting',
          this.createSelectEvent(snapshot.controller, capture)
        );
      } catch (error) {
        this.cancelFailedCapture(snapshot.controller, error);
      }
    }
  }

  clear(): void {
    for (const controller of this.frameSources) {
      this.removeSource(controller, 'source-lost');
    }
    this.directTouch.clear();
    this.frameSnapshots.length = 0;
    this.rawIntersections.clear();
    this.frameSources.clear();
    this.nextFrameSources.clear();
    this.exclusiveControls.clear();
    this.scaleIntents.clear();
  }

  registerHitSurface(
    physical: THREE.Object3D,
    logical: THREE.Object3D
  ): () => void {
    return this.registry.register(physical, logical);
  }

  /** Refreshes bounded direct-touch candidates found by the lifecycle pass. */
  syncTouchCandidates(candidates: Iterable<THREE.Object3D>): void {
    this.registry.setWorldTouchCandidates(candidates);
  }

  /** Cancels captures that belong to an object before its Script is disposed. */
  cancelObject(
    object: THREE.Object3D,
    reason: SelectionEndReason = 'removed'
  ): void {
    for (const [controller, capture] of this.captures) {
      if (
        capture.kind === 'target' &&
        selectionBelongsTo(capture.selection, object)
      ) {
        this.cancelCapture(controller, reason);
      }
    }
    for (const [controller, touch] of this.touches) {
      if (!selectionBelongsTo(touch.selection, object)) continue;
      const contact = this.directTouch.remove(controller);
      if (contact) this.processTouchContact(contact);
    }
    for (const [controller, resolved] of this.resolvedRays) {
      if (objectIsDescendantOf(resolved.surface, object)) {
        this.clearResolvedRay(controller);
        this.reticle.clear(controller);
      }
    }
  }

  removeSource(
    controller: Controller,
    reason: SelectionEndReason = 'source-lost'
  ): void {
    this.cancelCapture(controller, reason);
    const contact = this.directTouch.remove(controller);
    if (contact) this.processTouchContact(contact);
    this.finishTouch(controller);
    this.clearResolvedRay(controller);
    this.reticle.clear(controller);
    this.sourceStates.delete(controller);
    this.rawIntersections.delete(controller);
    this.hoverPaths.delete(controller);
    this.gazeDwell.remove(controller);
    this.suppressedUntilRelease.delete(controller);
    this.scaleIntents.delete(controller);
  }

  getSourceSnapshot(
    controller: Controller
  ): InteractionSourceState | undefined {
    return this.sourceStates.get(controller);
  }

  getResolvedRay(controller: Controller): ResolvedRay | undefined {
    return this.resolvedRays.get(controller);
  }

  isPointingAt(object: THREE.Object3D): boolean {
    for (const resolved of this.resolvedRays.values()) {
      if (objectIsDescendantOf(resolved.surface, object)) return true;
    }
    return false;
  }

  isSelectingAt(object: THREE.Object3D): boolean {
    for (const capture of this.captures.values()) {
      if (
        capture.kind === 'target' &&
        objectIsDescendantOf(capture.selection.surface, object)
      ) {
        return true;
      }
    }
    return false;
  }

  isHovered(object: THREE.Object3D): boolean {
    for (const resolved of this.resolvedRays.values()) {
      if (objectIsDescendantOf(resolved.target ?? resolved.surface, object)) {
        return true;
      }
    }
    return false;
  }

  getIntersectionAt(
    object: THREE.Object3D,
    controller?: Controller
  ): THREE.Intersection | null {
    let match: ResolvedRay | undefined;
    let matchIndex = Number.POSITIVE_INFINITY;
    for (const [source, resolved] of this.resolvedRays) {
      if (controller && source !== controller) continue;
      if (!objectIsDescendantOf(resolved.surface, object)) continue;
      const index = controllerIndex(source);
      if (index < matchIndex) {
        match = resolved;
        matchIndex = index;
      }
    }
    return match
      ? clonePublicIntersection(match.intersection, match.surface)
      : null;
  }

  /** Writes up to two internal cursor points in controller order. */
  writeCursorPointsAt(
    object: THREE.Object3D,
    first: THREE.Vector3,
    second: THREE.Vector3
  ): 0 | 1 | 2 {
    let firstIndex = Number.POSITIVE_INFINITY;
    let secondIndex = Number.POSITIVE_INFINITY;
    let firstPoint: THREE.Vector3 | undefined;
    let secondPoint: THREE.Vector3 | undefined;
    for (const [controller, resolved] of this.resolvedRays) {
      if (!objectIsDescendantOf(resolved.surface, object)) continue;
      const index = controllerIndex(controller);
      if (index < firstIndex) {
        secondIndex = firstIndex;
        secondPoint = firstPoint;
        firstIndex = index;
        firstPoint = resolved.intersection.point;
      } else if (index < secondIndex) {
        secondIndex = index;
        secondPoint = resolved.intersection.point;
      }
    }
    if (!firstPoint) return 0;
    first.copy(firstPoint);
    if (!secondPoint) return 1;
    second.copy(secondPoint);
    return 2;
  }

  isManipulating(object: THREE.Object3D): boolean {
    return this.manipulation.isManipulating(object);
  }

  queueScaleIntent(controller: Controller, factor: number): boolean {
    if (!Number.isFinite(factor) || factor <= 0) return false;
    this.scaleIntents.set(
      controller,
      (this.scaleIntents.get(controller) ?? 1) * factor
    );
    return true;
  }

  private applyScaleIntent(controller: Controller, factor: number): boolean {
    const snapshot = this.sourceStates.get(controller);
    const resolved = this.resolvedRays.get(controller);
    if (!snapshot || !resolved?.target) return false;
    const source = getInteractionSource(controller, 'simulator');
    const intentSnapshot = new InteractionSourceState(controller).copyFrom(
      snapshot
    );
    intentSnapshot.source = source;
    intentSnapshot.sourceType = 'simulator';
    return this.manipulation.applyScaleIntent(
      this.createSelection(controller, resolved),
      intentSnapshot,
      factor
    );
  }

  private updateRay(
    input: RaySourceInput,
    deltaSeconds: number,
    deliberate: boolean
  ): InteractionSourceState | undefined {
    if (this.directTouch.has(input.controller)) {
      this.clearResolvedRay(input.controller);
      this.reticle.clear(input.controller);
      return undefined;
    }

    const previousSelected =
      this.sourceStates.get(input.controller)?.selected ?? false;
    const snapshot = this.updateRaySnapshot(input);
    if (!snapshot.selected)
      this.suppressedUntilRelease.delete(input.controller);

    if (this.suppressedUntilRelease.has(input.controller)) {
      this.clearResolvedRay(input.controller);
      this.reticle.clear(input.controller);
      return snapshot;
    }

    const intersections =
      input.intersections ?? this.collectIntersections(input, previousSelected);
    const resolved = this.resolver.resolve(intersections, input.sourceType);
    let gazeCompleted = false;
    if (input.sourceType === 'gaze') {
      const semantic = resolved?.semanticControl
        ? getSemanticControl(resolved.semanticControl)
        : undefined;
      const gazeTarget =
        semantic?.kind === 'button' && resolved?.semanticControl
          ? resolved
          : undefined;
      const dwell = this.gazeDwell.update(
        input.controller,
        gazeTarget,
        deltaSeconds,
        deliberate
      );
      snapshot.selectionProgress = dwell.progress;
      gazeCompleted = dwell.completed;
    } else {
      snapshot.selectionProgress = undefined;
      this.gazeDwell.remove(input.controller);
    }

    this.setResolvedRay(input.controller, snapshot, resolved);
    if (gazeCompleted) {
      this.beginSelection(input.controller, true);
      this.endSelection(input.controller, 'released');
    } else if (snapshot.selected !== previousSelected) {
      if (snapshot.selected) this.beginSelection(input.controller);
      else this.endSelection(input.controller, 'released');
    }
    return snapshot;
  }

  private collectIntersections(
    input: RaySourceInput,
    previousSelected: boolean
  ): readonly THREE.Intersection[] {
    let intersections = this.rawIntersections.get(input.controller);
    if (!intersections) {
      intersections = [];
      this.rawIntersections.set(input.controller, intersections);
    }
    const shouldRaycast =
      this.raycastMode === 'continuous' ||
      input.sourceType === 'gaze' ||
      input.selected ||
      previousSelected ||
      input.released === true;
    if (!shouldRaycast || !this.scene) {
      intersections.length = 0;
      return intersections;
    }
    return this.registry.raycast(this.scene, input.ray, intersections);
  }

  private beginSelection(controller: Controller, gaze = false): void {
    if (this.directTouch.has(controller) || this.captures.has(controller))
      return;
    const snapshot = this.sourceStates.get(controller);
    if (!snapshot) return;
    snapshot.selected = true;
    const resolved = this.resolvedRays.get(controller);

    const claimedScale = this.runManipulationTransition(() =>
      this.manipulation.tryClaimScale(snapshot)
    );
    if (this.suppressedUntilRelease.has(controller)) return;
    if (claimedScale) {
      const capture = {kind: 'auxiliary'} as const;
      this.installCapture(controller, capture);
      this.runCaptureTransition(controller, () => {
        this.clearResolvedRay(controller);
        this.reticle.clear(controller);
        this.callbacks.invokeGlobal(
          'onSelectStart',
          this.createSelectEvent(controller, capture)
        );
      });
      return;
    }

    if (!resolved?.target) {
      const capture = {kind: 'none'} as const;
      this.installCapture(controller, capture);
      this.runCaptureTransition(controller, () => {
        this.callbacks.invokeGlobal(
          'onSelectStart',
          this.createSelectEvent(controller, capture)
        );
      });
      return;
    }
    this.startTargetCapture(controller, snapshot, resolved, false, gaze);
  }

  private startTargetCapture(
    controller: Controller,
    snapshot: InteractionSourceState,
    resolved: ResolvedRay,
    touch: boolean,
    gaze = false
  ): TargetCapture {
    const selection = this.createSelection(controller, resolved);
    const semantic = resolved.semanticControl
      ? getSemanticControl(resolved.semanticControl)
      : undefined;
    let action: AutomaticAction = 'select';
    const wantsManipulation = !semantic && resolved.manipulation !== undefined;
    if (semantic) {
      action = 'semantic';
      if (
        semantic.kind === 'slider' &&
        resolved.semanticControl &&
        this.exclusiveControls.has(resolved.semanticControl)
      ) {
        action = 'none';
      }
    } else if (wantsManipulation) {
      action = 'manipulate';
    }
    if (gaze && semantic?.kind !== 'button') action = 'none';
    const sliderProjector =
      action === 'semantic' && semantic?.kind === 'slider'
        ? createPlanarSurfaceProjector(
            this.registry.resolve(resolved.hitObject).physical
          )
        : undefined;

    const capture: TargetCapture = {
      kind: 'target',
      action,
      selection,
      ancestry: Object.freeze([...resolved.objectPath]),
      semantic,
      semanticControl: resolved.semanticControl,
      sliderProjector,
      exclusiveControl:
        action === 'semantic' && semantic?.kind === 'slider'
          ? resolved.semanticControl
          : undefined,
      longSelectDuration: 0,
      longSelectFired: false,
      lastStablePoint: resolved.intersection.point.clone(),
      touch,
    };
    this.installCapture(controller, capture);
    this.runCaptureTransition(controller, () => {
      const event = this.createSelectEvent(controller, capture);
      dispatchInteractionPath(
        this.callbacks,
        selection.scriptPath,
        'onObjectSelectStart',
        event
      );
      if (
        action === 'manipulate' &&
        !this.manipulation.tryStart(selection, snapshot)
      ) {
        capture.action = 'none';
      }
      if (action === 'semantic') {
        this.invokeSemantic(capture, () =>
          semantic?.begin?.(semanticInput(snapshot, resolved, sliderProjector))
        );
      }
      this.callbacks.invokeGlobal('onSelectStart', event);
    });
    return capture;
  }

  private endSelection(
    controller: Controller,
    reason: SelectionEndReason,
    releasedTarget?: THREE.Object3D,
    finalSnapshot?: InteractionSourceState
  ): void {
    const capture = this.detachCapture(controller);
    if (!capture) return;
    const snapshot = this.sourceStates.get(controller);
    if (snapshot) snapshot.selected = false;

    let completed = false;
    let endReason = reason;
    if (capture.kind === 'auxiliary') {
      completed = this.runManipulationTransition(() =>
        this.manipulation.end(controller, finalSnapshot ?? snapshot)
      );
    } else if (capture.kind === 'target') {
      const released = this.resolvedRays.get(controller);
      const sameTarget =
        (releasedTarget ?? released?.target) === capture.selection.target;
      if (capture.action === 'manipulate') {
        completed = this.runManipulationTransition(() =>
          this.manipulation.end(controller, finalSnapshot ?? snapshot)
        );
      } else if (capture.action === 'semantic') {
        const slider = capture.semantic?.kind === 'slider';
        completed =
          !capture.longSelectFired &&
          !isSemanticControlDisabled(capture.semanticControl!) &&
          (slider || sameTarget);
        if (completed) {
          this.invokeSemantic(capture, () => {
            if (slider) capture.semantic?.complete?.();
            else capture.semantic?.activate();
          });
        } else {
          this.invokeSemantic(capture, () => capture.semantic?.cancel?.());
        }
      } else {
        completed =
          capture.action === 'select' && !capture.longSelectFired && sameTarget;
      }
      endReason = completed
        ? 'released'
        : sameTarget
          ? reason
          : 'released-outside';
      const endEvent: SelectEndEvent = {
        ...this.createSelectEvent(controller, capture),
        completed,
        reason: endReason,
      };
      dispatchInteractionPath(
        this.callbacks,
        capture.selection.scriptPath,
        'onObjectSelectEnd',
        endEvent
      );
    }

    const globalEvent = this.createSelectEvent(controller, capture);
    if (completed) this.callbacks.invokeGlobal('onSelect', globalEvent);
    this.callbacks.invokeGlobal('onSelectEnd', {
      ...globalEvent,
      completed,
      reason: endReason,
    });
  }

  private cancelCapture(
    controller: Controller,
    reason: SelectionEndReason
  ): void {
    const capture = this.detachCapture(controller);
    if (!capture) return;
    this.suppressedUntilRelease.add(controller);
    this.runManipulationTransition(() =>
      this.manipulation.cancelSource(controller)
    );
    const event: SelectEndEvent = {
      ...this.createSelectEvent(controller, capture),
      completed: false,
      reason,
    };
    if (capture.kind === 'target') {
      this.invokeSemantic(capture, () => capture.semantic?.cancel?.());
      dispatchInteractionPath(
        this.callbacks,
        capture.selection.scriptPath,
        'onObjectSelectEnd',
        event
      );
    }
    this.callbacks.invokeGlobal('onSelectEnd', event);
  }

  private processTouchContact(
    contact: DirectTouchContact
  ): InteractionSourceState {
    const snapshot = this.updateTouchSnapshot(contact);
    this.updateTouch(contact, snapshot);
    if (contact.phase === 'end') snapshot.selected = false;
    return snapshot;
  }

  private updateTouch(
    contact: DirectTouchContact,
    snapshot: InteractionSourceState
  ): void {
    if (contact.phase === 'start' && contact.resolved?.target) {
      const selection = this.createSelection(
        contact.controller,
        contact.resolved
      );
      const touchState: TouchState = {
        selection,
        handIndex: contact.handIndex,
        hand: contact.hand,
        point: contact.point.clone(),
        prevented: false,
        grabbing: false,
      };
      this.touches.set(contact.controller, touchState);
      try {
        this.clearResolvedRay(contact.controller);
        this.reticle.clear(contact.controller);
        const prevented = this.dispatchTouchStart(touchState);
        touchState.prevented = prevented;
        if (!prevented) {
          const capture = this.startTargetCapture(
            contact.controller,
            snapshot,
            contact.resolved,
            true
          );
          if (
            capture.action === 'select' ||
            (capture.action === 'semantic' &&
              capture.semantic?.kind === 'button')
          ) {
            this.endSelection(
              contact.controller,
              'released',
              capture.selection.target,
              snapshot
            );
          }
        }
        this.updateGrab(touchState, contact);
      } catch (error) {
        this.touches.delete(contact.controller);
        this.cancelFailedCapture(contact.controller, error);
      }
      return;
    }

    const touch = this.touches.get(contact.controller);
    if (!touch) return;
    touch.point.copy(contact.point);
    if (contact.phase === 'move') {
      try {
        this.dispatchTouch(touch, 'onObjectTouching');
        this.updateGrab(touch, contact);
      } catch (error) {
        this.touches.delete(contact.controller);
        this.cancelFailedCapture(contact.controller, error);
      }
      return;
    }

    this.touches.delete(contact.controller);
    this.suppressedUntilRelease.add(contact.controller);
    try {
      this.finishGrab(touch);
      this.dispatchTouch(touch, 'onObjectTouchEnd');
    } finally {
      if (!touch.prevented) {
        const capture = this.captures.get(contact.controller);
        if (
          contact.endReason === 'left-target' &&
          capture?.kind === 'target' &&
          capture.touch &&
          capture.action !== 'none'
        ) {
          this.endSelection(
            contact.controller,
            'released',
            touch.selection.target,
            snapshot
          );
        } else {
          this.cancelCapture(
            contact.controller,
            contact.endReason === 'source-lost'
              ? 'source-lost'
              : 'released-outside'
          );
        }
      }
    }
  }

  private finishTouch(controller: Controller): void {
    const touch = this.touches.get(controller);
    if (!touch) return;
    this.touches.delete(controller);
    this.finishGrab(touch);
    this.dispatchTouch(touch, 'onObjectTouchEnd');
  }

  private dispatchTouchStart(touch: TouchState): boolean {
    const state = {prevented: false};
    for (const script of touch.selection.scriptPath) {
      const event: ObjectTouchStartEvent = {
        ...this.createTouchEvent(touch),
        currentTarget: script,
        get defaultPrevented() {
          return state.prevented;
        },
        preventDefault() {
          state.prevented = true;
        },
      };
      if (
        this.callbacks.invokeTarget(script, 'onObjectTouchStart', event) ===
        true
      ) {
        break;
      }
    }
    return state.prevented;
  }

  private dispatchTouch(
    touch: TouchState,
    hook: 'onObjectTouching' | 'onObjectTouchEnd'
  ): void {
    dispatchInteractionPath(
      this.callbacks,
      touch.selection.scriptPath,
      hook,
      this.createTouchEvent(touch)
    );
  }

  private createTouchEvent(touch: TouchState): ObjectTouchEvent {
    return {
      source: touch.selection.publicSource,
      target: touch.selection.target,
      surface: touch.selection.surface,
      handIndex: touch.handIndex,
      hand: touch.hand,
      touchPosition: touch.point.clone(),
    };
  }

  private updateGrab(touch: TouchState, contact: DirectTouchContact): void {
    if (!contact.selected || !touch.hand) {
      this.finishGrab(touch);
      return;
    }
    const event = this.createGrabEvent(touch);
    if (!touch.grabbing) {
      touch.grabbing = true;
      dispatchInteractionPath(
        this.callbacks,
        touch.selection.scriptPath,
        'onObjectGrabStart',
        event
      );
    } else {
      dispatchInteractionPath(
        this.callbacks,
        touch.selection.scriptPath,
        'onObjectGrabbing',
        event
      );
    }
  }

  private finishGrab(touch: TouchState): void {
    if (!touch.grabbing || !touch.hand) return;
    touch.grabbing = false;
    dispatchInteractionPath(
      this.callbacks,
      touch.selection.scriptPath,
      'onObjectGrabEnd',
      this.createGrabEvent(touch)
    );
  }

  private createGrabEvent(touch: TouchState): ObjectGrabEvent {
    return {
      ...this.createTouchEvent(touch),
      hand: touch.hand!,
    };
  }

  private updateSemantic(
    capture: TargetCapture,
    snapshot: InteractionSourceState
  ): void {
    if (capture.action !== 'semantic' || capture.semantic?.kind !== 'slider') {
      return;
    }
    const projection = snapshot.ray
      ? capture.sliderProjector?.(snapshot.ray)
      : undefined;
    if (projection) {
      this.invokeSemantic(capture, () =>
        capture.semantic?.update?.({
          source: snapshot.source,
          point: projection.point,
          uv: projection.uv,
        })
      );
      return;
    }
    const resolved = this.resolvedRays.get(snapshot.controller);
    if (
      resolved?.surface === capture.selection.surface &&
      resolved.semanticControl === capture.semanticControl
    ) {
      this.invokeSemantic(capture, () =>
        capture.semantic?.update?.(semanticInput(snapshot, resolved))
      );
    }
  }

  private updateLongSelect(
    capture: TargetCapture,
    snapshot: InteractionSourceState,
    deltaSeconds: number
  ): void {
    if (
      capture.longSelectFired ||
      capture.action === 'manipulate' ||
      capture.semantic?.kind === 'slider' ||
      snapshot.sourceType === 'gaze' ||
      !capture.selection.scriptPath.some((script) =>
        this.callbacks.hasTargetHook(script, 'onObjectLongSelect')
      )
    ) {
      return;
    }
    const resolved = this.resolvedRays.get(snapshot.controller);
    const point = capture.touch
      ? this.touches.get(snapshot.controller)?.point
      : resolved?.target === capture.selection.target
        ? resolved.intersection.point
        : undefined;
    if (!point) {
      capture.longSelectDuration = 0;
      return;
    }
    const threshold = snapshot.sourceType === 'direct-touch' ? 0.015 : 0.03;
    if (point && point.distanceTo(capture.lastStablePoint) > threshold) {
      capture.longSelectDuration = 0;
      capture.lastStablePoint.copy(point);
      return;
    }
    if (Number.isFinite(deltaSeconds) && deltaSeconds > 0) {
      capture.longSelectDuration += deltaSeconds;
    }
    if (capture.longSelectDuration < this.longSelectDuration) return;

    capture.longSelectFired = true;
    const event: LongSelectEvent = {
      ...this.createSelectEvent(snapshot.controller, capture),
      duration: capture.longSelectDuration,
    };
    dispatchInteractionPath(
      this.callbacks,
      capture.selection.scriptPath,
      'onObjectLongSelect',
      event
    );
    this.callbacks.invokeGlobal('onLongSelect', event);
  }

  private setResolvedRay(
    controller: Controller,
    snapshot: InteractionSourceState,
    resolved: ResolvedRay | undefined
  ): void {
    const previous = this.resolvedRays.get(controller);
    if (resolved) this.resolvedRays.set(controller, resolved);
    else this.resolvedRays.delete(controller);
    this.updateHoverPath(controller, resolved, previous);
    this.reticle.present(snapshot, resolved);
  }

  private clearResolvedRay(controller: Controller): void {
    const previous = this.resolvedRays.get(controller);
    this.resolvedRays.delete(controller);
    this.updateHoverPath(controller, undefined, previous);
  }

  private updateHoverPath(
    controller: Controller,
    resolved: ResolvedRay | undefined,
    previous?: ResolvedRay
  ): void {
    const nextPath = resolved?.scriptPath ?? [];
    const oldPath = this.hoverPaths.get(controller) ?? [];
    if (nextPath.length > 0) this.hoverPaths.set(controller, nextPath);
    else this.hoverPaths.delete(controller);
    let oldIndex = oldPath.length - 1;
    let nextIndex = nextPath.length - 1;
    while (
      oldIndex >= 0 &&
      nextIndex >= 0 &&
      oldPath[oldIndex] === nextPath[nextIndex]
    ) {
      oldIndex--;
      nextIndex--;
    }
    const eventFor = (value: ResolvedRay | undefined): HoverEvent => ({
      source:
        this.getSourceSnapshot(controller)?.source ??
        getInteractionSource(controller, 'controller-ray'),
      target: value?.target,
      surface: value?.surface,
      intersection: value?.intersection
        ? clonePublicIntersection(value.intersection, value.surface)
        : undefined,
    });
    dispatchInteractionPath(
      this.callbacks,
      oldPath.slice(0, oldIndex + 1),
      'onHoverExit',
      eventFor(previous)
    );
    const event = eventFor(resolved);
    dispatchInteractionPath(
      this.callbacks,
      nextPath.slice(0, nextIndex + 1),
      'onHoverEnter',
      event
    );
    dispatchInteractionPath(this.callbacks, nextPath, 'onHovering', event);
  }

  private updateRaySnapshot(input: RaySourceInput): InteractionSourceState {
    return this.getSourceState(input.controller).updateRay(input);
  }

  private updateTouchSnapshot(
    contact: DirectTouchContact
  ): InteractionSourceState {
    return this.getSourceState(contact.controller).updateTouch(
      contact.point,
      contact.orientation
    );
  }

  private getSourceState(controller: Controller): InteractionSourceState {
    let snapshot = this.sourceStates.get(controller);
    if (snapshot) return snapshot;
    snapshot = new InteractionSourceState(controller);
    this.sourceStates.set(controller, snapshot);
    return snapshot;
  }

  private createSelection(
    controller: Controller,
    resolved: ResolvedRay
  ): SelectionCapture {
    const target = resolved.target!;
    return {
      source: controller,
      publicSource:
        this.getSourceSnapshot(controller)?.source ??
        getInteractionSource(controller, 'controller-ray'),
      target,
      surface: resolved.surface,
      owner: resolved.manipulation?.owner ?? target,
      point: resolved.intersection.point.clone(),
      uv: resolved.intersection.uv?.clone(),
      scriptPath: Object.freeze([...resolved.scriptPath]),
      manipulation: resolved.manipulation,
    };
  }

  private createSelectEvent(
    controller: Controller,
    capture: ActiveCapture
  ): SelectEvent {
    const targetCapture = capture.kind === 'target' ? capture : undefined;
    const resolved = this.resolvedRays.get(controller);
    const surface = targetCapture?.selection.surface ?? resolved?.surface;
    const intersection =
      resolved && surface && objectIsDescendantOf(resolved.surface, surface)
        ? clonePublicIntersection(resolved.intersection, resolved.surface)
        : undefined;
    return {
      source:
        targetCapture?.selection.publicSource ??
        this.getSourceSnapshot(controller)?.source ??
        getInteractionSource(controller, 'controller-ray'),
      target: targetCapture?.selection.target,
      surface,
      intersection,
    };
  }

  private hasDeliberateInput(frame: InteractionFrameInput): boolean {
    if (
      frame.raySources.some(
        (input) => input.sourceType !== 'gaze' && input.selected
      ) ||
      this.touches.size > 0
    ) {
      return true;
    }
    for (const capture of this.captures.values()) {
      if (
        capture.kind === 'auxiliary' ||
        (capture.kind === 'target' && capture.action === 'manipulate')
      ) {
        return true;
      }
    }
    return false;
  }

  private installCapture(controller: Controller, capture: ActiveCapture): void {
    this.captures.set(controller, capture);
    if (capture.kind === 'target' && capture.exclusiveControl) {
      this.exclusiveControls.set(capture.exclusiveControl, controller);
    }
  }

  private detachCapture(controller: Controller): ActiveCapture | undefined {
    const capture = this.captures.get(controller);
    if (!capture) return undefined;
    this.captures.delete(controller);
    if (
      capture.kind === 'target' &&
      capture.exclusiveControl &&
      this.exclusiveControls.get(capture.exclusiveControl) === controller
    ) {
      this.exclusiveControls.delete(capture.exclusiveControl);
    }
    return capture;
  }

  private runCaptureTransition(
    controller: Controller,
    transition: () => void
  ): void {
    try {
      transition();
    } catch (error) {
      this.cancelFailedCapture(controller, error);
    }
  }

  private cancelFailedCapture(controller: Controller, error: unknown): never {
    this.suppressedUntilRelease.add(controller);
    try {
      this.cancelCapture(controller, 'pointer-cancel');
    } catch {
      // Preserve the callback error which caused the rollback.
    }
    throw error;
  }

  private cancelFailedManipulations(error: unknown): never {
    for (const [controller, capture] of [...this.captures]) {
      if (
        (capture.kind === 'auxiliary' ||
          (capture.kind === 'target' && capture.action === 'manipulate')) &&
        !this.manipulation.isSourceActive(controller)
      ) {
        try {
          this.cancelCapture(controller, 'pointer-cancel');
        } catch {
          // Preserve the manipulation callback error.
        }
      }
    }
    throw error;
  }

  private runManipulationTransition<Result>(transition: () => Result): Result {
    try {
      return transition();
    } catch (error) {
      this.cancelFailedManipulations(error);
    }
  }

  private invokeSemantic(capture: TargetCapture, callback: () => void): void {
    if (!capture.semanticControl) return;
    this.callbacks.invokeSemantic(capture.semanticControl, callback);
  }
}

function semanticInput(
  snapshot: InteractionSourceState,
  resolved: ResolvedRay,
  projector?: PlanarSurfaceProjector
) {
  const projection = snapshot.ray ? projector?.(snapshot.ray) : undefined;
  return {
    source: snapshot.source,
    point: projection?.point ?? resolved.intersection.point.clone(),
    uv: projection?.uv ?? resolved.intersection.uv?.clone(),
  };
}

function clonePublicIntersection(
  intersection: THREE.Intersection,
  surface: THREE.Object3D
): THREE.Intersection {
  return {
    ...intersection,
    object: surface,
    point: intersection.point.clone(),
    normal: intersection.normal?.clone(),
    uv: intersection.uv?.clone(),
    uv1: intersection.uv1?.clone(),
  };
}

function controllerIndex(controller: Controller): number {
  const value = controller.userData.id;
  return typeof value === 'number' ? value : Number.MAX_SAFE_INTEGER;
}

function selectionBelongsTo(
  selection: SelectionCapture,
  object: THREE.Object3D
): boolean {
  return (
    objectIsDescendantOf(selection.target, object) ||
    selection.scriptPath.includes(object as Script)
  );
}
