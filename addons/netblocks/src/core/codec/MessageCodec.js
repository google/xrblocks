import { MAX_MESSAGE_BYTES, NET_PROTOCOL_VERSION } from '../constants/NetConstants.js';

/**
 * Wire message types used by netblocks. Every frame on the wire is a tagged
 * union so that transports stay completely agnostic to payload shape.
 *
 * The protocol is intentionally simple JSON-over-bytes (encoded with
 * TextEncoder). The pose channel uses a binary subprotocol (see PoseCodec)
 * and is wrapped in a `pose` envelope so transports can still treat the frame
 * as opaque bytes.
 */
const encoder = new TextEncoder();
const decoder = new TextDecoder();
/**
 * Encode a NetMessage as bytes. The on-the-wire format is JSON for the
 * envelope; pose payloads are pre-encoded as base64 inside `data`.
 */
function encodeMessage(msg) {
    return encoder.encode(JSON.stringify(msg));
}
function decodeMessage(data) {
    // Guard against oversized payloads before we allocate a string for them
    // — a malicious peer could otherwise send 100MB of JSON and OOM every
    // recipient. The cap is generous (well above any legitimate netblocks
    // frame); see MAX_MESSAGE_BYTES.
    const byteLen = typeof data === 'string'
        ? data.length
        : data instanceof ArrayBuffer
            ? data.byteLength
            : data.byteLength;
    if (byteLen > MAX_MESSAGE_BYTES) {
        throw new Error(`netblocks: message exceeds MAX_MESSAGE_BYTES (${byteLen} > ${MAX_MESSAGE_BYTES}).`);
    }
    const text = typeof data === 'string'
        ? data
        : decoder.decode(data instanceof ArrayBuffer ? new Uint8Array(data) : data);
    const parsed = JSON.parse(text);
    return parsed;
}
function makeHello(displayName, capabilities, role) {
    return {
        type: 'hello',
        protocol: NET_PROTOCOL_VERSION,
        displayName,
        role,
        capabilities,
    };
}

export { decodeMessage, encodeMessage, makeHello };
