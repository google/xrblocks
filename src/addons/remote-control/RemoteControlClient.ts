import {
  createHello,
  REMOTE_CONTROL_DEFAULT_SESSION_ID,
  isRemoteControlResponse,
  parseRemoteControlMessage,
  type RemoteControlCallToolRequest,
  type RemoteControlRequest,
  type RemoteControlResponse,
} from './RemoteControlProtocol';
import type {EmbodiedControlStep, XRCompoundControl} from '../embodied-control';
import {
  REMOTE_CONTROL_BUILT_IN_TOOL_NAMES,
  type RemoteControlCameraToolArgs,
  type RemoteControlClickToolArgs,
  type RemoteControlLookAtTargetToolArgs,
  type RemoteControlPointToToolArgs,
  type RemoteControlReachToToolArgs,
  type RemoteControlScreenshotToolArgs,
  type RemoteControlTarget,
  type RemoteControlTeleportToToolArgs,
} from './built-in-tools';

const BUILT_IN_TOOLS = REMOTE_CONTROL_BUILT_IN_TOOL_NAMES;

type PendingRequest = {
  resolve: (response: RemoteControlResponse) => void;
  reject: (reason?: unknown) => void;
};

export type RemoteControlClientOptions = {
  url?: string;
  sessionId?: string;
  WebSocketConstructor?: typeof WebSocket;
};

function createRequestId() {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID();
  }
  return Math.random().toString(36).slice(2, 12);
}

export class RemoteControlClient {
  private ws?: WebSocket;
  private pending = new Map<string, PendingRequest>();
  private pageReady = false;
  private waiters: Array<() => void> = [];
  private readonly url: string;
  private readonly sessionId: string;
  private readonly WebSocketConstructor: typeof WebSocket;

  constructor(options: string | RemoteControlClientOptions = {}) {
    if (typeof options === 'string') {
      this.url = options;
      this.sessionId = REMOTE_CONTROL_DEFAULT_SESSION_ID;
      this.WebSocketConstructor = WebSocket;
    } else {
      this.url = options.url ?? 'ws://127.0.0.1:8791';
      this.sessionId = options.sessionId ?? REMOTE_CONTROL_DEFAULT_SESSION_ID;
      this.WebSocketConstructor = options.WebSocketConstructor ?? WebSocket;
    }
  }

  connect(): Promise<void> {
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

  waitForPage(): Promise<void> {
    if (this.pageReady) return Promise.resolve();
    return new Promise((resolve) => {
      this.waiters.push(resolve);
    });
  }

  /** @deprecated Use waitForPage(). */
  waitForSimulator(): Promise<void> {
    return this.waitForPage();
  }

  step(step: EmbodiedControlStep) {
    return this.callTool(BUILT_IN_TOOLS.step, step);
  }

  apply(control: XRCompoundControl) {
    return this.callTool(BUILT_IN_TOOLS.applyControl, {control});
  }

  teleportTo(
    target: RemoteControlTarget,
    options?: RemoteControlTeleportToToolArgs['options']
  ) {
    return this.callTool(BUILT_IN_TOOLS.teleportTo, {target, options});
  }

  lookAtTarget(
    target: RemoteControlTarget,
    options?: RemoteControlLookAtTargetToolArgs['options']
  ) {
    return this.callTool(BUILT_IN_TOOLS.lookAtTarget, {target, options});
  }

  pointTo(
    handIndex: number,
    target: RemoteControlTarget,
    options?: RemoteControlPointToToolArgs['options']
  ) {
    return this.callTool(BUILT_IN_TOOLS.pointTo, {handIndex, target, options});
  }

  reachTo(
    handIndex: number,
    target: RemoteControlTarget,
    options?: RemoteControlReachToToolArgs['options']
  ) {
    return this.callTool(BUILT_IN_TOOLS.reachTo, {handIndex, target, options});
  }

  click(
    handIndex?: RemoteControlClickToolArgs['handIndex'],
    options?: RemoteControlClickToolArgs['options']
  ) {
    return this.callTool(BUILT_IN_TOOLS.click, {handIndex, options});
  }

  getCamera(args?: RemoteControlCameraToolArgs) {
    return this.callTool(BUILT_IN_TOOLS.getCamera, args ?? {});
  }

  getHands() {
    return this.callTool(BUILT_IN_TOOLS.getHands, {});
  }

  getScreenshot(args?: RemoteControlScreenshotToolArgs) {
    return this.callTool(BUILT_IN_TOOLS.getScreenshot, args ?? {});
  }

  getSimulatorState() {
    return this.callTool(BUILT_IN_TOOLS.getSimulatorState, {});
  }

  callTool(name: string, args?: unknown) {
    return this.request({
      id: createRequestId(),
      type: 'callTool',
      name,
      args,
    } satisfies RemoteControlCallToolRequest);
  }

  ping() {
    return this.request({
      id: createRequestId(),
      type: 'ping',
    });
  }

  request(request: RemoteControlRequest): Promise<RemoteControlResponse> {
    if (this.ws?.readyState !== WebSocket.OPEN) {
      return Promise.reject(new Error('RemoteControlClient is not connected.'));
    }

    return new Promise((resolve, reject) => {
      this.pending.set(request.id, {resolve, reject});
      this.ws?.send(JSON.stringify(request));
    });
  }

  private onOpen = () => {
    this.ws?.send(JSON.stringify(createHello('client', this.sessionId)));
  };

  private onMessage = (event: MessageEvent) => {
    let message: unknown;
    try {
      message = parseRemoteControlMessage(event.data);
    } catch {
      return;
    }

    if (
      message &&
      typeof message === 'object' &&
      (message as {type?: string}).type === 'simulatorReady'
    ) {
      this.pageReady = true;
      for (const resolve of this.waiters.splice(0)) resolve();
      return;
    }

    if (!isRemoteControlResponse(message)) return;
    const pending = this.pending.get(message.id);
    if (!pending) return;
    this.pending.delete(message.id);
    pending.resolve(message);
  };

  private onClose = () => {
    for (const [, pending] of this.pending) {
      pending.reject(new Error('RemoteControlClient connection closed.'));
    }
    this.pending.clear();
  };
}
