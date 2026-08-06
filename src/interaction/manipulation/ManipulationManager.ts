import * as THREE from 'three';

import type {Script} from '../../core/Script';
import type {Controller} from '../../input/Controller';
import {
  resumeTransformScripts,
  suspendTransformScripts,
} from '../../placement/TransformScript';
import {objectIsDescendantOf} from '../../utils/SceneGraphUtils';
import {getUIElementKind, isUIElement} from '../../ui/UIElement';
import {
  InteractionSourceState,
  type InteractionSource,
  type ManipulationResolution,
  type ResolvedManipulationAction,
  type SelectionCapture,
} from '../InteractionTypes';
import {
  isHandleAction,
  isManipulationActionEnabled,
  normalizeManipulationConfig,
  type NormalizedManipulationConfig,
} from './ManipulationConfig';
import {
  clampScaleFactor,
  isPositiveFinite,
  isPositiveVector,
} from './ManipulationMath';
import {
  ManipulationAction,
  type ManipulationEvent,
  type ManipulationPhase,
} from './ManipulationTypes';
import type {PhaseBaseline, Proposal} from './drivers/DriverTypes';
import {RotateDriver} from './drivers/RotateDriver';
import {ScaleDriver} from './drivers/ScaleDriver';
import {TranslateDriver} from './drivers/TranslateDriver';

export type DispatchManipulationEvent = (
  script: Script,
  event: ManipulationEvent
) => boolean | void;

interface PrimaryRole {
  capture: SelectionCapture;
  snapshot: InteractionSourceState;
}

interface Session {
  owner: THREE.Object3D;
  ownerParent: THREE.Object3D | null;
  config: NormalizedManipulationConfig;
  primary: PrimaryRole;
  primaryAction?: ResolvedManipulationAction;
  auxiliary?: InteractionSourceState;
  phase?: ActivePhase;
  cardEdge?: true;
}

interface ActivePhase {
  action: ResolvedManipulationAction;
  baseline: PhaseBaseline;
  defaultPrevented: boolean;
  lastProposal?: Proposal;
}

/**
 * Private runtime used by Interaction. It does not observe input or raycast.
 * It is exported only so the sibling Interaction module can construct it.
 */
export class ManipulationManager {
  private readonly sessions = new Map<THREE.Object3D, Session>();
  private readonly roles = new Map<Controller, Session>();
  private readonly translateDriver: TranslateDriver;
  private readonly rotateDriver = new RotateDriver();
  private readonly scaleDriver = new ScaleDriver();

  constructor(
    private readonly dispatch: DispatchManipulationEvent,
    private readonly suppressSource: (source: Controller) => void,
    camera?: THREE.Camera,
    timer?: THREE.Timer
  ) {
    this.translateDriver = new TranslateDriver(camera, timer);
  }

  resolve(path: readonly THREE.Object3D[]): ManipulationResolution | undefined {
    let childHandle:
      | ResolvedManipulationAction
      | typeof ManipulationAction.None
      | undefined;
    let hasChildHandle = false;
    let handle: THREE.Object3D | undefined;

    for (const current of path) {
      if (isUIElement(current) && getUIElementKind(current) === 'overlay') {
        return undefined;
      }
      const options = current.xb;
      if (!hasChildHandle && options?.manipulationHandle !== undefined) {
        hasChildHandle = true;
        handle = current;
        const action =
          options.manipulationHandle === 'none'
            ? ManipulationAction.None
            : options.manipulationHandle.action;
        if (action !== undefined && !isHandleAction(action)) return undefined;
        childHandle = action;
      }

      if (options?.manipulation !== undefined) {
        if (
          options.manipulation === false ||
          options.manipulationHandle !== undefined
        ) {
          return undefined;
        }
        const config = normalizeManipulationConfig(options.manipulation);
        if (!config) return undefined;

        const edge = getCardEdge(current);
        if (edge && !hasChildHandle && !edge.translateFromSurface) {
          return undefined;
        }

        const requested = hasChildHandle ? childHandle : config.handle;
        if (requested === ManipulationAction.None) return undefined;
        if (requested !== undefined) {
          return isManipulationActionEnabled(config, requested)
            ? {owner: current, action: requested, handle}
            : undefined;
        }

        const primaryActions = [
          config.translate && ManipulationAction.Translate,
          config.rotate && ManipulationAction.Rotate,
        ].filter(Boolean) as ResolvedManipulationAction[];
        if (primaryActions.length === 1) {
          return {owner: current, action: primaryActions[0], handle};
        }
        if (primaryActions.length === 0 && config.scale) {
          return {owner: current, handle};
        }
        return undefined;
      }
    }
    return undefined;
  }

