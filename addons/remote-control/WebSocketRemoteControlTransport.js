import { createHello, REMOTE_CONTROL_DEFAULT_SESSION_ID, parseRemoteControlMessage, isRemoteControlRequest } from './RemoteControlProtocol.js';

class WebSocketRemoteControlTransport {
    constructor(options, handleRequest) {
        this.handleRequest = handleRequest;
        this.stopped = false;
        this.simulatorReady = false;
        this.onOpen = () => {
            if (this.simulatorReady) {
                this.send(createHello('simulator', this.sessionId));
            }
        };
        this.onMessage = (event) => {
            void this.handleMessage(event);
        };
        this.onClose = () => {
            if (!this.reconnect || this.stopped)
                return;
            this.reconnectTimer = window.setTimeout(() => {
                this.connect();
            }, this.reconnectDelayMs);
        };
        this.onError = () => {
            // Browser WebSocket implementations surface reconnect-relevant state on close.
        };
        this.url = options.url ?? 'ws://127.0.0.1:8791';
        this.sessionId = options.sessionId ?? REMOTE_CONTROL_DEFAULT_SESSION_ID;
        this.reconnect = options.reconnect ?? false;
        this.reconnectDelayMs = options.reconnectDelayMs ?? 1000;
    }
    connect() {
        this.stopped = false;
        this.ws = new WebSocket(this.url);
        this.ws.addEventListener('open', this.onOpen);
        this.ws.addEventListener('message', this.onMessage);
        this.ws.addEventListener('close', this.onClose);
        this.ws.addEventListener('error', this.onError);
    }
    disconnect() {
        this.stopped = true;
        if (this.reconnectTimer !== undefined) {
            window.clearTimeout(this.reconnectTimer);
            this.reconnectTimer = undefined;
        }
        this.ws?.close();
        this.ws = undefined;
    }
    announceSimulatorReady() {
        this.simulatorReady = true;
        this.send(createHello('simulator', this.sessionId));
    }
    async handleMessage(event) {
        let message;
        try {
            message = parseRemoteControlMessage(event.data);
        }
        catch (error) {
            this.sendError(undefined, 'parse_error', error);
            return;
        }
        if (!isRemoteControlRequest(message)) {
            this.sendError(message?.id, 'invalid_request', new Error('Invalid remote-control request payload'));
            return;
        }
        try {
            this.send(await this.handleRequest(message));
        }
        catch (error) {
            this.sendError(message.id, 'execution_error', error);
        }
    }
    send(message) {
        if (this.ws?.readyState !== WebSocket.OPEN)
            return;
        this.ws.send(JSON.stringify(message));
    }
    sendError(id, code, error) {
        this.send({
            type: 'response',
            id: id ?? '',
            ok: false,
            error: {
                code,
                message: error instanceof Error ? error.message : String(error),
            },
        });
    }
}

export { WebSocketRemoteControlTransport };
