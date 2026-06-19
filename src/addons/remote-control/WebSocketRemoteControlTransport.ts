import type {EmbodiedControlStepResult} from '../embodied-control';

import {
  createHandshake,
  isCommandMessage,
  parseRemoteControlMessage,
  type RemoteControlOutgoingMessage,
  type RemoteControlMessage,
} from './RemoteControlProtocol';

export type WebSocketRemoteControlTransportOptions = {
  url?: string;
  reconnect?: boolean;
  reconnectDelayMs?: number;
};

export type RemoteControlCommandHandler = (
  command: RemoteControlMessage
) => Promise<EmbodiedControlStepResult>;

export class WebSocketRemoteControlTransport {
  private ws?: WebSocket;
  private stopped = false;
  private reconnectTimer?: number;
  private readonly url: string;
  private readonly reconnect: boolean;
  private readonly reconnectDelayMs: number;

  constructor(
    options: WebSocketRemoteControlTransportOptions,
    private handleCommand: RemoteControlCommandHandler
  ) {
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

  private onOpen = () => {
    this.send(createHandshake());
  };

  private onMessage = (event: MessageEvent) => {
    void this.handleMessage(event);
  };

  private async handleMessage(event: MessageEvent) {
    let message: unknown;
    try {
      message = parseRemoteControlMessage(event.data);
    } catch (error) {
      this.sendError(undefined, error);
      return;
    }

    if (!isCommandMessage(message)) {
      this.sendError(
        (message as {id?: string} | undefined)?.id,
        new Error('Invalid message payload')
      );
      return;
    }

    try {
      const result = await this.handleCommand(message);
      this.send({
        type: 'STEP_COMPLETED',
        ...result,
      });
    } catch (error) {
      if (error instanceof Error && error.name === 'EmbodiedControlBusyError') {
        this.send({
          type: 'ACTION_REJECTED',
          id: message.id,
          reason: 'active_step',
        });
      } else {
        this.sendError(message.id, error);
      }
    }
  }

  private onClose = () => {
    if (!this.reconnect || this.stopped) return;
    this.reconnectTimer = window.setTimeout(() => {
      this.connect();
    }, this.reconnectDelayMs);
  };

  private onError = () => {
    // The close event carries reconnect behavior; errors are reported there by
    // browser WebSocket implementations.
  };

  private send(message: RemoteControlOutgoingMessage) {
    if (this.ws?.readyState !== WebSocket.OPEN) return;
    this.ws.send(JSON.stringify(message));
  }

  private sendError(id: string | undefined, error: unknown) {
    this.send({
      type: 'ERROR',
      id,
      message: error instanceof Error ? error.message : String(error),
    });
  }
}