  /** Starts a primary session after Interaction has dispatched Select start. */
  tryStart(
    capture: SelectionCapture,
    snapshot: InteractionSourceState
  ): boolean {
    if (
      snapshot.sourceType === 'gaze' ||
      capture.source !== snapshot.controller ||
      this.roles.has(snapshot.controller)
    ) {
      return false;
    }

    const resolution = capture.manipulation;
    if (!resolution || this.sessions.has(resolution.owner)) return false;
    const config = normalizeManipulationConfig(
      resolution.owner.xb?.manipulation
    );
    if (!config) return false;

    const session: Session = {
      owner: resolution.owner,
      ownerParent: resolution.owner.parent,
      config,
      primary: {
        capture,
        snapshot: new InteractionSourceState(snapshot.controller).copyFrom(
          snapshot
        ),
      },
      primaryAction:
        resolution.action === ManipulationAction.Scale
          ? undefined
          : resolution.action,
    };
    const edge = getCardEdge(session.owner);
    if (edge && resolution.handle) {
      session.cardEdge = true;
    }
    const baseline = session.primaryAction
      ? this.captureBaseline(session, session.primaryAction)
      : undefined;
    if (session.primaryAction && !baseline) return false;

    this.sessions.set(session.owner, session);
    suspendTransformScripts(session.owner);
    this.roles.set(snapshot.controller, session);
    try {
      if (
        session.primaryAction &&
        baseline &&
        !this.beginPhase(session, session.primaryAction, baseline)
      ) {
        this.removeSession(session, false);
        return false;
      }
      return true;
    } catch (error) {
      this.removeSession(session, false);
      throw error;
    }
  }

  /** Claims a free spatial Select for Scale before normal target resolution. */
  tryClaimScale(snapshot: InteractionSourceState): boolean {
    if (snapshot.sourceType === 'gaze' || this.roles.has(snapshot.controller)) {
      return false;
    }
    let eligible: Session | undefined;
    for (const session of this.sessions.values()) {
      if (!session.config.scale || session.auxiliary) continue;
      if (eligible) return false;
      eligible = session;
    }
    if (!eligible) return false;

    const session = eligible;
    const auxiliary = new InteractionSourceState(snapshot.controller).copyFrom(
      snapshot
    );
    const baseline = this.captureBaseline(
      session,
      ManipulationAction.Scale,
      auxiliary
    );
    if (baseline?.action !== ManipulationAction.Scale) return false;

    try {
      if (session.phase) this.finishPhase(session, 'end');
      session.auxiliary = auxiliary;
      this.roles.set(snapshot.controller, session);
      if (!this.beginPhase(session, ManipulationAction.Scale, baseline)) {
        this.removeSession(session, true);
        return false;
      }
      return true;
    } catch (error) {
      this.removeSession(session, true);
      throw error;
    }
  }

