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
  canceled: boolean;
  restartRequested: boolean;
  restartPromise?: Promise<void>;
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
  private indexedScripts = new Set<Script>();
  private readonly hookScripts = new Map<GlobalScriptHook, Set<Script>>();
  private readonly pendingInitializations = new Map<
    Script,
    PendingInitialization
  >();
  private readonly seenScripts = new Set<Script>();
  private readonly syncPromises: Promise<void>[] = [];

  /** Whether to catch all exceptions thrown by developer scripts. */
  catchExceptions = true;

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

    const pending = this.pendingInitializations.get(script);
    if (pending) {
      if (!pending.canceled) return pending.promise;
      pending.restartRequested = true;
      pending.restartPromise ??= pending.promise.then(
        () =>
          pending.restartRequested
            ? this.initScript(script)
            : Promise.resolve(),
        () =>
          pending.restartRequested ? this.initScript(script) : Promise.resolve()
      );
      return pending.restartPromise;
    }

    const entry: PendingInitialization = {
      script,
      promise: Promise.resolve(),
      canceled: false,
      restartRequested: false,
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
    try {
      try {
        await this.initScriptFunction(entry.script);
      } catch (error: unknown) {
        this.handleScriptError(error, entry.script, 'init');
        return;
      }

      if (entry.canceled) {
        this.disposeScript(entry.script);
        return;
      }
      this.activeScripts.add(entry.script);
      this.indexScript(entry.script);
    } finally {
      if (this.pendingInitializations.get(entry.script) === entry) {
        this.pendingInitializations.delete(entry.script);
      }
    }
  }

  /** Uninitializes a script and prevents a pending generation from activating. */
  uninitScript(script: Script): void {
    const pending = this.pendingInitializations.get(script);
    if (pending) {
      pending.canceled = true;
      pending.restartRequested = false;
      return;
    }
    if (!this.activeScripts.delete(script)) return;
    this.unindexScript(script);
    this.disposeScript(script);
  }

  private disposeScript(script: Script): void {
    try {
      script.dispose();
    } catch (error: unknown) {
      this.handleScriptError(error, script, 'dispose');
    }
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
    this.ensureHookIndex();
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
    this.indexedScripts.add(script);
    for (const hook of GLOBAL_HOOKS) {
      if (!isDefaultScriptMethod(Reflect.get(script, hook))) {
        this.getHookSet(hook).add(script);
      }
    }
  }

  private unindexScript(script: Script): void {
    this.indexedScripts.delete(script);
    for (const scripts of this.hookScripts.values()) scripts.delete(script);
  }

  private rebuildHookIndex(): void {
    this.indexedScripts.clear();
    this.hookScripts.clear();
    for (const script of this.activeScripts) this.indexScript(script);
  }

  private ensureHookIndex(): void {
    if (
      this.indexedScripts.size !== this.activeScripts.size ||
      [...this.activeScripts].some((script) => !this.indexedScripts.has(script))
    ) {
      this.rebuildHookIndex();
    }
  }
}
