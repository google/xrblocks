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
function isCommandMessage(value) {
    if (!value || typeof value !== 'object')
        return false;
    const type = value.type;
    return (type === 'STEP' ||
        type === 'TELEPORT_TO' ||
        type === 'LOOK_AT_TARGET' ||
        type === 'POINT_TO' ||
        type === 'REACH_TO' ||
        type === 'CLICK');
}
function parseRemoteControlMessage(data) {
    if (typeof data !== 'string') {
        throw new Error('Remote control messages must be JSON strings.');
    }
    return JSON.parse(data);
}

export { REMOTE_CONTROL_PROTOCOL_VERSION, createHandshake, isCommandMessage, parseRemoteControlMessage };
