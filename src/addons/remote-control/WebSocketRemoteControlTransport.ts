import {
  createHello,
  REMOTE_CONTROL_DEFAULT_SESSION_ID,
  isRemoteControlRequest,
  parseRemoteControlMessage,
  type RemoteControlOutgoingMessage,
  type RemoteControlRequest,
  type RemoteControlResponse,
} from './RemoteControlProtocol';

export type WebSocketRemoteControlTransportOptions = {
  url?: string;
  sessionId?: string;
  reconnect?: boolean;
  reconnectDelayMs?: number;
};

export type RemoteControlCommandHandler = (
  command: RemoteControlRequest
) => Promise<RemoteControlResponse>;

export class WebSocketRemoteControlTransport {
  private ws?: WebSocket;
  private stopped = false;
  private reconnectTimer?: number;
  private readonly url: string;
  private readonly sessionId: string;
  private readonly reconnect: boolean;
  private readonly reconnectDelayMs: number;
  private simulatorReady = false;

  constructor(
    options: WebSocketRemoteControlTransportOptions,
    private handleRequest: RemoteControlCommandHandler
  ) {
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

  private onOpen = () => {
    if (this.simulatorReady) {
      this.send(createHello('simulator', this.sessionId));
    }
  };

  private onMessage = (event: MessageEvent) => {
    void this.handleMessage(event);
  };

  private async handleMessage(event: MessageEvent) {
    let message: unknown;
    try {
      message = parseRemoteControlMessage(event.data);
    } catch (error) {
      this.sendError(undefined, 'parse_error', error);
      return;
    }

    if (!isRemoteControlRequest(message)) {
      this.sendError(
        (message as {id?: string} | undefined)?.id,
        'invalid_request',
        new Error('Invalid remote-control request payload')
      );
      return;
    }

    try {
      this.send(await this.handleRequest(message));
    } catch (error) {
      this.sendError(message.id, 'execution_error', error);
    }
  }

  private onClose = () => {
    if (!this.reconnect || this.stopped) return;
    this.reconnectTimer = window.setTimeout(() => {
      this.connect();
    }, this.reconnectDelayMs);
  };

  private onError = () => {
    // Browser WebSocket implementations surface reconnect-relevant state on close.
  };

  private send(message: RemoteControlOutgoingMessage) {
    if (this.ws?.readyState !== WebSocket.OPEN) return;
    this.ws.send(JSON.stringify(message));
  }

  private sendError(id: string | undefined, code: string, error: unknown) {
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
