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
    private executeAction;
    private getTargetWorldPosition;
    teleportTo(target: THREE.Vector3 | [number, number, number] | THREE.Object3D, options?: {
        distance?: number;
        faceTarget?: boolean;
        snapToGround?: boolean;
    }): Promise<EmbodiedControlStepResult>;
    lookAtTarget(target: THREE.Object3D | THREE.Vector3 | [number, number, number], options?: {
        velocity?: number;
    }): Promise<EmbodiedControlStepResult>;
    pointTo(handIndex: number, target: THREE.Object3D | THREE.Vector3 | [number, number, number], options?: {
        velocity?: number;
    }): Promise<EmbodiedControlStepResult>;
    reachTo(handIndex: number, target: THREE.Vector3 | [number, number, number] | THREE.Object3D, options?: {
        velocity?: number;
    }): Promise<EmbodiedControlStepResult>;
    click(handIndex?: number, options?: {
        durationMs?: number;
    }): Promise<EmbodiedControlStepResult>;
    private createObservation;
    private createHandObservation;
}
