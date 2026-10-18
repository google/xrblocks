import { base64ToBytes, bytesToBase64 } from "./Base64.js";
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
//#endregion
export { base64ToBytes, bytesToBase64 };