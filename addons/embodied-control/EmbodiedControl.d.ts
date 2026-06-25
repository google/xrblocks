import * as THREE from 'three';
import { Core, Script, Simulator } from 'xrblocks';
import { EmbodiedControlExecutor } from './EmbodiedControlExecutor';
import { type EmbodiedControlOptions, type EmbodiedControlStep, type XRCompoundControl } from './EmbodiedControlTypes';
export declare class EmbodiedControl extends Script {
    static dependencies: {
        core: typeof Core;
        simulator: typeof Simulator;
        camera: typeof THREE.Camera;
    };
    editorIcon: string;
    executor?: EmbodiedControlExecutor;
    private options;
    private core?;
    private autoPauseScheduled;
    private autoPauseComplete;
    constructor(options?: EmbodiedControlOptions);
    init(dependencies: {
        core: Core;
        simulator: Simulator;
        camera: THREE.Camera;
    }): void;
    onSimulatorStarted(): void;
    private scheduleAutoPause;
    private afterRenderedFrame;
    step(step: EmbodiedControlStep): Promise<void>;
    applyControl(control: XRCompoundControl): void;
    get busy(): boolean;
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
