import * as THREE from 'three';
import { Core, Input, Script, Simulator } from 'xrblocks';
import { EmbodiedControlExecutor } from './EmbodiedControlExecutor';
import { type EmbodiedControlOptions, type EmbodiedControlStep, type EmbodiedControlStepResult, type XRCompoundControl } from './EmbodiedControlTypes';
export declare class EmbodiedControl extends Script {
    static dependencies: {
        core: typeof Core;
        simulator: typeof Simulator;
        input: typeof Input;
        camera: typeof THREE.Camera;
    };
    editorIcon: string;
    executor?: EmbodiedControlExecutor;
    private options;
    constructor(options?: EmbodiedControlOptions);
    init(dependencies: {
        core: Core;
        simulator: Simulator;
        input: Input;
        camera: THREE.Camera;
    }): void;
    step(step: EmbodiedControlStep): Promise<EmbodiedControlStepResult>;
    applyControl(control: XRCompoundControl): void;
    get busy(): boolean;
}
