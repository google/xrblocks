import * as THREE from 'three';
import {Core, Input, Options, Script, Simulator} from 'xrblocks';
import {
  EmbodiedControl,
  type EmbodiedControlOptions,
} from '../embodied-control';

import {
  createRemoteControlBuiltInTools,
  type RemoteControlTarget,
} from './built-in-tools';
import {
  type RemoteControlCallToolRequest,
  type RemoteControlRequest,
  type RemoteControlResponse,
  type RemoteControlToolHandler,
  type RemoteControlToolMetadata,
} from './RemoteControlProtocol';
import {
  WebSocketRemoteControlTransport,
  type WebSocketRemoteControlTransportOptions,
} from './WebSocketRemoteControlTransport';

export type RemoteControlOptions = WebSocketRemoteControlTransportOptions & {
  embodiedOptions?: EmbodiedControlOptions;
  tools?: Record<string, RemoteControlToolHandler>;
};

type RegisteredTool = {
  handler: RemoteControlToolHandler;
  metadata?: RemoteControlToolMetadata;
};

export class RemoteControl extends Script {
  static dependencies = {
    core: Core,
    simulator: Simulator,
    input: Input,
    camera: THREE.Camera,
  };

  editorIcon = 'settings_remote';
  transport?: WebSocketRemoteControlTransport;

  dependencies!: {
    core: Core;
    simulator: Simulator;
    input: Input;
    camera: THREE.Camera;
  };

  private tools = new Map<string, RegisteredTool>();
  private readonly embodiedControl: EmbodiedControl;
  private simulatorReadyAnnounced = false;

  static configureOptions(options = new Options()) {
    return (
      options as Options & {
        enableAutomationMode: () => Options;
      }
    ).enableAutomationMode();
  }

  constructor(private options: RemoteControlOptions = {}) {
    super();
    this.embodiedControl = new EmbodiedControl(options.embodiedOptions);
    this.add(this.embodiedControl);

    for (const [name, handler] of Object.entries(options.tools ?? {})) {
      this.registerTool(name, handler);
    }
  }

  init(dependencies: {
    core: Core;
    simulator: Simulator;
    input: Input;
    camera: THREE.Camera;
  }) {
    this.dependencies = dependencies;
    this.registerBuiltInTools();
    this.transport = new WebSocketRemoteControlTransport(
      {
        url: this.options.url,
        sessionId: this.options.sessionId,
        reconnect: this.options.reconnect,
        reconnectDelayMs: this.options.reconnectDelayMs,
      },
      (request) => this.handleRequest(request)
    );
    this.transport.connect();
    if (dependencies.core.simulatorRunning) {
      void this.announceSimulatorReady();
    }
  }

  dispose() {
    this.transport?.disconnect();
    this.transport = undefined;
  }

  override onSimulatorStarted() {
    void this.announceSimulatorReady();
  }

  registerTool(
    name: string,
    handler: RemoteControlToolHandler,
    metadata?: RemoteControlToolMetadata
  ) {
    if (!name) {
      throw new Error('RemoteControl tool names must be non-empty.');
    }
    this.tools.set(name, {handler, metadata});
  }

  unregisterTool(name: string) {
    this.tools.delete(name);
  }

  listTools() {
    return [...this.tools.entries()].map(([name, tool]) => ({
      name,
      metadata: tool.metadata,
    }));
  }

  async handleRequest(
    request: RemoteControlRequest
  ): Promise<RemoteControlResponse> {
    try {
      const result =
        request.type === 'ping' ? {pong: true} : await this.callTool(request);
      return {
        type: 'response',
        id: request.id,
        ok: true,
        result,
      };
    } catch (error) {
      const code =
        error instanceof Error && error.name === 'EmbodiedControlBusyError'
          ? 'active_step'
          : 'execution_error';
      return {
        type: 'response',
        id: request.id,
        ok: false,
        error: {
          code,
          message: error instanceof Error ? error.message : String(error),
        },
      };
    }
  }

  private async callTool(request: RemoteControlCallToolRequest) {
    const tool = this.tools.get(request.name);
    if (!tool) {
      throw new Error(`RemoteControl tool not found: ${request.name}`);
    }
    return tool.handler(request.args, {request});
  }

  private registerBuiltInTools() {
    for (const tool of createRemoteControlBuiltInTools({
      ...this.dependencies,
      embodiedControl: this.embodiedControl,
      resolveTarget: (target) => this.resolveTarget(target),
    })) {
      if (!this.tools.has(tool.name)) {
        this.tools.set(tool.name, {
          handler: tool.handler,
          metadata: tool.metadata,
        });
      }
    }
  }

  private async announceSimulatorReady() {
    await this.embodiedControl.ready;
    if (this.simulatorReadyAnnounced || !this.transport) return;
    this.simulatorReadyAnnounced = true;
    this.transport.announceSimulatorReady();
  }

  private resolveTarget(
    target: RemoteControlTarget
  ): THREE.Vector3 | THREE.Object3D {
    if (!Array.isArray(target) && typeof target === 'object') {
      if (target.type === 'contextNode') {
        const contextTarget =
          this.dependencies.core.context.scene?.resolveNodeObject(target.id);
        if (!contextTarget) {
          throw new Error(`Context target not found: ${target.id}`);
        }
        return contextTarget;
      }
      throw new Error(`Unsupported target type: ${String(target.type)}`);
    }

    if (typeof target === 'string') {
      const obj = this.dependencies.core.scene.getObjectByName(target);
      if (!obj) {
        throw new Error(`Object target not found in scene: ${target}`);
      }
      return obj;
    }
    return new THREE.Vector3().fromArray(target);
  }
}
