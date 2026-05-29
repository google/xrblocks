/**
 * Peers: a thin, lazy facade over `NetSession`'s user roster, exposed as
 * `xb.core.net.peers`. Subscriptions are queued before a session exists
 * (and before/after `joinRoom()`) and then re-bound to whatever session is
 * currently active, so callers do not need to re-subscribe across rejoins.
 */
import {NetCore} from './NetCore';
import {NetSession, UserEventDetail} from './NetSession';
import {NetUser} from './NetUser';
import {PeerRole} from './codec/MessageCodec';

export type PeerEvent = 'join' | 'leave';
export type PeerListener = (user: NetUser) => void;

export class Peers {
  private _net: NetCore;
  private _boundSession?: NetSession;
  private _listeners = new Map<PeerEvent, Set<PeerListener>>();
  private _joinHandler = (e: Event) =>
    this._dispatch('join', (e as CustomEvent<UserEventDetail>).detail.user);
  private _leaveHandler = (e: Event) =>
    this._dispatch('leave', (e as CustomEvent<UserEventDetail>).detail.user);

  constructor(net: NetCore) {
    this._net = net;
  }

  /** All currently-connected remote peers. Empty when not in a session. */
  list(): NetUser[] {
    const session = this._net.session;
    if (!session) return [];
    return Array.from(session.users.values());
  }

  /** Alias matching the comment-thread spelling. */
  get remoteUsers(): NetUser[] {
    return this.list();
  }

  /**
   * The active session's RPC bus, for `events.emit('topic', payload)` /
   * `events.on('topic', cb)`. Returns undefined when no session exists —
   * callers should guard or wait until after `joinRoom()`.
   */
  get events() {
    return this._net.session?.events;
  }

  /** Subscribe to peer join/leave. Survives session rejoins. */
  on(event: PeerEvent, listener: PeerListener): () => void {
    let set = this._listeners.get(event);
    if (!set) {
      set = new Set();
      this._listeners.set(event, set);
    }
    set.add(listener);
    this._rebind();
    return () => this.off(event, listener);
  }

  off(event: PeerEvent, listener: PeerListener): void {
    this._listeners.get(event)?.delete(listener);
  }

  /** @internal Called by NetCore when a new session is created or torn down. */
  _onSessionChanged(): void {
    this._rebind();
  }

  private _rebind(): void {
    const current = this._net.session;
    if (current === this._boundSession) return;
    if (this._boundSession) {
      this._boundSession.removeEventListener('user-join', this._joinHandler);
      this._boundSession.removeEventListener('user-leave', this._leaveHandler);
    }
    this._boundSession = current;
    if (current) {
      current.addEventListener('user-join', this._joinHandler);
      current.addEventListener('user-leave', this._leaveHandler);
    }
  }

  private _dispatch(event: PeerEvent, user: NetUser): void {
    const set = this._listeners.get(event);
    if (!set) return;
    for (const listener of set) {
      try {
        listener(user);
      } catch (err) {
        console.error(`[netblocks] peers '${event}' listener threw:`, err);
      }
    }
  }
}

/**
 * LocalUser: the network identity of the local peer, exposed as
 * `xb.core.net.user`. This is intentionally minimal — for input devices
 * (controllers, hands) use `xb.user` (xrblocks core), which is a different
 * concept.
 */
export class LocalUser {
  private _net: NetCore;

  constructor(net: NetCore) {
    this._net = net;
  }

  /** The local peer id, or undefined when not joined to a room. */
  get peerId(): string | undefined {
    return this._net.session?.localPeerId;
  }

  /** The local display name, or undefined when not joined to a room. */
  get displayName(): string | undefined {
    return this._net.session?.displayName;
  }

  /** The local self-reported role, or undefined when not joined. */
  get role(): PeerRole | undefined {
    return this._net.session?.role;
  }
}
