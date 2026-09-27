import { MAX_MESSAGE_BYTES } from "../constants/NetConstants.js";
//#region src/addons/netblocks/src/core/codec/MessageCodec.ts
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
	const byteLen = typeof data === "string" ? data.length : data instanceof ArrayBuffer ? data.byteLength : data.byteLength;
	if (byteLen > 6e4) throw new Error(`netblocks: message exceeds MAX_MESSAGE_BYTES (${byteLen} > ${MAX_MESSAGE_BYTES}).`);
	const text = typeof data === "string" ? data : decoder.decode(data instanceof ArrayBuffer ? new Uint8Array(data) : data);
	return JSON.parse(text);
}
function makeHello(displayName, capabilities, role) {
	return {
		type: "hello",
		protocol: 1,
		displayName,
		role,
		capabilities
	};
}
//#endregion
export { decodeMessage, encodeMessage, makeHello };
