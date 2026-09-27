import { PeerRole } from "./codec/MessageCodec.js";
import { NetUser } from "./NetUser.js";
import { NetEvents } from "./rpc/NetEvents.js";
import "./index.js";
import { NetCore } from "./NetCore.js";
//#region src/addons/netblocks/src/core/Peers.d.ts
export type PeerEvent = 'join' | 'leave';
export type PeerListener = (user: NetUser) => void;
export declare class Peers {
  private _net;
  private _boundSession?;
  private _listeners;
  private _joinHandler;
  private _leaveHandler;
  constructor(net: NetCore);
  /** All currently-connected remote peers. Empty when not in a session. */
  list(): NetUser[];
  /** Alias matching the comment-thread spelling. */
  get remoteUsers(): NetUser[];
  /**
   * The active session's RPC bus, for `events.emit('topic', payload)` /
   * `events.on('topic', cb)`. Returns undefined when no session exists —
   * callers should guard or wait until after `joinRoom()`.
   */
  get events(): NetEvents | undefined;
  /** Subscribe to peer join/leave. Survives session rejoins. */
  on(event: PeerEvent, listener: PeerListener): () => void;
  off(event: PeerEvent, listener: PeerListener): void;
  /** @internal Called by NetCore when a new session is created or torn down. */
  _onSessionChanged(): void;
  private _rebind;
  private _dispatch;
}
/**
 * LocalUser: the network identity of the local peer, exposed as
 * `xb.core.net.user`. This is intentionally minimal — for input devices
 * (controllers, hands) use `xb.user` (xrblocks core), which is a different
 * concept.
 */
export declare class LocalUser {
  private _net;
  constructor(net: NetCore);
  /** The local peer id, or undefined when not joined to a room. */
  get peerId(): string | undefined;
  /** The local display name, or undefined when not joined to a room. */
  get displayName(): string | undefined;
  /** The local self-reported role, or undefined when not joined. */
  get role(): PeerRole | undefined;
}
//#endregion