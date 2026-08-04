import * as THREE from 'three';

import type {Controller, ControllerEvent} from '../../input/Controller';
import type {
  GlobalInteractionHook,
  GlobalInteractionEvent,
  InteractionCallbackDispatch,
  InteractionSourceType,
  TargetedInteractionHook,
} from '../../interaction/InteractionTypes';
import {getInteractionSource} from '../../interaction/InteractionTypes';
import type {ManipulationEvent} from '../../interaction/manipulation/ManipulationTypes';
import {getSemanticControl} from '../../interaction/SemanticControl';
import {
  KeyEvent,
  type HoverEvent,
  type LongSelectEvent,
  type ObjectGrabEvent,
  type ObjectTouchEvent,
  type ObjectTouchStartEvent,
  Script,
  SelectEvent,
  type SelectEndEvent,
} from '../Script';
import {isDefaultScriptMethod} from '../ScriptHooks';

type MaybeScript = THREE.Object3D & {isXRScript?: boolean};

export enum ScriptsManagerEventType {
  EXCEPTION = 'exception',
}

export type ScriptsManagerEventMap = THREE.Object3DEventMap & {
  [ScriptsManagerEventType.EXCEPTION]: {
    scriptName: string;
    context: string;
    error: Error;
    timestamp: number;
  };
};

type GlobalScriptHook =
  | 'update'
  | 'physicsStep'
  | 'onSelectStart'
  | 'onSelectEnd'
  | 'onSelect'
  | 'onSelecting'
  | 'onLongSelect'
  | 'onSqueezeStart'
  | 'onSqueezeEnd'
  | 'onSqueeze'
  | 'onSqueezing'
  | 'onKeyDown'
  | 'onKeyUp'
  | 'onXRSessionStarted'
  | 'onXRSessionEnded'
  | 'onSimulatorStarted';

type IndexedScriptHook =
  | TargetedInteractionHook
  | GlobalScriptHook
  | 'onObjectManipulate';

interface PendingInitialization {
  readonly script: Script;
  promise: Promise<void>;
  connection: 'connected' | 'disconnected' | 'reconnected';
}

type TargetDispatch = {
  [Hook in TargetedInteractionHook]: (
    script: Script,
    argument: unknown
  ) => boolean | void;
};

const TARGET_DISPATCH: TargetDispatch = {
  onObjectSelectStart: (script, argument) =>
    script.onObjectSelectStart(argument as SelectEvent),
  onObjectSelectEnd: (script, argument) =>
    script.onObjectSelectEnd(argument as SelectEndEvent),
  onObjectLongSelect: (script, argument) =>
    script.onObjectLongSelect(argument as LongSelectEvent),
  onObjectTouchStart: (script, argument) =>
    script.onObjectTouchStart(argument as ObjectTouchStartEvent),
  onObjectTouching: (script, argument) =>
    script.onObjectTouching(argument as ObjectTouchEvent),
  onObjectTouchEnd: (script, argument) =>
    script.onObjectTouchEnd(argument as ObjectTouchEvent),
  onObjectGrabStart: (script, argument) =>
    script.onObjectGrabStart(argument as ObjectGrabEvent),
  onObjectGrabbing: (script, argument) =>
    script.onObjectGrabbing(argument as ObjectGrabEvent),
  onObjectGrabEnd: (script, argument) =>
    script.onObjectGrabEnd(argument as ObjectGrabEvent),
  onHoverEnter: (script, argument) =>
    script.onHoverEnter(argument as HoverEvent),
  onHovering: (script, argument) => script.onHovering(argument as HoverEvent),
  onHoverExit: (script, argument) => script.onHoverExit(argument as HoverEvent),
};

const TARGETED_HOOKS = Object.freeze(
  Object.keys(TARGET_DISPATCH) as TargetedInteractionHook[]
);

const GLOBAL_HOOKS = Object.freeze([
  'update',
  'physicsStep',
  'onSelectStart',
  'onSelectEnd',
  'onSelect',
  'onSelecting',
  'onLongSelect',
  'onSqueezeStart',
  'onSqueezeEnd',
  'onSqueeze',
  'onSqueezing',
  'onKeyDown',
  'onKeyUp',
  'onXRSessionStarted',
  'onXRSessionEnded',
  'onSimulatorStarted',
] as const satisfies readonly GlobalScriptHook[]);

