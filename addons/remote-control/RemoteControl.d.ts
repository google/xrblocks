import * as THREE from 'three';
import { Core, Input, Options, Script, Simulator } from 'xrblocks';
import { EmbodiedControl, type EmbodiedControlOptions } from '../embodied-control';
import { type RemoteControlRequest, type RemoteControlResponse, type RemoteControlToolHandler, type RemoteControlToolMetadata } from './RemoteControlProtocol';
import { WebSocketRemoteControlTransport, type WebSocketRemoteControlTransportOptions } from './WebSocketRemoteControlTransport';
export type RemoteControlOptions = WebSocketRemoteControlTransportOptions & {
    embodiedControl?: EmbodiedControl;
    embodiedOptions?: EmbodiedControlOptions;
    tools?: Record<string, RemoteControlToolHandler>;
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
    private tools;
    static configureOptions(options?: Options): Options & {
        enableAutomationMode: () => Options;
    };
    constructor(options?: RemoteControlOptions);
    init(dependencies: {
        core: Core;
        simulator: Simulator;
        input: Input;
        camera: THREE.Camera;
    }): void;
    dispose(): void;
    onSimulatorStarted(): void;
    registerTool(name: string, handler: RemoteControlToolHandler, metadata?: RemoteControlToolMetadata): void;
    unregisterTool(name: string): void;
    listTools(): {
        name: string;
        metadata: RemoteControlToolMetadata | undefined;
    }[];
    handleRequest(request: RemoteControlRequest): Promise<RemoteControlResponse>;
    private callTool;
    private registerBuiltInTools;
    private resolveTarget;
}
