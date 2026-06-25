const REMOTE_CONTROL_PROTOCOL_VERSION = 1;
const REMOTE_CONTROL_CLIENT_NAME = 'xrblocks-remote-control';
const REMOTE_CONTROL_DEFAULT_SESSION_ID = 'default';
function createHello(role = 'simulator', sessionId = REMOTE_CONTROL_DEFAULT_SESSION_ID) {
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
function isRemoteControlRequest(value) {
    if (!value || typeof value !== 'object')
        return false;
    const message = value;
    if (typeof message.id !== 'string' || typeof message.type !== 'string') {
        return false;
    }
    return message.type === 'ping' || message.type === 'callTool';
}
function isRemoteControlResponse(value) {
    return (!!value &&
        typeof value === 'object' &&
        value.type === 'response' &&
        typeof value.id === 'string');
}
function parseRemoteControlMessage(data) {
    if (typeof data !== 'string') {
        throw new Error('Remote control messages must be JSON strings.');
    }
    return JSON.parse(data);
}

export { REMOTE_CONTROL_CLIENT_NAME, REMOTE_CONTROL_DEFAULT_SESSION_ID, REMOTE_CONTROL_PROTOCOL_VERSION, createHello, isRemoteControlRequest, isRemoteControlResponse, parseRemoteControlMessage };
