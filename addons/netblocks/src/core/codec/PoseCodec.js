import * as THREE from 'three';

/**
 * Compact binary encoding for a single user's pose snapshot.
 *
 * A snapshot contains:
 *   - head transform   (pos: 3 floats, rot: 4 floats)        = 28 bytes
 *   - up to 2 hands    (each: pose + per-joint quantized data)
 *
 * For each hand we encode a presence bit, a wrist pose (28 bytes), and an
 * optional 25-joint relative-position blob (75 int16s = 150 bytes,
 * quantized to ±0.25 m around the wrist with 1/65535 resolution).
 *
 * The encoded payload is wrapped as base64 and sent inside a PoseMessage so
 * that JSON-only transports (e.g. WebSocket text frames) stay compatible.
 */
const FLOAT_BYTES = 4;
const HEAD_BYTES = 7 * FLOAT_BYTES; // pos.xyz + quat.xyzw
const HAND_HEADER_BYTES = 1 + 7 * FLOAT_BYTES; // presence flag + wrist pose
const JOINTS_PER_HAND = 25;
const JOINT_AXIS_BYTES = 2;
const JOINT_QUANT_RANGE = 0.25; // ±25 cm around wrist
const JOINT_BLOB_BYTES = JOINTS_PER_HAND * 3 * JOINT_AXIS_BYTES; // 150
const MAX_HANDS = 2;
const POSE_BUFFER_BYTES = HEAD_BYTES + MAX_HANDS * (HAND_HEADER_BYTES + JOINT_BLOB_BYTES);
const _tmpQuat = new THREE.Quaternion();
const _tmpInvQuat = new THREE.Quaternion();
const _tmpVec = new THREE.Vector3();
function quantize(value, range) {
    const clamped = Math.max(-range, Math.min(range, value));
    return Math.round((clamped / range) * 32767);
}
function dequantize(value, range) {
    return (value / 32767) * range;
}
/**
 * Write a PoseSnapshot to bytes. Allocates a fresh ArrayBuffer per call —
 * cheap enough for 20Hz broadcasts; if you need lower allocation pressure,
 * reuse the returned buffer in the caller.
 */
