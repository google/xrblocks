import './setup';
import * as THREE from 'three';
import { Core, Options, Script, type Constructor } from 'xrblocks';
import { EmbodiedControl, type EmbodiedControlOptions } from '../embodied-control';
export interface TestRunnerConfig {
    /** Scripts to load into the test scene. */
    scripts?: Script[];
    /** Core configuration option overrides. */
    options?: Options;
    /** Options passed to the underlying EmbodiedControl addon. */
    embodiedOptions?: EmbodiedControlOptions;
}
/** Owns the single terminal Core lifetime in its test process or browser page. */
export declare class TestRunner {
    readonly core: Core;
    readonly embodiedControl: EmbodiedControl;
    readonly scene: THREE.Scene;
    readonly camera: THREE.Camera;
    readonly actions: EmbodiedControl;
    private caughtErrors;
    private errorListenerAttached;
    private destroyPromise?;
    private readonly handleScriptException;
    private constructor();
    static create(config?: TestRunnerConfig): Promise<TestRunner>;
    /**
     * Retrieves a loaded script instance from the dependency injection registry.
     */
    getScript<T extends Script>(klass: Constructor<T>): T;
    /** Disposes the Core lifetime owned by this runner. */
    destroy(): Promise<void>;
    private finishDestroy;
    private removeErrorListener;
    private checkErrors;
}
