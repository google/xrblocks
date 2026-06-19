import * as THREE from 'three';
import { Script, Input, Simulator, Core } from 'xrblocks';
import { EmbodiedControl } from '../embodied-control/EmbodiedControl.js';
import '../embodied-control/EmbodiedControlExecutor.js';
import { WebSocketRemoteControlTransport } from './WebSocketRemoteControlTransport.js';
import '../embodied-control/EmbodiedControlTypes.js';
import './RemoteControlProtocol.js';

class RemoteControl extends Script {
    static { this.dependencies = {
        core: Core,
        simulator: Simulator,
        input: Input,
        camera: THREE.Camera,
    }; }
    constructor(options = {}) {
        super();
        this.options = options;
        this.editorIcon = 'settings_remote';
        this.embodiedControl =
            options.embodiedControl ?? new EmbodiedControl(options.embodiedOptions);
    }
    init(dependencies) {
        this.dependencies = dependencies;
        if (!this.embodiedControl.executor) {
            this.embodiedControl.init(dependencies);
        }
        this.transport = new WebSocketRemoteControlTransport({
            url: this.options.url,
            reconnect: this.options.reconnect,
            reconnectDelayMs: this.options.reconnectDelayMs,
        }, (cmd) => this.handleCommand(cmd));
        this.transport.connect();
    }
    dispose() {
        this.transport?.disconnect();
    }
    async handleCommand(message) {
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
                return this.embodiedControl.pointTo(message.handIndex, target, message.options);
            }
            case 'REACH_TO': {
                const target = this.resolveTarget(message.target);
                return this.embodiedControl.reachTo(message.handIndex, target, message.options);
            }
            case 'CLICK':
                return this.embodiedControl.click(message.handIndex, message.options);
            default:
                throw new Error(`Unsupported command type: ${message.type}`);
        }
    }
    resolveTarget(target) {
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

export { RemoteControl };