  /** Runs a one-shot Scale phase for simulator and equivalent private intents. */
  applyScaleIntent(
    capture: SelectionCapture,
    snapshot: InteractionSourceState,
    requestedFactor: number
  ): boolean {
    if (
      snapshot.sourceType === 'gaze' ||
      capture.source !== snapshot.controller ||
      this.roles.has(snapshot.controller) ||
      !isPositiveFinite(requestedFactor)
    ) {
      return false;
    }
    const resolution = capture.manipulation;
    if (!resolution || this.sessions.has(resolution.owner)) return false;
    const config = normalizeManipulationConfig(
      resolution.owner.xb?.manipulation
    );
    if (!config?.scale || !isPositiveVector(resolution.owner.scale)) {
      return false;
    }
    const factor = clampScaleFactor(
      requestedFactor,
      resolution.owner.scale,
      config.scale
    );
    if (!isPositiveFinite(factor)) return false;

    const scale = resolution.owner.scale.clone().multiplyScalar(factor);
    if (!isPositiveVector(scale)) return false;
    const session: Session = {
      owner: resolution.owner,
      ownerParent: resolution.owner.parent,
      config,
      primary: {
        capture,
        snapshot: new InteractionSourceState(snapshot.controller).copyFrom(
          snapshot
        ),
      },
      primaryAction: resolution.action,
      phase: {
        action: ManipulationAction.Scale,
        baseline: {
          action: ManipulationAction.Scale,
          scale: resolution.owner.scale.clone(),
          distance: 1,
          options: {...config.scale},
        },
        defaultPrevented: false,
      },
    };
    const proposal: Proposal = {
      action: ManipulationAction.Scale,
      factor,
      center: resolution.owner.getWorldPosition(new THREE.Vector3()),
      scale,
      apply: () => resolution.owner.scale.copy(scale),
    };
    const phase = session.phase!;
    this.dispatchPhase(session, phase, 'start', proposal);
    if (!phase.defaultPrevented) proposal.apply();
    this.dispatchPhase(session, phase, 'update', proposal);
    session.phase = undefined;
    this.dispatchPhase(session, phase, 'end', proposal);
    return true;
  }

  /** Updates active sessions from Interaction's current frame snapshots. */
  update(snapshots: Iterable<InteractionSourceState>): void {
    for (const snapshot of snapshots) {
      const session = this.roles.get(snapshot.controller);
      if (!session) continue;
      if (session.primary.snapshot.controller === snapshot.controller) {
        session.primary.snapshot.copyFrom(snapshot);
      } else if (session.auxiliary?.controller === snapshot.controller) {
        session.auxiliary.copyFrom(snapshot);
      }
    }

    for (const session of this.sessions.values()) {
      if (!this.validate(session)) continue;
      this.updateSession(session);
    }
  }

  /** Ends the role held by a source. Returns true when the source was claimed. */
  end(source: Controller, finalSnapshot?: InteractionSourceState): boolean {
    const session = this.roles.get(source);
    if (!session) return false;
    if (finalSnapshot) {
      if (session.primary.snapshot.controller === source) {
        session.primary.snapshot.copyFrom(finalSnapshot);
      } else if (session.auxiliary?.controller === source) {
        session.auxiliary.copyFrom(finalSnapshot);
      }
      this.updateSession(session);
    }

    if (session.primary.snapshot.controller === source) {
      this.finishSession(session, 'end', true);
      return true;
    }

    if (session.auxiliary?.controller === source) {
      this.finishAuxiliary(session, source, 'end');
      return true;
    }
    return false;
  }

  cancelSource(source: Controller): boolean {
    const session = this.roles.get(source);
    if (!session) return false;
    if (session.primary.snapshot.controller === source) {
      this.finishSession(session, 'cancel', true);
      return true;
    }
    if (session.auxiliary?.controller === source) {
      this.finishAuxiliary(session, source, 'cancel');
      return true;
    }
    return false;
  }

  cancelOwner(owner: THREE.Object3D): boolean {
    const session = this.sessions.get(owner);
    if (!session) return false;
    this.finishSession(session, 'cancel', true);
    return true;
  }

  isManipulating(object?: THREE.Object3D): boolean {
    return object ? this.sessions.has(object) : this.sessions.size > 0;
  }

  isSourceActive(source: Controller): boolean {
    return this.roles.has(source);
  }

