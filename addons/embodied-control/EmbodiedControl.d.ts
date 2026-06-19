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
}
