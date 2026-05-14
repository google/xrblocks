import * as THREE from 'three';
import { HandPose, PoseSnapshot } from '../codec/PoseCodec';
/** Public type re-exported by netblocks for consumer convenience. */
export type RemotePoseSnapshot = PoseSnapshot;
export type RemoteHandPose = HandPose;
/**
 * Snapshot of any remote peer at a given moment, bundled with derived
 * three.js objects useful for rendering avatars or attaching child meshes.
 */
export interface RemotePeerView {
    peerId: string;
    displayName?: string;
    /** True if we have at least one pose snapshot. */
    hasPose: boolean;
    /** Smoothed head pose (world space). */
    headPosition: THREE.Vector3;
    headQuaternion: THREE.Quaternion;
    /** Per-hand smoothed pose (world space). hands[h].present === false if untracked. */
    hands: [HandPose, HandPose];
    /** ms since the last received snapshot. */
    age: number;
}
export declare const _PRESENCETYPES_MODULE_ = true;
