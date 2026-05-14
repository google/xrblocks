/**
 * SpatialVoice: maps each remote peer to a `THREE.PositionalAudio` node
 * parented to that peer's RemoteUserAvatar head pivot, so their voice
 * spatializes with their position. The local microphone capture and the
 * RTCPeerConnection wiring lives in VoiceChat — SpatialVoice is the
 * "render layer" that places remote audio in 3D.
 *
 * This class is mostly a thin three.js wrapper, kept separate so apps can
 * swap in custom HRTF panners or attach a UI volume slider without
 * monkey-patching VoiceChat.
 */
import * as THREE from 'three';
export interface SpatialVoiceOptions {
    /** Reference distance (m) at which volume is 1.0. */
    refDistance?: number;
    /** Distance model rolloff factor. */
    rolloffFactor?: number;
    /** Maximum distance after which audio attenuation stops decreasing. */
    maxDistance?: number;
}
export declare class SpatialVoice {
    readonly listener: THREE.AudioListener;
    private _byPeer;
    private _primersByPeer;
    private _opts;
    /**
     * @param listener - The shared `THREE.AudioListener` to spatialize against —
     *   typically `xb.core.sound.listener`, which CoreSound has already attached
     *   to the camera. SpatialVoice does NOT take ownership: it never adds or
     *   removes the listener from the scene, so disposing SpatialVoice leaves
     *   CoreSound's audio path untouched.
     */
    constructor(listener: THREE.AudioListener, opts?: SpatialVoiceOptions);
    /**
     * Attach a MediaStream to a peer; (re-)creates the PositionalAudio node and
     * parents it to `parent` (typically the remote user's headPivot).
     */
    attach(peerId: string, parent: THREE.Object3D, stream: MediaStream): void;
    detach(peerId: string): void;
    dispose(): void;
}
