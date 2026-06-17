import * as THREE from 'three';
import { Core, Input, ScreenshotSynthesizer, Simulator } from 'xrblocks';
import { type XRCompoundControl, type EmbodiedControlOptions, type EmbodiedControlStep, type EmbodiedControlStepResult } from './EmbodiedControlTypes';
export type EmbodiedControlExecutorDependencies = {
    core: Core;
    simulator: Simulator;
    input: Input;
    camera: THREE.Camera;
    screenshotSynthesizer: ScreenshotSynthesizer;
};
export declare class EmbodiedControlBusyError extends Error {
    constructor();
}
export declare class EmbodiedControlExecutor {
    private dependencies;
    private activeStep;
    private options;
    constructor(dependencies: EmbodiedControlExecutorDependencies, options?: EmbodiedControlOptions);
    configure(options: EmbodiedControlOptions): void;
    get busy(): boolean;
    applyControl(control: XRCompoundControl): void;
    step(step: EmbodiedControlStep): Promise<EmbodiedControlStepResult>;
    private applyControlFraction;
    private applyLocomotion;
    private applyHandMotion;
    private applyInstantHandControls;
    private applyHandSelect;
    private applyHandRotations;
    private createObservation;
    private createHandObservation;
}
