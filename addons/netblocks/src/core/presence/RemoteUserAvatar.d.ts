/**
 * RemoteUserAvatar: a lightweight three.js Group that visualizes a remote
 * peer using a head sphere and two hand "stick" meshes (wrist sphere +
 * up-to-five fingertip dots). It renders nothing if no pose has arrived.
 *
 * The avatar is intentionally minimal — netblocks ships a baseline that
 * works in every sample, and apps can opt into richer avatars by hiding
 * the default mesh (`avatar.defaultMesh.visible = false`) and parenting
 * their own meshes to `avatar.headPivot` / `avatar.handPivots[h]`.
 */
import * as THREE from 'three';
import { InterpolatedPose } from './InterpolatedPose';
/**
 * Eight well-separated colors so two peers in the same room are easy to
 * tell apart at a glance. Hashing into a continuous hue space ended up
 * producing peers with near-identical hues too often (e.g., two adjacent
 * blues) — a discrete palette makes "who is who" obvious. Exported so
 * apps can match other UI (chat sender names, etc.) to the avatar color.
 */
export declare const AVATAR_PALETTE: number[];
export interface RemoteUserAvatarOptions {
    peerId: string;
    displayName?: string;
}
export declare class RemoteUserAvatar extends THREE.Group {
    readonly peerId: string;
    private _displayName?;
    get displayName(): string | undefined;
    set displayName(name: string | undefined);
    /** Smoothed pose buffer fed by NetSession. */
    readonly pose: InterpolatedPose;
    /** Per-peer color derived from peerId, used to tint the default avatar. */
    readonly color: THREE.Color;
    /**
     * Subgroups consumers can re-parent custom meshes under to follow the
     * remote head / hand pose without touching netblocks internals.
     */
    readonly headPivot: THREE.Group<THREE.Object3DEventMap>;
    readonly handPivots: [THREE.Group, THREE.Group];
    /** The default ball-and-stick avatar group. Hide to use your own meshes. */
    readonly defaultMesh: THREE.Group<THREE.Object3DEventMap>;
    private _headSphere;
    private _handGroups;
    private _wristSpheres;
    private _fingertipDots;
    private _nameLabel?;
    private _nameLabelText;
    constructor(opts: RemoteUserAvatarOptions);
    private _initNameLabel;
    /** Sample the smoothed pose at `now` and update the local meshes. */
    applyPose(nowMs: number): void;
    /** Update the displayed name; safe to call before troika finishes loading. */
    setDisplayName(name: string | undefined): void;
    private _labelString;
    dispose(): void;
}
