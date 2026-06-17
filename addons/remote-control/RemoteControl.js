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
        if (!this.embodiedControl.executor) {
            this.embodiedControl.init(dependencies);
        }
        this.transport = new WebSocketRemoteControlTransport({
            url: this.options.url,
            reconnect: this.options.reconnect,
            reconnectDelayMs: this.options.reconnectDelayMs,
        }, (step) => this.step(step));
        this.transport.connect();
    }
    dispose() {
        this.transport?.disconnect();
    }
    step(step) {
        return this.embodiedControl.step(step);
    }
}

export { RemoteControl };
