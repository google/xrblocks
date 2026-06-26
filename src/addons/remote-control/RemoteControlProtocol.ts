export const REMOTE_CONTROL_PROTOCOL_VERSION = 1;
export const REMOTE_CONTROL_CLIENT_NAME = 'xrblocks-remote-control';
export const REMOTE_CONTROL_DEFAULT_SESSION_ID = 'default';

export type RemoteControlRole = 'simulator' | 'client';

export type RemoteControlToolMetadata = {
  description?: string;
  parameters?: unknown;
};

export type RemoteControlToolContext = {
  request: RemoteControlCallToolRequest;
};

export type RemoteControlToolHandler = (
  args: unknown,
  context: RemoteControlToolContext
) => unknown | Promise<unknown>;

export type RemoteControlHelloMessage = {
  type: 'hello';
  role: RemoteControlRole;
  sessionId?: string;
  protocolVersion: number;
  client?: typeof REMOTE_CONTROL_CLIENT_NAME;
  capabilities?: {
    compoundControl?: boolean;
    embodiedControl?: boolean;
    tools?: boolean;
  };
};

export type RemoteControlPingRequest = {
  id: string;
  type: 'ping';
};

export type RemoteControlCallToolRequest = {
  id: string;
  type: 'callTool';
  name: string;
  args?: unknown;
};

export type RemoteControlRequest =
  | RemoteControlPingRequest
  | RemoteControlCallToolRequest;

export type RemoteControlResponse = {
  type: 'response';
  id: string;
  ok: boolean;
  result?: unknown;
  error?: {
    code: string;
    message: string;
  };
};

export type RemoteControlSimulatorReadyMessage = {
  type: 'simulatorReady';
};

export type RemoteControlIncomingMessage =
  | RemoteControlHelloMessage
  | RemoteControlRequest
  | RemoteControlResponse
  | RemoteControlSimulatorReadyMessage;

export type RemoteControlOutgoingMessage =
  | RemoteControlHelloMessage
  | RemoteControlResponse
  | RemoteControlSimulatorReadyMessage;

export function createHello(
  role: RemoteControlRole = 'simulator',
  sessionId: string = REMOTE_CONTROL_DEFAULT_SESSION_ID
): RemoteControlHelloMessage {
  return {
    type: 'hello',
    role,
    sessionId,
    protocolVersion: REMOTE_CONTROL_PROTOCOL_VERSION,
    client: REMOTE_CONTROL_CLIENT_NAME,
    capabilities: {
      compoundControl: true,
      embodiedControl: true,
      tools: true,
    },
  };
}

export function isRemoteControlRequest(
  value: unknown
): value is RemoteControlRequest {
  if (!value || typeof value !== 'object') return false;
  const message = value as {id?: unknown; type?: unknown};
  if (typeof message.id !== 'string' || typeof message.type !== 'string') {
    return false;
  }
  return message.type === 'ping' || message.type === 'callTool';
}

export function isRemoteControlResponse(
  value: unknown
): value is RemoteControlResponse {
  return (
    !!value &&
    typeof value === 'object' &&
    (value as {type?: unknown}).type === 'response' &&
    typeof (value as {id?: unknown}).id === 'string'
  );
}

export function parseRemoteControlMessage(data: MessageEvent['data']): unknown {
  if (typeof data !== 'string') {
    throw new Error('Remote control messages must be JSON strings.');
  }
  return JSON.parse(data);
}
