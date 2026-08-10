import './setup.js';
import { ScriptsManagerEventType, core, Options } from 'xrblocks';
import { EmbodiedControl } from '../embodied-control/EmbodiedControl.js';
import '../embodied-control/EmbodiedControlExecutor.js';
import 'vitest';
import 'three';
import 'three/addons/loaders/GLTFLoader.js';
import '../embodied-control/EmbodiedControlTypes.js';
import '../embodied-control/EmbodiedControlTiming.js';

/** Owns the single terminal Core lifetime in its test process or browser page. */
class TestRunner {
    constructor(core, embodiedControl) {
        this.caughtErrors = [];
        this.errorListenerAttached = false;
        this.handleScriptException = (event) => {
            const error = event.error ||
                new Error(`Exception in script: ${event.scriptName} (${event.context})`);
            this.caughtErrors.push(error);
        };
        this.core = core;
        this.embodiedControl = embodiedControl;
        this.scene = core.scene;
        this.camera = core.camera;
        core.scriptsManager.addEventListener(ScriptsManagerEventType.EXCEPTION, this.handleScriptException);
        this.errorListenerAttached = true;
        // Set up the dynamic actions proxy.
        this.actions = new Proxy(this.embodiedControl, {
            get: (target, prop) => {
                const val = target[prop];
                if (typeof val === 'function') {
                    const fn = val;
                    return async (...args) => {
                        const result = fn.apply(target, args);
                        if (result instanceof Promise) {
                            await result;
                        }
                        this.checkErrors();
                    };
                }
                return val;
            },
        });
    }
    static async create(config = {}) {
        const core$1 = core;
        if (core$1.lifecycle !== 'new') {
            throw new Error(`TestRunner requires a new Core lifetime, but Core is ${core$1.lifecycle}. ` +
                'Use a separate test process or browser page for another runtime.');
        }
        const options = config.options || new Options();
        options.enableSimulator = true;
        options.xrButton.alwaysAutostartSimulator = true;
        options.gestures.updateIntervalMs = 0; // Disable real-time throttle for headless tests.
        options.simulator.environments = [
            {
                name: 'Empty Test Environment',
                manifestPath: 'data:application/json,%7B%22objects%22%3A%5B%5D%7D',
            },
        ];
        options.simulator.activeEnvironmentIndex = 0;
        if (config.scripts) {
            for (const script of config.scripts) {
                core$1.scene.add(script);
            }
        }
        const embodiedOptions = {
            autoPause: true,
            realTime: false,
            ...config.embodiedOptions,
        };
        const embodiedControl = new EmbodiedControl(embodiedOptions);
        core$1.scene.add(embodiedControl);
        const runner = new TestRunner(core$1, embodiedControl);
        try {
            await core$1.init(options);
            while (!core$1.simulatorRunning) {
                await new Promise((resolve) => setTimeout(resolve, 10));
            }
            await embodiedControl.ready;
            // Populate virtual hand skeletons under JSDOM after simulator startup.
            if (core$1.simulator?.hands) {
                core$1.simulator.hands.leftHandBones = [];
                core$1.simulator.hands.rightHandBones = [];
                await core$1.simulator.hands.loadMeshes();
            }
            for (let i = 0; i < Math.min(2, core$1.input.controllers.length); i++) {
                const controller = core$1.input.controllers[i];
                controller.userData.connected = true;
                if (i === 0) {
                    core$1.input.leftController = controller;
                }
                else if (i === 1) {
                    core$1.input.rightController = controller;
                }
            }
            core$1.camera.updateMatrixWorld(true);
            core$1.camera.matrixWorldInverse.copy(core$1.camera.matrixWorld).invert();
            runner.checkErrors();
            return runner;
        }
        catch (error) {
            runner.removeErrorListener();
            try {
                await core$1.dispose();
            }
            catch (cleanupError) {
                console.error('TestRunner cleanup failed after creation failed.', cleanupError);
            }
            throw error;
        }
    }
    /**
     * Retrieves a loaded script instance from the dependency injection registry.
     */
    getScript(klass) {
        const script = this.core.registry.get(klass);
        if (!script) {
            throw new Error(`Script or subsystem for ${klass.name} not found in Core registry.`);
        }
        return script;
    }
    /** Disposes the Core lifetime owned by this runner. */
    async destroy() {
        this.destroyPromise ??= this.finishDestroy();
        return this.destroyPromise;
    }
    async finishDestroy() {
        let firstError;
        try {
            this.checkErrors();
        }
        catch (error) {
            firstError = error;
        }
        this.removeErrorListener();
        try {
            await this.core.dispose();
        }
        catch (error) {
            firstError ??= error;
        }
        if (firstError !== undefined)
            throw firstError;
    }
    removeErrorListener() {
        if (!this.errorListenerAttached)
            return;
        this.errorListenerAttached = false;
        this.core.scriptsManager.removeEventListener(ScriptsManagerEventType.EXCEPTION, this.handleScriptException);
    }
    checkErrors() {
        if (this.caughtErrors.length > 0) {
            const combined = this.caughtErrors
                .map((e) => e.stack || e.message)
                .join('\n\n');
            this.caughtErrors = [];
            throw new Error(`Test failed due to script exceptions:\n${combined}`);
        }
    }
}

export { TestRunner };
