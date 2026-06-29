import * as THREE from 'three';
import { Script, Input, Simulator, Core, Options } from 'xrblocks';
import { EmbodiedControl } from '../embodied-control/EmbodiedControl.js';
import '../embodied-control/EmbodiedControlExecutor.js';
import { createRemoteControlBuiltInTools } from './built-in-tools/index.js';
import { WebSocketRemoteControlTransport } from './WebSocketRemoteControlTransport.js';
import '../embodied-control/EmbodiedControlTypes.js';
import './built-in-tools/ActionTools.js';
import './built-in-tools/Types.js';
import './built-in-tools/ObservationTools.js';
import './RemoteControlProtocol.js';

class RemoteControl extends Script {
    static { this.dependencies = {
        core: Core,
        simulator: Simulator,
        input: Input,
        camera: THREE.Camera,
    }; }
    static configureOptions(options = new Options()) {
        return options.enableAutomationMode();
    }
    constructor(options = {}) {
        super();
        this.options = options;
        this.editorIcon = 'settings_remote';
        this.tools = new Map();
        this.embodiedControl =
            options.embodiedControl ?? new EmbodiedControl(options.embodiedOptions);
        for (const [name, handler] of Object.entries(options.tools ?? {})) {
            this.registerTool(name, handler);
        }
    }
    init(dependencies) {
        this.dependencies = dependencies;
        if (!this.embodiedControl.executor) {
            this.embodiedControl.init(dependencies);
        }
        this.registerBuiltInTools();
        this.transport = new WebSocketRemoteControlTransport({
            url: this.options.url,
            sessionId: this.options.sessionId,
            reconnect: this.options.reconnect,
            reconnectDelayMs: this.options.reconnectDelayMs,
        }, (request) => this.handleRequest(request));
        this.transport.connect();
    }
    dispose() {
        this.transport?.disconnect();
    }
    onSimulatorStarted() {
        if (!this.dependencies.core.scriptsManager.scripts.has(this.embodiedControl)) {
            this.embodiedControl.onSimulatorStarted();
        }
        this.transport?.announceSimulatorReady();
    }
    registerTool(name, handler, metadata) {
        if (!name) {
            throw new Error('RemoteControl tool names must be non-empty.');
        }
        this.tools.set(name, { handler, metadata });
    }
    unregisterTool(name) {
        this.tools.delete(name);
    }
    listTools() {
        return [...this.tools.entries()].map(([name, tool]) => ({
            name,
            metadata: tool.metadata,
        }));
    }
    async handleRequest(request) {
        try {
            const result = request.type === 'ping' ? { pong: true } : await this.callTool(request);
            return {
                type: 'response',
                id: request.id,
                ok: true,
                result,
            };
        }
        catch (error) {
            const code = error instanceof Error && error.name === 'EmbodiedControlBusyError'
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
    async callTool(request) {
        const tool = this.tools.get(request.name);
        if (!tool) {
            throw new Error(`RemoteControl tool not found: ${request.name}`);
        }
        return tool.handler(request.args, { request });
    }
    registerBuiltInTools() {
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
