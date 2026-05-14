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
export interface HandPose {
    /** True if the hand is being tracked this frame. */
    present: boolean;
    position: THREE.Vector3;
    quaternion: THREE.Quaternion;
    /** Optional joint positions in world space (length must be JOINTS_PER_HAND). */
    joints?: THREE.Vector3[];
}
export interface PoseSnapshot {
    head: {
        position: THREE.Vector3;
        quaternion: THREE.Quaternion;
    };
    hands: [HandPose, HandPose];
}
/**
 * Write a PoseSnapshot to bytes. Allocates a fresh ArrayBuffer per call —
 * cheap enough for 20Hz broadcasts; if you need lower allocation pressure,
 * reuse the returned buffer in the caller.
 */
export declare function encodePose(snapshot: PoseSnapshot): Uint8Array;
/** Read a PoseSnapshot from bytes. */
export declare function decodePose(bytes: Uint8Array): PoseSnapshot;
/** Browser-safe base64 encode for Uint8Array. */
export declare function bytesToBase64(bytes: Uint8Array): string;
export declare function base64ToBytes(b64: string): Uint8Array;