const INDEXED_HOOKS = Object.freeze([
  ...TARGETED_HOOKS,
  ...GLOBAL_HOOKS,
  'onObjectManipulate',
] as const satisfies readonly IndexedScriptHook[]);

const RAY_TARGET_HOOKS = Object.freeze([
  'onObjectSelectStart',
  'onObjectSelectEnd',
  'onObjectLongSelect',
  'onHoverEnter',
  'onHovering',
  'onHoverExit',
] as const satisfies readonly TargetedInteractionHook[]);

const DIRECT_TOUCH_TARGET_HOOKS = Object.freeze([
  'onObjectSelectStart',
  'onObjectSelectEnd',
  'onObjectLongSelect',
  'onObjectTouchStart',
  'onObjectTouching',
  'onObjectTouchEnd',
  'onObjectGrabStart',
  'onObjectGrabbing',
  'onObjectGrabEnd',
] as const satisfies readonly TargetedInteractionHook[]);

const SCRIPT_READY = Promise.resolve();
const NO_SCRIPT_CHANGES = Promise.resolve<PromiseSettledResult<void>[]>([]);

export class ScriptsManager
  extends THREE.EventDispatcher<ScriptsManagerEventMap>
  implements InteractionCallbackDispatch
{
  private readonly activeScripts = new Set<Script>();
  private readonly hookScripts = new Map<IndexedScriptHook, Set<Script>>();
  private readonly pendingInitializations = new Map<
    Script,
    PendingInitialization
  >();
  private readonly seenScripts = new Set<Script>();
  private readonly interactionCandidates = new Set<THREE.Object3D>();
  private readonly failedScripts = new Set<Script>();
  private readonly syncPromises: Promise<void>[] = [];
  private readonly traversalStack: THREE.Object3D[] = [];
  private disposed = false;
  private disposalPromise?: Promise<void>;

  /** Whether to catch all exceptions thrown by developer scripts. */
  catchExceptions = true;
  beforeDispose?: (script: Script) => void;
  afterDispose?: (script: Script) => void;

  constructor(
    private readonly initScriptFunction: (script: Script) => Promise<void>
  ) {
    super();
  }

  /** Objects found during the lifecycle traversal that direct touch can use. */
  get directTouchCandidates(): ReadonlySet<THREE.Object3D> {
    return this.interactionCandidates;
  }

  isScript = (object: THREE.Object3D): boolean =>
    (object as MaybeScript).isXRScript === true;

  hasTargetHandler = (
    object: THREE.Object3D,
    sourceType: InteractionSourceType
  ): boolean => {
    if (!this.isScript(object)) return false;

    const script = object as Script;
    const hooks =
      sourceType === 'direct-touch'
        ? DIRECT_TOUCH_TARGET_HOOKS
        : RAY_TARGET_HOOKS;
    return (
      hooks.some((hook) => this.hasIndexedHook(script, hook)) ||
      this.hasIndexedHook(script, 'onObjectManipulate')
    );
  };

  hasTargetHook = (
    object: THREE.Object3D,
    hook: TargetedInteractionHook
  ): boolean =>
    this.isScript(object) && this.hasIndexedHook(object as Script, hook);

  invokeTarget = (
    object: THREE.Object3D,
    hook: TargetedInteractionHook,
    argument: unknown
  ): boolean => {
    if (!this.isScript(object)) return false;
    const script = object as Script;
    if (!this.hasOverriddenHook(script, hook)) return false;
    return this.callTargeted([script], hook, (target) =>
      TARGET_DISPATCH[hook](target, eventForTarget(argument, target))
    );
  };

  invokeGlobal = <Hook extends GlobalInteractionHook>(
    hook: Hook,
    event: GlobalInteractionEvent<Hook>
  ): void => {
    if (hook === 'onSelectStart') this.callSelectStart(event);
    else if (hook === 'onSelecting') this.callSelecting(event);
    else if (hook === 'onSelect') this.callSelect(event);
    else if (hook === 'onLongSelect')
      this.callLongSelect(event as LongSelectEvent);
    else this.callSelectEnd(event as SelectEndEvent);
  };

  invokeManipulation = (
    object: THREE.Object3D,
    event: ManipulationEvent
  ): boolean => {
    if (!this.isScript(object)) return false;
    const script = object as Script;
    if (!this.hasOverriddenHook(script, 'onObjectManipulate')) return false;
    return this.callTargeted([script], 'onObjectManipulate', (target) =>
      target.onObjectManipulate(event)
    );
  };

  invokeSemantic = (object: THREE.Object3D, callback: () => void): void => {
    this.callTargeted(
      [object as Script],
      'semantic control callback',
      callback
    );
  };

  private handleException(error: Error, script: Script, context: string) {
    console.error(
      `An error occurred in script ${
        script.name || script.constructor.name
      } [${context}]:`,
      error
    );

    this.dispatchEvent({
      type: ScriptsManagerEventType.EXCEPTION,
      scriptName: script.name || script.constructor.name,
      context,
      error,
      timestamp: performance.now(),
    });
  }

  private handleScriptError(
    error: unknown,
    script: Script,
    context: string
  ): void {
    const normalizedError =
      error instanceof Error ? error : new Error(String(error));
    if (!this.catchExceptions) throw normalizedError;
    this.handleException(normalizedError, script, context);
  }

  /** Reports an asynchronous subsystem error against its owning Script. */
  reportError(error: unknown, script: Script, context: string): void {
    this.handleScriptError(error, script, context);
  }

  /**
   * Calls one targeted hook along a captured Script path. Only a literal true
   * return value stops propagation. Developer errors use the same exception
   * policy as global Script callbacks.
   */
  callTargeted(
    path: Iterable<Script>,
    context: string,
    callback: (script: Script) => boolean | void
  ): boolean {
    for (const script of path) {
      try {
        if (callback(script) === true) return true;
      } catch (error: unknown) {
        this.handleScriptError(error, script, context);
      }
    }
    return false;
  }

  /**
   * Initializes a script and adds it to the set of scripts which will receive
   * callbacks. Concurrent calls share one initialization.
   * @param script - The script to initialize
   * @returns A promise which resolves when the script is initialized.
   */
  initScript(script: Script): Promise<void> {
    if (this.disposed) {
      return Promise.reject(new Error('ScriptsManager has been disposed.'));
    }
    if (this.activeScripts.has(script)) return SCRIPT_READY;
    if (this.failedScripts.has(script)) return SCRIPT_READY;

    const pending = this.pendingInitializations.get(script);
    if (pending) {
      if (pending.connection === 'disconnected') {
        pending.connection = 'reconnected';
      }
      return pending.promise;
    }

    const entry: PendingInitialization = {
      script,
      promise: SCRIPT_READY,
      connection: 'connected',
    };
    entry.promise = SCRIPT_READY.then(() => this.finishInitialization(entry));
    this.pendingInitializations.set(script, entry);
    return entry.promise;
  }

  private async finishInitialization(
    entry: PendingInitialization
  ): Promise<void> {
    let failed = false;
    let initializationError: unknown;
    try {
      try {
        await this.initScriptFunction(entry.script);
      } catch (error: unknown) {
        failed = true;
        initializationError = error;
        if (entry.connection === 'connected') {
          this.failedScripts.add(entry.script);
        }
      }

      if (entry.connection !== 'connected') {
        this.disposeScript(entry.script);
      } else if (!failed) {
        this.activeScripts.add(entry.script);
        this.failedScripts.delete(entry.script);
        this.indexScript(entry.script);
      }
    } finally {
      if (this.pendingInitializations.get(entry.script) === entry) {
        this.pendingInitializations.delete(entry.script);
      }
    }

    if (entry.connection === 'reconnected') {
      await this.initScript(entry.script);
      return;
    }
    if (initializationError !== undefined) {
      throw initializationError instanceof Error
        ? initializationError
        : new Error(String(initializationError));
    }
  }

  /**
   * Uninitializes a script calling dispose and removes it from the set of
   * scripts which will receive callbacks. A pending initialization is disposed
   * after it finishes and is never activated.
   * @param script - The script to uninitialize.
   */
  uninitScript(script: Script): void {
    const pending = this.pendingInitializations.get(script);
    if (pending) {
      pending.connection = 'disconnected';
      return;
    }
    if (!this.activeScripts.delete(script)) return;
    this.unindexScript(script);
    this.disposeScript(script);
  }

  /** Disposes every Script generation and prevents further initialization. */
  dispose(): Promise<void> {
    if (this.disposalPromise) return this.disposalPromise;

    this.disposed = true;
    for (const pending of this.pendingInitializations.values()) {
      pending.connection = 'disconnected';
    }

    const scripts = new Set([...this.activeScripts, ...this.failedScripts]);
    const pending = [...this.pendingInitializations.values()].map(
      (entry) => entry.promise
    );
    this.activeScripts.clear();
    this.failedScripts.clear();
    this.hookScripts.clear();
    this.seenScripts.clear();
    this.interactionCandidates.clear();
    this.syncPromises.length = 0;

    this.disposalPromise = Promise.resolve().then(() =>
      this.finishDisposal(scripts, pending)
    );
    return this.disposalPromise;
  }

  private async finishDisposal(
    scripts: ReadonlySet<Script>,
    pending: readonly Promise<void>[]
  ): Promise<void> {
    let firstError: unknown;
    for (const script of scripts) {
      try {
        this.disposeScript(script);
      } catch (error: unknown) {
        firstError ??= error;
      }
    }

    const pendingResults = await Promise.allSettled(pending);
    for (const result of pendingResults) {
      if (result.status === 'rejected') firstError ??= result.reason;
    }
    this.pendingInitializations.clear();

    if (firstError !== undefined) throw firstError;
  }

  private disposeScript(script: Script): void {
    let firstError: Error | undefined;
    const run = (context: string, callback: () => void): void => {
      try {
        callback();
      } catch (error: unknown) {
        const normalizedError =
          error instanceof Error ? error : new Error(String(error));
        if (this.catchExceptions) {
          this.handleException(normalizedError, script, context);
        } else {
          firstError ??= normalizedError;
        }
      }
    };

    run('beforeDispose', () => this.beforeDispose?.(script));
    run('dispose', () => script.dispose());
    run('afterDispose', () => this.afterDispose?.(script));

    if (firstError) throw firstError;
  }

  /** Helper for scene traversal to avoid closure allocation. */
  private checkScript = (object: THREE.Object3D): void => {
    if (
      object.xb?.manipulation ||
      getSemanticControl(object) ||
      this.hasTargetHandler(object, 'direct-touch')
    ) {
      this.interactionCandidates.add(object);
    }
    if ((object as MaybeScript).isXRScript) {
      const script = object as Script;
      this.seenScripts.add(script);
      if (!this.activeScripts.has(script) && !this.failedScripts.has(script)) {
        this.syncPromises.push(this.initScript(script));
      }
    }
  };

  private scanScene(scene: THREE.Scene): void {
    const stack = this.traversalStack;
    stack.length = 0;
    stack.push(scene);
    while (stack.length > 0) {
      const object = stack.pop()!;
      if (object.userData.xrblocksPrivate === true) continue;
      this.checkScript(object);
      for (let index = object.children.length - 1; index >= 0; index--) {
        stack.push(object.children[index]);
      }
    }
  }

  /**
   * Finds all scripts in the scene and initializes them or uninitializes them.
   * Returns a promise which resolves when all new scripts finish initializing.
   * @param scene - The main scene which is used to find scripts.
   */
  syncScriptsWithScene(
    scene: THREE.Scene
  ): Promise<PromiseSettledResult<void>[]> {
    if (this.disposed) {
      return Promise.reject(new Error('ScriptsManager has been disposed.'));
    }
    this.seenScripts.clear();
    this.interactionCandidates.clear();
    this.syncPromises.length = 0;
    this.scanScene(scene);

    for (const script of this.activeScripts) {
      if (!this.seenScripts.has(script)) this.uninitScript(script);
    }
    for (const script of this.pendingInitializations.keys()) {
      if (this.seenScripts.has(script)) continue;
      const pending = this.pendingInitializations.get(script);
      if (pending) this.syncPromises.push(pending.promise);
      this.uninitScript(script);
    }
    for (const script of [...this.failedScripts]) {
      if (!this.seenScripts.has(script)) {
        this.failedScripts.delete(script);
        this.disposeScript(script);
      }
    }

    return this.syncPromises.length === 0
      ? NO_SCRIPT_CHANGES
      : Promise.allSettled(this.syncPromises);
  }

  callSelecting = (event: SelectEvent): void => {
    this.callHook('onSelecting', (script) => script.onSelecting(event));
  };

  callSqueezing = (controller: Controller): void => {
    const event = controllerSelectEvent(controller);
    this.callHook('onSqueezing', (script) => script.onSqueezing(event));
  };

  update = (time: number, frame: XRFrame): void => {
    this.callHook('update', (script) => script.update(time, frame));
  };

  physicsStep = (): void => {
    this.callHook('physicsStep', (script) => script.physicsStep());
  };

  callSelectStart = (event: SelectEvent): void => {
    this.callHook('onSelectStart', (script) => script.onSelectStart(event));
  };

  callSelectEnd = (event: SelectEndEvent): void => {
    this.callHook('onSelectEnd', (script) => script.onSelectEnd(event));
  };

  callSelect = (event: SelectEvent): void => {
    this.callHook('onSelect', (script) => script.onSelect(event));
  };

  callLongSelect = (event: LongSelectEvent): void => {
    this.callHook('onLongSelect', (script) => script.onLongSelect(event));
  };

  callSqueezeStart = (raw: ControllerEvent): void => {
    const event = controllerSelectEvent(raw.target);
    this.callHook('onSqueezeStart', (script) => script.onSqueezeStart(event));
  };

  callSqueezeEnd = (raw: ControllerEvent): void => {
    const event = controllerSelectEvent(raw.target);
    this.callHook('onSqueezeEnd', (script) => script.onSqueezeEnd(event));
  };

  callSqueeze = (raw: ControllerEvent): void => {
    const event = controllerSelectEvent(raw.target);
    this.callHook('onSqueeze', (script) => script.onSqueeze(event));
  };

  callKeyDown = (event: KeyEvent): void => {
    this.callHook('onKeyDown', (script) => script.onKeyDown(event));
  };

  callKeyUp = (event: KeyEvent): void => {
    this.callHook('onKeyUp', (script) => script.onKeyUp(event));
  };

  onXRSessionStarted = (session: XRSession): void => {
    this.callHook('onXRSessionStarted', (script) =>
      script.onXRSessionStarted(session)
    );
  };

  onXRSessionEnded = (): void => {
    this.callHook('onXRSessionEnded', (script) => script.onXRSessionEnded());
  };

  onSimulatorStarted = (): void => {
    this.callHook('onSimulatorStarted', (script) =>
      script.onSimulatorStarted()
    );
  };

  private callHook(
    hook: GlobalScriptHook,
    callback: (script: Script) => void
  ): void {
    const scripts = this.hookScripts.get(hook);
    if (scripts) this.callTargeted(scripts, hook, callback);
  }

  private hasOverriddenHook(script: Script, hook: IndexedScriptHook): boolean {
    return !isDefaultScriptMethod(Reflect.get(script, hook));
  }

  private hasIndexedHook(script: Script, hook: IndexedScriptHook): boolean {
    return this.hookScripts.get(hook)?.has(script) ?? false;
  }

  private getHookSet(hook: IndexedScriptHook): Set<Script> {
    let scripts = this.hookScripts.get(hook);
    if (!scripts) {
      scripts = new Set<Script>();
      this.hookScripts.set(hook, scripts);
    }
    return scripts;
  }

  private indexScript(script: Script): void {
    for (const hook of INDEXED_HOOKS) {
      if (this.hasOverriddenHook(script, hook)) {
        this.getHookSet(hook).add(script);
      }
    }
  }

  private unindexScript(script: Script): void {
    for (const scripts of this.hookScripts.values()) scripts.delete(script);
  }
}

function controllerSelectEvent(controller: Controller): SelectEvent {
  const type = controller.inputSource?.hand
    ? 'hand-ray'
    : controller.userData.isMouse
      ? 'mouse'
      : 'controller-ray';
  return {source: getInteractionSource(controller, type)};
}

function eventForTarget(argument: unknown, currentTarget: Script): unknown {
  if (!argument || typeof argument !== 'object') return argument;
  if (Reflect.get(argument, 'currentTarget') === currentTarget) return argument;
  const event = Object.create(Object.getPrototypeOf(argument)) as Record<
    PropertyKey,
    unknown
  >;
  Object.defineProperties(event, Object.getOwnPropertyDescriptors(argument));
  Object.defineProperty(event, 'currentTarget', {
    enumerable: true,
    configurable: true,
    value: currentTarget,
  });
  return event;
}
