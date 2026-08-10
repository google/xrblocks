import * as THREE from 'three';
import { Core, Input, Options, Script, type Simulator } from 'xrblocks';
import { type EmbodiedControlOptions } from '../embodied-control';
import { type RemoteControlRequest, type RemoteControlResponse, type RemoteControlToolHandler, type RemoteControlToolMetadata } from './RemoteControlProtocol';
import { WebSocketRemoteControlTransport, type WebSocketRemoteControlTransportOptions } from './WebSocketRemoteControlTransport';
export type RemoteControlOptions = WebSocketRemoteControlTransportOptions & {
    embodiedOptions?: EmbodiedControlOptions;
    tools?: Record<string, RemoteControlToolHandler>;
};
export declare class RemoteControl extends Script {
    private options;
    static dependencies: {
        core: typeof Core;
        input: typeof Input;
        camera: typeof THREE.Camera;
    };
    editorIcon: string;
    transport?: WebSocketRemoteControlTransport;
    dependencies: {
        core: Core;
        simulator?: Simulator;
        input: Input;
        camera: THREE.Camera;
    };
    private tools;
    private readonly embodiedControl;
    private simulatorReadyAnnounced;
    static configureOptions(options?: Options): Options & {
        enableAutomationMode: () => Options;
    };
    constructor(options?: RemoteControlOptions);
    init(dependencies: {
        core: Core;
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
    private announceSimulatorReady;
    private resolveTarget;
}
