import './setup.js';
import * as THREE from 'three';
import { ScriptsManagerEventType, Core, Options } from 'xrblocks';
import { EmbodiedControl } from '../embodied-control/EmbodiedControl.js';
import '../embodied-control/EmbodiedControlExecutor.js';
import 'vitest';
import 'three/addons/loaders/GLTFLoader.js';
import '../embodied-control/EmbodiedControlTypes.js';

class TestRunner {
    constructor(core, embodiedControl) {
        this.caughtErrors = [];
        this.core = core;
        this.embodiedControl = embodiedControl;
        this.scene = core.scene;
        this.camera = core.camera;
        this.boundExceptionListener = (event) => {
            const error = event.error ||
                new Error(`Exception in script: ${event.scriptName} (${event.context})`);
            this.caughtErrors.push(error);
        };
        // Hook error handling
        core.scriptsManager.addEventListener(ScriptsManagerEventType.EXCEPTION, this.boundExceptionListener);
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
        const core = Core.instance || new Core();
        const options = config.options || new Options();
        options.enableSimulator = true;
        options.xrButton.alwaysAutostartSimulator = true;
        options.gestures.updateIntervalMs = 0; // Disable real-time throttle for headless tests.
        options.simulator.environments = [
            {
                name: 'Empty Test Environment',
                scenePath: null,
                scenePlanesPath: null,
            },
        ];
        options.simulator.activeEnvironmentIndex = 0;
        core.options = options;
        if (config.scripts) {
            for (const script of config.scripts) {
                core.scene.add(script);
            }
        }
        const embodiedOptions = {
            autoPause: true,
            realTime: false,
            ...config.embodiedOptions,
        };
        const embodiedControl = new EmbodiedControl(embodiedOptions);
        core.scene.add(embodiedControl);
        await core.init(options);
        while (!core.simulatorRunning) {
            await new Promise((resolve) => setTimeout(resolve, 10));
        }
        // Automatically re-trigger hand bone loading under JSDOM to populate virtual hand skeletons.
        if (core.simulator?.hands) {
            core.simulator.hands.leftHandBones = [];
            core.simulator.hands.rightHandBones = [];
            core.simulator.hands.loadMeshes();
        }
        for (let i = 0; i < Math.min(2, core.input.controllers.length); i++) {
            const controller = core.input.controllers[i];
            controller.userData.connected = true;
            if (i === 0) {
                core.input.leftController = controller;
            }
            else if (i === 1) {
                core.input.rightController = controller;
            }
        }
        core.camera.updateMatrixWorld(true);
        core.camera.matrixWorldInverse.copy(core.camera.matrixWorld).invert();
        const runner = new TestRunner(core, embodiedControl);
        runner.checkErrors();
        return runner;
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
    /**
     * Destroys the test runner, cleans up the scene, window events, and resets mocks.
     */
    async destroy() {
        this.checkErrors();
        // Remove exception listener
        this.core.scriptsManager.removeEventListener(ScriptsManagerEventType.EXCEPTION, this.boundExceptionListener);
        const coreInternal = this.core;
        if (coreInternal.onWindowResize) {
            window.removeEventListener('resize', coreInternal.onWindowResize);
        }
        this.core.scene.clear();
        await this.core.scriptsManager.syncScriptsWithScene(this.core.scene);
        this.core.scene.add(this.core.xrSystemsGroup);
        // Clear Input lists and maps to prevent duplicate controller registration across tests.
        const input = this.core.input;
        input.controllers.length = 0;
        input.controllerGrips.length = 0;
        input.hands.length = 0;
        input.leftController = undefined;
        input.rightController = undefined;
        input.intersectionsForController.clear();
        input.activeControllers.clear();
        input.listeners.clear();
        const depth = this.core.depth;
        depth.view.length = 0;
        depth.cpuDepthData.length = 0;
        depth.gpuDepthData.length = 0;
        depth.depthArray.length = 0;
        const coreWritable = this.core;
        coreWritable.effects = undefined;
        const registryInternal = this.core.registry;
        registryInternal.instances.clear();
        this.core.registry.register(this.core.registry);
        this.core.registry.register(this.core, Core);
        this.core.registry.register(this.core.scene, THREE.Scene);
        this.core.registry.register(this.core.camera, THREE.Camera);
        this.core.registry.register(this.core.timer, THREE.Timer);
        this.core.registry.register(this.core.input);
        this.core.registry.register(this.core.user);
        this.core.registry.register(this.core.ui);
        this.core.registry.register(this.core.sound);
        this.core.registry.register(this.core.dragManager);
        this.core.registry.register(this.core.simulator);
        this.core.registry.register(this.core.scriptsManager);
        this.core.registry.register(this.core.depth);
        this.core.registry.register(this.core.world);
        this.core.registry.register(this.core.xrSystemsGroup);
        if (this.core.renderer) {
            this.core.renderer.dispose();
            this.core.renderer.domElement.remove();
            coreWritable.renderer = undefined;
        }
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