  private validate(session: Session): boolean {
    const current = normalizeManipulationConfig(session.owner.xb?.manipulation);
    const edge = getCardEdge(session.owner);
    if (
      !current ||
      !session.owner.visible ||
      session.owner.parent !== session.ownerParent ||
      !objectIsDescendantOf(session.primary.capture.surface, session.owner) ||
      (session.cardEdge && !edge)
    ) {
      this.cancelOwner(session.owner);
      return false;
    }

    if (session.phase?.action === ManipulationAction.Scale && !current.scale) {
      const auxiliary = session.auxiliary;
      session.config = current;
      if (auxiliary) {
        this.finishAuxiliary(session, auxiliary.controller, 'cancel');
      } else {
        this.finishPhase(session, 'cancel');
      }
      return false;
    }
    if (
      session.primaryAction &&
      !isManipulationActionEnabled(current, session.primaryAction)
    ) {
      this.cancelOwner(session.owner);
      return false;
    }
    session.config = current;
    return true;
  }

  private removeSession(session: Session, suppressAuxiliary: boolean): void {
    session.phase = undefined;
    if (this.sessions.get(session.owner) === session) {
      this.sessions.delete(session.owner);
      resumeTransformScripts(session.owner);
    }
    if (this.roles.get(session.primary.snapshot.controller) === session) {
      this.roles.delete(session.primary.snapshot.controller);
    }
    if (session.auxiliary) {
      if (this.roles.get(session.auxiliary.controller) === session) {
        this.roles.delete(session.auxiliary.controller);
      }
      if (suppressAuxiliary && session.auxiliary.selected) {
        this.suppressSource(session.auxiliary.controller);
      }
    }
  }

  private startPhase(
    session: Session,
    action: ResolvedManipulationAction
  ): boolean {
    const baseline = this.captureBaseline(session, action);
    return baseline ? this.beginPhase(session, action, baseline) : false;
  }

  private beginPhase(
    session: Session,
    action: ResolvedManipulationAction,
    baseline: PhaseBaseline
  ): boolean {
    session.phase = {action, baseline, defaultPrevented: false};
    const phase = session.phase;
    const proposal = this.propose(session);
    if (!proposal) {
      session.phase = undefined;
      return false;
    }
    phase.lastProposal = proposal;
    try {
      this.dispatchPhase(session, phase, 'start', proposal);
    } catch (error) {
      if (session.phase === phase) session.phase = undefined;
      throw error;
    }
    return true;
  }

  private finishPhase(session: Session, phase: 'end' | 'cancel'): void {
    const active = session.phase;
    if (!active) return;
    const proposal = this.propose(session) ?? active.lastProposal;
    session.phase = undefined;
    this.dispatchPhase(session, active, phase, proposal);
  }

  private updateSession(session: Session): void {
    if (!session.phase) return;
    const proposal = this.propose(session);
    if (!proposal) return;
    session.phase.lastProposal = proposal;
    if (!session.phase.defaultPrevented) proposal.apply();
    try {
      this.dispatchPhase(session, session.phase, 'update', proposal);
    } catch (error) {
      this.removeSession(session, true);
      throw error;
    }
  }

  private finishSession(
    session: Session,
    phase: 'end' | 'cancel',
    suppressAuxiliary: boolean
  ): void {
    const active = session.phase;
    const proposal = active
      ? (this.propose(session) ?? active.lastProposal)
      : undefined;
    this.removeSession(session, suppressAuxiliary);
    if (active) this.dispatchPhase(session, active, phase, proposal);
  }

  private finishAuxiliary(
    session: Session,
    source: Controller,
    phase: 'end' | 'cancel'
  ): void {
    let phaseFinished = false;
    try {
      this.finishPhase(session, phase);
      phaseFinished = true;
    } finally {
      this.releaseAuxiliaryRole(session, source);
      if (!phaseFinished) this.removeSession(session, true);
    }
    if (!session.primaryAction) return;
    try {
      if (this.startPhase(session, session.primaryAction)) return;
    } catch (error) {
      this.removeSession(session, true);
      throw error;
    }
    this.removeSession(session, true);
  }

