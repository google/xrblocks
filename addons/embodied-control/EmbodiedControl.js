import * as THREE from 'three';
import { Script, Input, Simulator, Core } from 'xrblocks';
import { EmbodiedControlExecutor } from './EmbodiedControlExecutor.js';
import { DEFAULT_EMBODIED_CONTROL_OPTIONS } from './EmbodiedControlTypes.js';

class EmbodiedControl extends Script {
    static { this.dependencies = {
        core: Core,
        simulator: Simulator,
        input: Input,
        camera: THREE.Camera,
    }; }
    constructor(options = {}) {
        super();
        this.editorIcon = 'sports_martial_arts';
        this.options = {
            ...DEFAULT_EMBODIED_CONTROL_OPTIONS,
            ...options,
        };
    }
    init(dependencies) {
        this.executor = new EmbodiedControlExecutor({
            ...dependencies,
            screenshotSynthesizer: dependencies.core.screenshotSynthesizer,
        }, this.options);
        if (this.options.autoPause) {
            dependencies.core.pause();
        }
    }
    step(step) {
        if (!this.executor) {
            throw new Error('EmbodiedControl is not initialized.');
        }
        return this.executor.step(step);
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
}

export { EmbodiedControl };
