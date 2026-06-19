import * as THREE from 'three';
import {Core, Input, Script, Simulator} from 'xrblocks';
import {
  EmbodiedControl,
  type EmbodiedControlOptions,
  type EmbodiedControlStepResult,
} from '../embodied-control';

import {
  WebSocketRemoteControlTransport,
  type WebSocketRemoteControlTransportOptions,
} from './WebSocketRemoteControlTransport';
import {RemoteControlMessage} from './RemoteControlProtocol';

export type RemoteControlOptions = WebSocketRemoteControlTransportOptions & {
  embodiedControl?: EmbodiedControl;
  embodiedOptions?: EmbodiedControlOptions;
};

export class RemoteControl extends Script {
  static dependencies = {
    core: Core,
    simulator: Simulator,
    input: Input,
    camera: THREE.Camera,
  };

  editorIcon = 'settings_remote';
  embodiedControl: EmbodiedControl;
  transport?: WebSocketRemoteControlTransport;

  dependencies!: {
    core: Core;
    simulator: Simulator;
    input: Input;
    camera: THREE.Camera;
  };

  constructor(private options: RemoteControlOptions = {}) {
    super();
    this.embodiedControl =
      options.embodiedControl ?? new EmbodiedControl(options.embodiedOptions);
  }

  init(dependencies: {
    core: Core;
    simulator: Simulator;
    input: Input;
    camera: THREE.Camera;
  }) {
    this.dependencies = dependencies;
    if (!this.embodiedControl.executor) {
      this.embodiedControl.init(dependencies);
    }

    this.transport = new WebSocketRemoteControlTransport(
      {
        url: this.options.url,
        reconnect: this.options.reconnect,
        reconnectDelayMs: this.options.reconnectDelayMs,
      },
      (cmd) => this.handleCommand(cmd)
    );
    this.transport.connect();
  }

  dispose() {
    this.transport?.disconnect();
  }

  async handleCommand(
    message: RemoteControlMessage
  ): Promise<EmbodiedControlStepResult> {
    switch (message.type) {
      case 'STEP':
        return this.embodiedControl.step(message);
      case 'TELEPORT_TO': {
        const target = this.resolveTarget(message.target);
        return this.embodiedControl.teleportTo(target, message.options);
      }
      case 'LOOK_AT_TARGET': {
        const target = this.resolveTarget(message.target);
        return this.embodiedControl.lookAtTarget(target, message.options);
      }
      case 'POINT_TO': {
        const target = this.resolveTarget(message.target);
        return this.embodiedControl.pointTo(
          message.handIndex,
          target,
          message.options
        );
      }
      case 'REACH_TO': {
        const target = this.resolveTarget(message.target);
        return this.embodiedControl.reachTo(
          message.handIndex,
          target,
          message.options
        );
      }
      case 'CLICK':
        return this.embodiedControl.click(message.handIndex, message.options);
      default:
        throw new Error(
          `Unsupported command type: ${(message as {type: string}).type}`
        );
    }
  }

  private resolveTarget(
    target: [number, number, number] | string
  ): THREE.Vector3 | THREE.Object3D {
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