  private releaseAuxiliaryRole(session: Session, source: Controller): void {
    if (this.roles.get(source) === session) this.roles.delete(source);
    if (session.auxiliary?.controller === source) session.auxiliary = undefined;
  }

  private captureBaseline(
    session: Session,
    action: ResolvedManipulationAction,
    auxiliary = session.auxiliary
  ): PhaseBaseline | undefined {
    session.owner.updateWorldMatrix(true, false);
    if (action === ManipulationAction.Translate) {
      return this.translateDriver.capture(session);
    }
    if (action === ManipulationAction.Rotate) {
      return this.rotateDriver.capture(session);
    }
    return this.scaleDriver.capture(session, auxiliary);
  }

  private propose(session: Session): Proposal | undefined {
    const baseline = session.phase?.baseline;
    if (!baseline) return undefined;
    if (baseline.action === ManipulationAction.Translate) {
      return this.translateDriver.propose(session, baseline);
    }
    if (baseline.action === ManipulationAction.Rotate) {
      return this.rotateDriver.propose(session, baseline);
    }
    return this.scaleDriver.propose(session, baseline);
  }

  private dispatchPhase(
    session: Session,
    active: ActivePhase,
    phase: ManipulationPhase,
    proposal: Proposal | undefined
  ): void {
    if (!proposal) return;
    const preventState = {value: active.defaultPrevented};
    for (const script of session.primary.capture.scriptPath) {
      const event = createEvent(session, script, phase, proposal, preventState);
      if (this.dispatch(script, event) === true) break;
    }
    if (phase === 'start') active.defaultPrevented = preventState.value;
  }
}

function getCardEdge(
  owner: THREE.Object3D
): {readonly translateFromSurface?: boolean} | undefined {
  const candidate = owner as THREE.Object3D & {
    readonly edge?: false | {readonly translateFromSurface?: boolean};
  };
  if (
    !isUIElement(owner) ||
    getUIElementKind(owner) !== 'card' ||
    !candidate.edge
  ) {
    return undefined;
  }
  return candidate.edge;
}

function createEvent(
  session: Session,
  currentTarget: Script,
  phase: ManipulationPhase,
  proposal: Proposal,
  preventState: {value: boolean}
): ManipulationEvent {
  const common = {
    phase,
    action: proposal.action,
    source: session.primary.snapshot.source,
    sources: Object.freeze(
      [session.primary.snapshot.source, session.auxiliary?.source].filter(
        Boolean
      ) as InteractionSource[]
    ),
    target: session.primary.capture.target,
    surface: session.primary.capture.surface,
    owner: session.owner,
    currentTarget,
    defaultPrevented: preventState.value,
    preventDefault() {
      if (phase === 'start') preventState.value = true;
    },
  };

  if (proposal.action === ManipulationAction.Translate) {
    return withDefaultPrevented(
      {
        ...common,
        action: proposal.action,
        point: proposal.point.clone(),
        delta: proposal.delta.clone(),
        position: proposal.position.clone(),
        worldPosition: proposal.worldPosition.clone(),
      },
      preventState
    );
  }
  if (proposal.action === ManipulationAction.Rotate) {
    return withDefaultPrevented(
      {
        ...common,
        action: proposal.action,
        angle: proposal.angle,
        quaternion: proposal.quaternion.clone(),
      },
      preventState
    );
  }
  return withDefaultPrevented(
    {
      ...common,
      action: proposal.action,
      factor: proposal.factor,
      center: proposal.center.clone(),
      scale: proposal.scale.clone(),
    },
    preventState
  );
}

function withDefaultPrevented<T extends ManipulationEvent>(
  event: T,
  state: {value: boolean}
): T {
  Object.defineProperty(event, 'defaultPrevented', {
    enumerable: true,
    get: () => state.value,
  });
  return event;
}
