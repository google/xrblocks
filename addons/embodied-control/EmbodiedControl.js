import * as THREE from 'three';
import { Script, Simulator, Core } from 'xrblocks';
import { EmbodiedControlExecutor } from './EmbodiedControlExecutor.js';
import { DEFAULT_EMBODIED_CONTROL_OPTIONS } from './EmbodiedControlTypes.js';

class EmbodiedControl extends Script {
    static { this.dependencies = {
        core: Core,
        simulator: Simulator,
        camera: THREE.Camera,
    }; }
    constructor(options = {}) {
        super();
        this.editorIcon = 'sports_martial_arts';
        this.autoPauseScheduled = false;
        this.autoPauseComplete = false;
        this.options = {
            ...DEFAULT_EMBODIED_CONTROL_OPTIONS,
            ...options,
        };
    }
    init(dependencies) {
        this.core = dependencies.core;
        this.executor = new EmbodiedControlExecutor(dependencies, this.options);
        if (this.options.autoPause && dependencies.core.simulatorRunning) {
            this.scheduleAutoPause();
        }
    }
    onSimulatorStarted() {
        if (this.options.autoPause) {
            this.scheduleAutoPause();
        }
    }
    scheduleAutoPause() {
        if (this.autoPauseScheduled || this.autoPauseComplete)
            return;
        this.autoPauseScheduled = true;
        this.afterRenderedFrame(() => {
            if (!this.core)
                return;
            this.core.pause();
            this.autoPauseComplete = true;
        });
    }
    afterRenderedFrame(callback) {
        const schedule = typeof requestAnimationFrame === 'function'
            ? requestAnimationFrame
            : (handler) => {
                setTimeout(() => handler(performance.now()), 0);
                return 0;
            };
        schedule(() => schedule(() => callback()));
    }
    step(step) {
        if (!this.executor) {
            throw new Error('EmbodiedControl is not initialized.');
        }
        return this.executor.step({
            ...step,
            control: step.control || {},
        });
    }
    applyControl(control) {
        if (!this.executor) {
            throw new Error('EmbodiedControl is not initialized.');
        }
        this.executor.applyControl(control);
    }
    get busy() {
        return this.executor?.busy ?? false;
    }
    teleportTo(target, options) {
        if (!this.executor) {
            throw new Error('EmbodiedControl is not initialized.');
        }
        return this.executor.teleportTo(target, options);
    }
    lookAtTarget(target, options) {
        if (!this.executor) {
            throw new Error('EmbodiedControl is not initialized.');
        }
        return this.executor.lookAtTarget(target, options);
    }
    pointTo(handIndex, target, options) {
        if (!this.executor) {
            throw new Error('EmbodiedControl is not initialized.');
        }
        return this.executor.pointTo(handIndex, target, options);
    }
    reachTo(handIndex, target, options) {
        if (!this.executor) {
            throw new Error('EmbodiedControl is not initialized.');
        }
        return this.executor.reachTo(handIndex, target, options);
    }
    click(handIndex = 1, options) {
        if (!this.executor) {
            throw new Error('EmbodiedControl is not initialized.');
        }
        return this.executor.click(handIndex, options);
    }
}

export { EmbodiedControl };
