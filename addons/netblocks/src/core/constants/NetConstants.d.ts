/**
 * Compile-time constants for the netblocks runtime. Keep these as plain
 * literals so consumers can override them by editing this file (no DI cost).
 */
export declare const NET_PROTOCOL_VERSION = 1;
/** Default room id used when callers don't pass one. */
export declare const DEFAULT_ROOM_ID = "xrblocks-default-room";
/** Frequency at which the local presence is broadcast (Hz). */
export declare const DEFAULT_PRESENCE_HZ = 20;
/**
 * Render delay for remote pose interpolation, in milliseconds. Receivers
 * sample InterpolatedPose at `now - PRESENCE_RENDER_DELAY_MS` so there is
 * always a buffered next snapshot beyond the render time, which keeps
 * interpolation in the (0, 1] range instead of constantly extrapolating.
 * Sized at ~2 packet intervals at the default 20Hz cadence to give
 * cross-device WebRTC transports enough headroom to absorb wifi jitter
 * without snapping the avatar.
 */
export declare const PRESENCE_RENDER_DELAY_MS = 100;
/** Frequency at which net object transforms are broadcast (Hz). */
export declare const DEFAULT_NETOBJECT_HZ = 20;
/**
 * Default tau-style smoothing rate for the per-frame
 * `1 - exp(-rate * dt)` blend that pulls a remote NetObject's local
 * pose toward the most recently received network pose. Larger values
 * track faster but jitter more on noisy wifi; 12 lands the avatar
 * within ~150 ms of the network pose at 90 Hz refresh, which feels
 * snappy without amplifying single-packet noise.
 */
export declare const DEFAULT_NETOBJECT_INTERP_RATE = 12;
/** Maximum message payload size (bytes). Larger payloads must be chunked. */
export declare const MAX_MESSAGE_BYTES = 60000;
/**
 * Time in seconds before an unresponsive peer is considered disconnected.
 * Each transport may also enforce its own keepalive.
 */
export declare const PEER_TIMEOUT_SECONDS = 8;
/** Hertz at which we send ping/keepalive frames. */
export declare const KEEPALIVE_HZ = 1;
/** Public PeerJS broker used by WebRTCTransport when no signaling is supplied. */
export declare const DEFAULT_PEERJS_BROKER: {
    readonly host: "0.peerjs.com";
    readonly port: 443;
    readonly path: "/";
    readonly secure: true;
};
/** STUN servers used by WebRTC; override via WebRTCTransport options. */
export declare const DEFAULT_ICE_SERVERS: RTCIceServer[];
