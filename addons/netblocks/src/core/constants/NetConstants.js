/**
 * Compile-time constants for the netblocks runtime. Keep these as plain
 * literals so consumers can override them by editing this file (no DI cost).
 */
const NET_PROTOCOL_VERSION = 1;
/** Default room id used when callers don't pass one. */
const DEFAULT_ROOM_ID = 'xrblocks-default-room';
/** Frequency at which the local presence is broadcast (Hz). */
const DEFAULT_PRESENCE_HZ = 20;
/**
 * Render delay for remote pose interpolation, in milliseconds. Receivers
 * sample InterpolatedPose at `now - PRESENCE_RENDER_DELAY_MS` so there is
 * always a buffered next snapshot beyond the render time, which keeps
 * interpolation in the (0, 1] range instead of constantly extrapolating.
 * Sized at ~2 packet intervals at the default 20Hz cadence to give
 * cross-device WebRTC transports enough headroom to absorb wifi jitter
 * without snapping the avatar.
 */
const PRESENCE_RENDER_DELAY_MS = 100;
/** Frequency at which net object transforms are broadcast (Hz). */
const DEFAULT_NETOBJECT_HZ = 20;
/**
 * Default tau-style smoothing rate for the per-frame
 * `1 - exp(-rate * dt)` blend that pulls a remote NetObject's local
 * pose toward the most recently received network pose. Larger values
 * track faster but jitter more on noisy wifi; 12 lands the avatar
 * within ~150 ms of the network pose at 90 Hz refresh, which feels
 * snappy without amplifying single-packet noise.
 */
const DEFAULT_NETOBJECT_INTERP_RATE = 12;
/** Maximum message payload size (bytes). Larger payloads must be chunked. */
const MAX_MESSAGE_BYTES = 60_000;
/**
 * Time in seconds before an unresponsive peer is considered disconnected.
 * Each transport may also enforce its own keepalive.
 */
const PEER_TIMEOUT_SECONDS = 8;
/** Hertz at which we send ping/keepalive frames. */
const KEEPALIVE_HZ = 1;
/** Public PeerJS broker used by WebRTCTransport when no signaling is supplied. */
const DEFAULT_PEERJS_BROKER = {
    host: '0.peerjs.com',
    port: 443,
    path: '/',
    secure: true,
};
/** STUN servers used by WebRTC; override via WebRTCTransport options. */
const DEFAULT_ICE_SERVERS = [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
];

export { DEFAULT_ICE_SERVERS, DEFAULT_NETOBJECT_HZ, DEFAULT_NETOBJECT_INTERP_RATE, DEFAULT_PEERJS_BROKER, DEFAULT_PRESENCE_HZ, DEFAULT_ROOM_ID, KEEPALIVE_HZ, MAX_MESSAGE_BYTES, NET_PROTOCOL_VERSION, PEER_TIMEOUT_SECONDS, PRESENCE_RENDER_DELAY_MS };
