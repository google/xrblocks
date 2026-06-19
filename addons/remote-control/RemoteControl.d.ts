import * as THREE from 'three';
import { Core, Input, Script, Simulator } from 'xrblocks';
import { EmbodiedControl, type EmbodiedControlOptions, type EmbodiedControlStepResult } from '../embodied-control';
import { WebSocketRemoteControlTransport, type WebSocketRemoteControlTransportOptions } from './WebSocketRemoteControlTransport';
import { RemoteControlMessage } from './RemoteControlProtocol';
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
    dependencies: {
        core: Core;
        simulator: Simulator;
        input: Input;
        camera: THREE.Camera;
    };
    constructor(options?: RemoteControlOptions);
    init(dependencies: {
        core: Core;
        simulator: Simulator;
        input: Input;
        camera: THREE.Camera;
    }): void;
    dispose(): void;
    handleCommand(message: RemoteControlMessage): Promise<EmbodiedControlStepResult>;
    private resolveTarget;
}