function encodePose(snapshot) {
    const buf = new ArrayBuffer(POSE_BUFFER_BYTES);
    const view = new DataView(buf);
    let off = 0;
    // Head pose
    off = writePose(view, off, snapshot.head.position, snapshot.head.quaternion);
    // Hands
    for (let h = 0; h < MAX_HANDS; h++) {
        const hand = snapshot.hands[h];
        view.setUint8(off, hand?.present ? 1 : 0);
        off += 1;
        if (hand?.present) {
            off = writePose(view, off, hand.position, hand.quaternion);
            // Joints are encoded relative to the wrist in wrist-local space.
            _tmpInvQuat.copy(hand.quaternion).invert();
            for (let j = 0; j < JOINTS_PER_HAND; j++) {
                const joint = hand.joints && hand.joints[j];
                if (joint) {
                    _tmpVec.copy(joint).sub(hand.position).applyQuaternion(_tmpInvQuat);
                    view.setInt16(off, quantize(_tmpVec.x, JOINT_QUANT_RANGE), true);
                    view.setInt16(off + 2, quantize(_tmpVec.y, JOINT_QUANT_RANGE), true);
                    view.setInt16(off + 4, quantize(_tmpVec.z, JOINT_QUANT_RANGE), true);
                }
                else {
                    view.setInt16(off, 0, true);
                    view.setInt16(off + 2, 0, true);
                    view.setInt16(off + 4, 0, true);
                }
                off += 6;
            }
        }
        else {
            off += HAND_HEADER_BYTES - 1 + JOINT_BLOB_BYTES;
        }
    }
    return new Uint8Array(buf);
}
function writePose(view, off, position, quaternion) {
    view.setFloat32(off, position.x, true);
    view.setFloat32(off + 4, position.y, true);
    view.setFloat32(off + 8, position.z, true);
    view.setFloat32(off + 12, quaternion.x, true);
    view.setFloat32(off + 16, quaternion.y, true);
    view.setFloat32(off + 20, quaternion.z, true);
    view.setFloat32(off + 24, quaternion.w, true);
    return off + 28;
}
function readPose(view, off) {
    const position = new THREE.Vector3(view.getFloat32(off, true), view.getFloat32(off + 4, true), view.getFloat32(off + 8, true));
    const quaternion = new THREE.Quaternion(view.getFloat32(off + 12, true), view.getFloat32(off + 16, true), view.getFloat32(off + 20, true), view.getFloat32(off + 24, true));
    return { position, quaternion, off: off + 28 };
}
/** Read a PoseSnapshot from bytes. */
function decodePose(bytes) {
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    let off = 0;
    const head = readPose(view, off);
    off = head.off;
    const hands = [];
    for (let h = 0; h < MAX_HANDS; h++) {
        const present = view.getUint8(off) === 1;
        off += 1;
        if (present) {
            const wrist = readPose(view, off);
            off = wrist.off;
            _tmpQuat.copy(wrist.quaternion);
            const joints = [];
            for (let j = 0; j < JOINTS_PER_HAND; j++) {
                const local = new THREE.Vector3(dequantize(view.getInt16(off, true), JOINT_QUANT_RANGE), dequantize(view.getInt16(off + 2, true), JOINT_QUANT_RANGE), dequantize(view.getInt16(off + 4, true), JOINT_QUANT_RANGE));
                local.applyQuaternion(_tmpQuat).add(wrist.position);
                joints.push(local);
                off += 6;
            }
            hands.push({
                present: true,
                position: wrist.position,
                quaternion: wrist.quaternion,
                joints,
            });
        }
        else {
            hands.push({
                present: false,
                position: new THREE.Vector3(),
                quaternion: new THREE.Quaternion(),
            });
            off += HAND_HEADER_BYTES - 1 + JOINT_BLOB_BYTES;
        }
    }
    return {
        head: { position: head.position, quaternion: head.quaternion },
        hands: [hands[0], hands[1]],
    };
}
const B64_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
/** Browser-safe base64 encode for Uint8Array. */
function bytesToBase64(bytes) {
    let out = '';
    let i = 0;
    for (; i + 3 <= bytes.length; i += 3) {
        const a = bytes[i];
        const b = bytes[i + 1];
        const c = bytes[i + 2];
        out +=
            B64_CHARS[a >> 2] +
                B64_CHARS[((a & 0x03) << 4) | (b >> 4)] +
                B64_CHARS[((b & 0x0f) << 2) | (c >> 6)] +
                B64_CHARS[c & 0x3f];
    }
    const rem = bytes.length - i;
    if (rem === 1) {
        const a = bytes[i];
        out += B64_CHARS[a >> 2] + B64_CHARS[(a & 0x03) << 4] + '==';
    }
    else if (rem === 2) {
        const a = bytes[i];
        const b = bytes[i + 1];
        out +=
            B64_CHARS[a >> 2] +
                B64_CHARS[((a & 0x03) << 4) | (b >> 4)] +
                B64_CHARS[(b & 0x0f) << 2] +
                '=';
    }
    return out;
}
const B64_LOOKUP = (() => {
    const t = new Int16Array(128).fill(-1);
    for (let i = 0; i < B64_CHARS.length; i++)
        t[B64_CHARS.charCodeAt(i)] = i;
    return t;
})();
function base64ToBytes(b64) {
    const clean = b64.replace(/=+$/, '');
    const len = (clean.length * 3) >> 2;
    const bytes = new Uint8Array(len);
    let p = 0;
    for (let i = 0; i < clean.length; i += 4) {
        const a = B64_LOOKUP[clean.charCodeAt(i)];
        const b = B64_LOOKUP[clean.charCodeAt(i + 1)];
        const c = B64_LOOKUP[clean.charCodeAt(i + 2)];
        const d = B64_LOOKUP[clean.charCodeAt(i + 3)];
        // The first two sextets are required for any output byte. If the
        // input contains a non-base64 char in those slots the lookup is -1
        // and we'd silently emit garbage; bail instead so callers can see
        // decode failures.
        if (a === -1 || b === -1) {
            throw new Error('base64ToBytes: invalid character in input.');
        }
        if (p < len)
            bytes[p++] = (a << 2) | (b >> 4);
        if (p < len && c !== -1)
            bytes[p++] = ((b & 0x0f) << 4) | (c >> 2);
        if (p < len && d !== -1)
            bytes[p++] = ((c & 0x03) << 6) | d;
    }
    return bytes;
}

export { base64ToBytes, bytesToBase64, decodePose, encodePose };
