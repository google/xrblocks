import * as THREE from 'three';

import type {Controller} from '../../input/Controller';
import {KeyEvent, Script, SelectEvent} from '../Script';
import {isDefaultScriptMethod} from '../ScriptHooks';

type MaybeScript = THREE.Object3D & {isXRScript?: boolean};

type GlobalScriptHook =
  | 'update'
  | 'physicsStep'
  | 'onSelectStart'
  | 'onSelectEnd'
  | 'onSelect'
  | 'onSelecting'
  | 'onSqueezeStart'
  | 'onSqueezeEnd'
  | 'onSqueeze'
  | 'onSqueezing'
  | 'onKeyDown'
  | 'onKeyUp'
  | 'onXRSessionStarted'
  | 'onXRSessionEnded'
  | 'onSimulatorStarted';

interface PendingInitialization {
  readonly script: Script;
  promise: Promise<void>;
  connection: 'connected' | 'disconnected' | 'reconnected';
}

const GLOBAL_HOOKS = Object.freeze([
  'update',
  'physicsStep',
  'onSelectStart',
  'onSelectEnd',
  'onSelect',
  'onSelecting',
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

export class ScriptsManager extends THREE.EventDispatcher<ScriptsManagerEventMap> {
  private activeScripts = new Set<Script>();
  private readonly hookScripts = new Map<GlobalScriptHook, Set<Script>>();
  private readonly pendingInitializations = new Map<
    Script,
    PendingInitialization
  >();
  private readonly seenScripts = new Set<Script>();
  private readonly failedScripts = new Set<Script>();
  private readonly syncPromises: Promise<void>[] = [];

  /** Whether to catch all exceptions thrown by developer scripts. */
  catchExceptions = true;
  beforeDispose?: (script: Script) => void;
  afterDispose?: (script: Script) => void;

  constructor(private initScriptFunction: (script: Script) => Promise<void>) {
    super();
  }

  /** The set of all currently initialized scripts. */
  get scripts(): Set<Script> {
    return this.activeScripts;
  }

  set scripts(scripts: Set<Script>) {
    this.activeScripts = scripts;
    this.rebuildHookIndex();
  }

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

  private callScripts(
    scripts: Iterable<Script>,
    context: string,
    callback: (script: Script) => void
  ): void {
    for (const script of scripts) {
      try {
        callback(script);
      } catch (error: unknown) {
        this.handleScriptError(error, script, context);
      }
    }
  }

  /** Initializes a script. Concurrent calls share one initialization. */
  initScript(script: Script): Promise<void> {
    if (this.activeScripts.has(script)) return Promise.resolve();
    if (this.failedScripts.has(script)) return Promise.resolve();

    const pending = this.pendingInitializations.get(script);
    if (pending) {
      if (pending.connection === 'disconnected') {
        pending.connection = 'reconnected';
      }
      return pending.promise;
    }

    const entry: PendingInitialization = {
      script,
      promise: Promise.resolve(),
      connection: 'connected',
    };
    entry.promise = Promise.resolve().then(() =>
      this.finishInitialization(entry)
    );
    this.pendingInitializations.set(script, entry);
    return entry.promise;
  }

  private async finishInitialization(
    entry: PendingInitialization
  ): Promise<void> {
    let failed = false;
    try {
      try {
        await this.initScriptFunction(entry.script);
      } catch (error: unknown) {
        failed = true;
        if (entry.connection === 'connected') {
          this.failedScripts.add(entry.script);
          this.handleScriptError(error, entry.script, 'init');
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
    }
  }

  /** Uninitializes a script and prevents a pending generation from activating. */
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

  private checkScript = (object: THREE.Object3D): void => {
    if (!(object as MaybeScript).isXRScript) return;
    const script = object as Script;
    this.syncPromises.push(this.initScript(script));
    this.seenScripts.add(script);
  };

  syncScriptsWithScene(
    scene: THREE.Scene
  ): Promise<PromiseSettledResult<void>[]> {
    this.seenScripts.clear();
    this.syncPromises.length = 0;
    scene.traverse(this.checkScript);

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

    return Promise.allSettled(this.syncPromises);
  }

  resetUX = (): void => {
    this.callScripts(this.activeScripts, 'ux.reset', (script) =>
      script.ux.reset()
    );
  };

  callSelecting = (controller: Controller): void => {
    this.callHook('onSelecting', (script) =>
      script.onSelecting({target: controller})
    );
  };

  callSqueezing = (controller: Controller): void => {
    this.callHook('onSqueezing', (script) =>
      script.onSqueezing({target: controller})
    );
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

  callSelectEnd = (event: SelectEvent): void => {
    this.callHook('onSelectEnd', (script) => script.onSelectEnd(event));
  };

  callSelect = (event: SelectEvent): void => {
    this.callHook('onSelect', (script) => script.onSelect(event));
  };

  callSqueezeStart = (event: SelectEvent): void => {
    this.callHook('onSqueezeStart', (script) => script.onSqueezeStart(event));
  };

  callSqueezeEnd = (event: SelectEvent): void => {
    this.callHook('onSqueezeEnd', (script) => script.onSqueezeEnd(event));
  };

  callSqueeze = (event: SelectEvent): void => {
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
    if (scripts) this.callScripts(scripts, hook, callback);
  }

  private getHookSet(hook: GlobalScriptHook): Set<Script> {
    let scripts = this.hookScripts.get(hook);
    if (!scripts) {
      scripts = new Set<Script>();
      this.hookScripts.set(hook, scripts);
    }
    return scripts;
  }

  private indexScript(script: Script): void {
    for (const hook of GLOBAL_HOOKS) {
      if (!isDefaultScriptMethod(Reflect.get(script, hook))) {
        this.getHookSet(hook).add(script);
      }
    }
  }

  private unindexScript(script: Script): void {
    for (const scripts of this.hookScripts.values()) scripts.delete(script);
  }

  private rebuildHookIndex(): void {
    this.hookScripts.clear();
    for (const script of this.activeScripts) this.indexScript(script);
  }
}
