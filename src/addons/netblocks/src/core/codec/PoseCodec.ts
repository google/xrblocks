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
import * as THREE from 'three';

const FLOAT_BYTES = 4;
const HEAD_BYTES = 7 * FLOAT_BYTES; // pos.xyz + quat.xyzw
const HAND_HEADER_BYTES = 1 + 7 * FLOAT_BYTES; // presence flag + wrist pose
const JOINTS_PER_HAND = 25;
const JOINT_AXIS_BYTES = 2;
const JOINT_QUANT_RANGE = 0.25; // ±25 cm around wrist
const JOINT_BLOB_BYTES = JOINTS_PER_HAND * 3 * JOINT_AXIS_BYTES; // 150
const MAX_HANDS = 2;

const POSE_BUFFER_BYTES =
  HEAD_BYTES + MAX_HANDS * (HAND_HEADER_BYTES + JOINT_BLOB_BYTES);

export interface HandPose {
  /** True if the hand is being tracked this frame. */
  present: boolean;
  position: THREE.Vector3;
  quaternion: THREE.Quaternion;
  /** Optional joint positions in world space (length must be JOINTS_PER_HAND). */
  joints?: THREE.Vector3[];
}

export interface PoseSnapshot {
  head: {position: THREE.Vector3; quaternion: THREE.Quaternion};
  hands: [HandPose, HandPose];
}

const _tmpQuat = new THREE.Quaternion();
const _tmpInvQuat = new THREE.Quaternion();
const _tmpVec = new THREE.Vector3();

function quantize(value: number, range: number): number {
  const clamped = Math.max(-range, Math.min(range, value));
  return Math.round((clamped / range) * 32767);
}

function dequantize(value: number, range: number): number {
  return (value / 32767) * range;
}

/**
 * Write a PoseSnapshot to bytes. Allocates a fresh ArrayBuffer per call —
 * cheap enough for 20Hz broadcasts; if you need lower allocation pressure,
 * reuse the returned buffer in the caller.
 */
export function encodePose(snapshot: PoseSnapshot): Uint8Array {
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
        } else {
          view.setInt16(off, 0, true);
          view.setInt16(off + 2, 0, true);
          view.setInt16(off + 4, 0, true);
        }
        off += 6;
      }
    } else {
      off += HAND_HEADER_BYTES - 1 + JOINT_BLOB_BYTES;
    }
  }
  return new Uint8Array(buf);
}

function writePose(
  view: DataView,
  off: number,
  position: THREE.Vector3,
  quaternion: THREE.Quaternion
): number {
  view.setFloat32(off, position.x, true);
  view.setFloat32(off + 4, position.y, true);
  view.setFloat32(off + 8, position.z, true);
  view.setFloat32(off + 12, quaternion.x, true);
  view.setFloat32(off + 16, quaternion.y, true);
  view.setFloat32(off + 20, quaternion.z, true);
  view.setFloat32(off + 24, quaternion.w, true);
  return off + 28;
}

function readPose(
  view: DataView,
  off: number
): {
  position: THREE.Vector3;
  quaternion: THREE.Quaternion;
  off: number;
} {
  const position = new THREE.Vector3(
    view.getFloat32(off, true),
    view.getFloat32(off + 4, true),
    view.getFloat32(off + 8, true)
  );
  const quaternion = new THREE.Quaternion(
    view.getFloat32(off + 12, true),
    view.getFloat32(off + 16, true),
    view.getFloat32(off + 20, true),
    view.getFloat32(off + 24, true)
  );
  return {position, quaternion, off: off + 28};
}

/** Read a PoseSnapshot from bytes. */
export function decodePose(bytes: Uint8Array): PoseSnapshot {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let off = 0;
  const head = readPose(view, off);
  off = head.off;
  const hands: HandPose[] = [];
  for (let h = 0; h < MAX_HANDS; h++) {
    const present = view.getUint8(off) === 1;
    off += 1;
    if (present) {
      const wrist = readPose(view, off);
      off = wrist.off;
      _tmpQuat.copy(wrist.quaternion);
      const joints: THREE.Vector3[] = [];
      for (let j = 0; j < JOINTS_PER_HAND; j++) {
        const local = new THREE.Vector3(
          dequantize(view.getInt16(off, true), JOINT_QUANT_RANGE),
          dequantize(view.getInt16(off + 2, true), JOINT_QUANT_RANGE),
          dequantize(view.getInt16(off + 4, true), JOINT_QUANT_RANGE)
        );
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
    } else {
      hands.push({
        present: false,
        position: new THREE.Vector3(),
        quaternion: new THREE.Quaternion(),
      });
      off += HAND_HEADER_BYTES - 1 + JOINT_BLOB_BYTES;
    }
  }
  return {
    head: {position: head.position, quaternion: head.quaternion},
    hands: [hands[0], hands[1]],
  };
}

// Keep the public codec exports while transports stay independent of three.js.
export {bytesToBase64, base64ToBytes} from './Base64';
