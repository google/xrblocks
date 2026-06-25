import { createHello, parseRemoteControlMessage, isRemoteControlResponse, REMOTE_CONTROL_DEFAULT_SESSION_ID } from './RemoteControlProtocol.js';
import { REMOTE_CONTROL_BUILT_IN_TOOL_NAMES } from './built-in-tools/Types.js';
import 'three';

const BUILT_IN_TOOLS = REMOTE_CONTROL_BUILT_IN_TOOL_NAMES;
function createRequestId() {
    if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
        return crypto.randomUUID();
    }
    return Math.random().toString(36).slice(2, 12);
}
class RemoteControlClient {
    constructor(options = {}) {
        this.pending = new Map();
        this.pageReady = false;
        this.waiters = [];
        this.onOpen = () => {
            this.ws?.send(JSON.stringify(createHello('client', this.sessionId)));
        };
        this.onMessage = (event) => {
            let message;
            try {
                message = parseRemoteControlMessage(event.data);
            }
            catch {
                return;
            }
            if (message &&
                typeof message === 'object' &&
                message.type === 'simulatorReady') {
                this.pageReady = true;
                for (const resolve of this.waiters.splice(0))
                    resolve();
                return;
            }
            if (!isRemoteControlResponse(message))
                return;
            const pending = this.pending.get(message.id);
            if (!pending)
                return;
            this.pending.delete(message.id);
            pending.resolve(message);
        };
        this.onClose = () => {
            for (const [, pending] of this.pending) {
                pending.reject(new Error('RemoteControlClient connection closed.'));
            }
            this.pending.clear();
        };
        if (typeof options === 'string') {
            this.url = options;
            this.sessionId = REMOTE_CONTROL_DEFAULT_SESSION_ID;
            this.WebSocketConstructor = WebSocket;
        }
        else {
            this.url = options.url ?? 'ws://127.0.0.1:8791';
            this.sessionId = options.sessionId ?? REMOTE_CONTROL_DEFAULT_SESSION_ID;
            this.WebSocketConstructor = options.WebSocketConstructor ?? WebSocket;
        }
    }
    connect() {
        this.ws = new this.WebSocketConstructor(this.url);
        this.ws.addEventListener('message', this.onMessage);
        this.ws.addEventListener('close', this.onClose);
        return new Promise((resolve, reject) => {
            const onOpen = () => {
                this.ws?.removeEventListener('open', onOpen);
                this.ws?.removeEventListener('error', onError);
                this.onOpen();
                resolve();
            };
            const onError = () => {
                this.ws?.removeEventListener('open', onOpen);
                this.ws?.removeEventListener('error', onError);
                reject(new Error('RemoteControlClient failed to connect.'));
            };
            this.ws?.addEventListener('open', onOpen);
            this.ws?.addEventListener('error', onError);
        });
    }
    close() {
        this.ws?.close();
        this.ws = undefined;
    }
    waitForPage() {
        if (this.pageReady)
            return Promise.resolve();
        return new Promise((resolve) => {
            this.waiters.push(resolve);
        });
    }
    /** @deprecated Use waitForPage(). */
    waitForSimulator() {
        return this.waitForPage();
    }
    step(step) {
        return this.callTool(BUILT_IN_TOOLS.step, step);
    }
    apply(control) {
        return this.callTool(BUILT_IN_TOOLS.applyControl, { control });
    }
    teleportTo(target, options) {
        return this.callTool(BUILT_IN_TOOLS.teleportTo, { target, options });
    }
    lookAtTarget(target, options) {
        return this.callTool(BUILT_IN_TOOLS.lookAtTarget, { target, options });
    }
    pointTo(handIndex, target, options) {
        return this.callTool(BUILT_IN_TOOLS.pointTo, { handIndex, target, options });
    }
    reachTo(handIndex, target, options) {
        return this.callTool(BUILT_IN_TOOLS.reachTo, { handIndex, target, options });
    }
    click(handIndex, options) {
        return this.callTool(BUILT_IN_TOOLS.click, { handIndex, options });
    }
    getCamera(args) {
        return this.callTool(BUILT_IN_TOOLS.getCamera, args ?? {});
    }
    getHands() {
        return this.callTool(BUILT_IN_TOOLS.getHands, {});
    }
    getScreenshot(args) {
        return this.callTool(BUILT_IN_TOOLS.getScreenshot, args ?? {});
    }
    getSimulatorState() {
        return this.callTool(BUILT_IN_TOOLS.getSimulatorState, {});
    }
    callTool(name, args) {
        return this.request({
            id: createRequestId(),
            type: 'callTool',
            name,
            args,
        });
    }
    ping() {
        return this.request({
            id: createRequestId(),
            type: 'ping',
        });
    }
    request(request) {
        if (this.ws?.readyState !== WebSocket.OPEN) {
            return Promise.reject(new Error('RemoteControlClient is not connected.'));
        }
        return new Promise((resolve, reject) => {
            this.pending.set(request.id, { resolve, reject });
            this.ws?.send(JSON.stringify(request));
        });
    }
}

export { RemoteControlClient };
