/**
 * VoiceChat: opens a microphone, negotiates an audio-only RTCPeerConnection
 * with each remote peer, and reports the inbound `MediaStream` so
 * SpatialVoice can attach it to the corresponding RemoteUserAvatar.
 *
 * Signaling rides on top of the netblocks data plane: NetSession routes
 * VoiceSignalMessages to `_handleSignal()` and we call `_send()` to push
 * SDP/ICE back. This means voice works over **any** transport — including
 * BroadcastChannel — even though the actual audio always flows directly
 * between browsers via WebRTC.
 *
 * This class is opt-in. Calling `enable()` requests microphone permission
 * and starts negotiating with currently-connected peers; `disable()`
 * tears it all down.
 */
import { VoiceSignalMessage } from '../codec/MessageCodec';
export type VoiceTrackHandler = (peerId: string, stream: MediaStream) => void;
export type VoiceTrackRemovedHandler = (peerId: string) => void;
export interface VoiceChatOptions {
    iceServers?: RTCIceServer[];
    /** Constraints passed to getUserMedia.audio. */
    audioConstraints?: MediaTrackConstraints | true;
    /**
     * Fired when the local user's voice is enabled or disabled. NetSession
     * uses this to broadcast the intent over the data channel so other
     * peers can show a reliable "in voice chat" affordance that doesn't
     * depend on browser-specific WebRTC track events.
     */
    onLocalStateChange?: (enabled: boolean) => void;
}
export type VoiceSendFn = (msg: VoiceSignalMessage) => void;
export declare class VoiceChat {
    private _opts;
    private _send;
    private _onTrack;
    private _onTrackRemoved;
    private _localStream?;
    private _peers;
    private _enabled;
    private _localId;
    private _generation;
    constructor(send: VoiceSendFn, opts?: VoiceChatOptions);
    setLocalPeerId(id: string): void;
    /**
     * Subscribe to remote voice tracks. Multiple listeners can register;
     * each gets called once per remote `MediaStream`. Returns a function
     * that removes this listener (idempotent).
     */
    onTrack(handler: VoiceTrackHandler): () => void;
    /**
     * Subscribe to remote voice track removals. Multiple listeners can
     * register. Returns a function that removes this listener.
     */
    onTrackRemoved(handler: VoiceTrackRemovedHandler): () => void;
    isEnabled(): boolean;
    /** Request mic + start negotiating with all currently-connected peers. */
    enable(currentPeers: ReadonlySet<string>): Promise<void>;
    disable(): void;
    /** Mute/unmute the local mic without tearing connections down. */
    setMuted(muted: boolean): void;
    /** NetSession invokes this on peer-join so we can negotiate. */
    notifyPeerJoined(peerId: string): void;
    notifyPeerLeft(peerId: string): void;
    /** NetSession routes inbound voice signals here. */
    handleSignal(from: string, msg: VoiceSignalMessage): Promise<void>;
    private _connectTo;
    private _makeOffer;
    private _teardown;
}
