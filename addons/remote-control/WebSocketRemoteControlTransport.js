import { createHandshake, parseRemoteControlMessage, isCommandMessage } from './RemoteControlProtocol.js';

class WebSocketRemoteControlTransport {
    constructor(options, handleCommand) {
        this.handleCommand = handleCommand;
        this.stopped = false;
        this.onOpen = () => {
            this.send(createHandshake());
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
            // The close event carries reconnect behavior; errors are reported there by
            // browser WebSocket implementations.
        };
        this.url = options.url ?? 'ws://127.0.0.1:8765';
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
    async handleMessage(event) {
        let message;
        try {
            message = parseRemoteControlMessage(event.data);
        }
        catch (error) {
            this.sendError(undefined, error);
            return;
        }
        if (!isCommandMessage(message)) {
            this.sendError(message?.id, new Error('Invalid message payload'));
            return;
        }
        try {
            const result = await this.handleCommand(message);
            this.send({
                type: 'STEP_COMPLETED',
                ...result,
            });
        }
        catch (error) {
            if (error instanceof Error && error.name === 'EmbodiedControlBusyError') {
                this.send({
                    type: 'ACTION_REJECTED',
                    id: message.id,
                    reason: 'active_step',
                });
            }
            else {
                this.sendError(message.id, error);
            }
        }
    }
    send(message) {
        if (this.ws?.readyState !== WebSocket.OPEN)
            return;
        this.ws.send(JSON.stringify(message));
    }
    sendError(id, error) {
        this.send({
            type: 'ERROR',
            id,
            message: error instanceof Error ? error.message : String(error),
        });
    }
}

export { WebSocketRemoteControlTransport };
