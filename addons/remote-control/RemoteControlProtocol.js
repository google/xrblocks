const REMOTE_CONTROL_PROTOCOL_VERSION = 1;
function createHandshake() {
    return {
        type: 'HANDSHAKE',
        client: 'xrblocks-remote-control',
        version: REMOTE_CONTROL_PROTOCOL_VERSION,
        capabilities: {
            compoundControl: true,
            embodiedControl: true,
        },
    };
}
function isStepMessage(value) {
    if (!value || typeof value !== 'object')
        return false;
    const message = value;
    return message.type === 'STEP' && !!message.control;
}
function parseRemoteControlMessage(data) {
    if (typeof data !== 'string') {
        throw new Error('Remote control messages must be JSON strings.');
    }
    return JSON.parse(data);
}

export { REMOTE_CONTROL_PROTOCOL_VERSION, createHandshake, isStepMessage, parseRemoteControlMessage };
