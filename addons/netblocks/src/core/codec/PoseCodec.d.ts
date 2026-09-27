import * as THREE from "three";
//#region src/addons/netblocks/src/core/codec/PoseCodec.d.ts
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
//#endregion