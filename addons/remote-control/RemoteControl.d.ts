import * as THREE from 'three';
import { Core, Input, Script, Simulator } from 'xrblocks';
import { EmbodiedControl, type EmbodiedControlOptions, type EmbodiedControlStep, type EmbodiedControlStepResult } from '../embodied-control';
import { WebSocketRemoteControlTransport, type WebSocketRemoteControlTransportOptions } from './WebSocketRemoteControlTransport';
export type RemoteControlOptions = WebSocketRemoteControlTransportOptions & {
    embodiedControl?: EmbodiedControl;
    embodiedOptions?: EmbodiedControlOptions;
};
export declare class RemoteControl extends Script {
    private options;
    static dependencies: {
        core: typeof Core;
        simulator: typeof Simulator;
        input: typeof Input;
        camera: typeof THREE.Camera;
    };
    editorIcon: string;
    embodiedControl: EmbodiedControl;
    transport?: WebSocketRemoteControlTransport;
    constructor(options?: RemoteControlOptions);
    init(dependencies: {
        core: Core;
        simulator: Simulator;
        input: Input;
        camera: THREE.Camera;
    }): void;
    dispose(): void;
    step(step: EmbodiedControlStep): Promise<EmbodiedControlStepResult>;
}
