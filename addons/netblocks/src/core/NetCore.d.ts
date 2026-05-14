import * as THREE from 'three';
import { LocalUser, Peers } from './Peers';
import { NetSession, NetSessionOptions } from './NetSession';
import { Transport } from './transport/Transport';
/**
 * NetCore is the public entry point for the netblocks addon. The easiest
 * way to use it is `xb.enableNet()`, which constructs one for you and
 * wires its per-frame `update()` into the host xrblocks frame loop —
 * after that you just call `xb.core.net.joinRoom(...)`.
 *
 * For advanced setups (e.g. multiple concurrent rooms) you can construct
 * a NetCore directly with your own root and tick `update()` yourself.
 *
 * ```ts
 * import * as xb from 'xrblocks';
 * import {enableNet, BroadcastChannelTransport} from 'netblocks';
 *
 * class App extends xb.Script {
 *   async init() {
 *     const net = enableNet();
 *     await net.joinRoom('demo', {
 *       transport: new BroadcastChannelTransport(),
 *       displayName: 'Alice',
 *     });
 *   }
 * }
 * ```
 */
export interface JoinRoomOptions extends NetSessionOptions {
    /**
     * Transport to use. Defaults to a fresh `WebRTCTransport()` so
     * `joinRoom('lobby')` works for the common case; pass
     * `BroadcastChannelTransport` for same-tab demos or
     * `WebSocketTransport` for relay-backed setups.
     */
    transport?: Transport;
}
export declare class NetCore {
    /** The currently active session, or undefined when not joined. */
    session?: NetSession;
    /**
     * Lazy facade over the connected peer roster. Safe to read and subscribe
     * on before `joinRoom()`; subscriptions persist across rejoins.
     */
    readonly peers: Peers;
    /** The local network identity (peerId, displayName). */
    readonly user: LocalUser;
    private _root;
    /**
     * @param root - The Object3D under which remote-user avatars are added.
     *   Usually your app's root xb.Script. When using `enableNet()`, this is
     *   the xrblocks scene.
     */
    constructor(root: THREE.Object3D);
    /** Connect to a room. Defaults to a fresh WebRTCTransport when omitted. */
    joinRoom(roomId: string, opts?: JoinRoomOptions): Promise<NetSession>;
    /** Disconnect and clean up. */
    leaveRoom(): void;
    /**
     * Broadcast `data` on `topic` to every connected peer. Shorthand for
     * `session.events.emit(topic, data)`. Throws if not joined.
     */
    send(topic: string, data: unknown): void;
    /** Per-frame tick. Driven automatically when registered via `enableNet()`. */
    update(time?: number, frame?: XRFrame): void;
    dispose(): void;
}
