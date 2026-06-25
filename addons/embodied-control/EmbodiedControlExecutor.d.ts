import * as THREE from 'three';
import { Core, Simulator } from 'xrblocks';
import { type XRCompoundControl, type EmbodiedControlOptions, type EmbodiedControlStep } from './EmbodiedControlTypes';
export type EmbodiedControlExecutorDependencies = {
    core: Core;
    simulator: Simulator;
    camera: THREE.Camera;
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
    step(step: EmbodiedControlStep): Promise<void>;
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
    }): Promise<void>;
    lookAtTarget(target: THREE.Object3D | THREE.Vector3 | [number, number, number], options?: {
        velocity?: number;
    }): Promise<void>;
    pointTo(handIndex: number, target: THREE.Object3D | THREE.Vector3 | [number, number, number], options?: {
        velocity?: number;
    }): Promise<void>;
    reachTo(handIndex: number, target: THREE.Vector3 | [number, number, number] | THREE.Object3D, options?: {
        velocity?: number;
    }): Promise<void>;
    click(handIndex?: number, options?: {
        durationMs?: number;
    }): Promise<void>;
}
