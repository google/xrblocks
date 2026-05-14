class Peers {
    constructor(net) {
        this._listeners = new Map();
        this._joinHandler = (e) => this._dispatch('join', e.detail.user);
        this._leaveHandler = (e) => this._dispatch('leave', e.detail.user);
        this._net = net;
    }
    /** All currently-connected remote peers. Empty when not in a session. */
    list() {
        const session = this._net.session;
        if (!session)
            return [];
        return Array.from(session.users.values());
    }
    /** Alias matching the comment-thread spelling. */
    get remoteUsers() {
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
    on(event, listener) {
        let set = this._listeners.get(event);
        if (!set) {
            set = new Set();
            this._listeners.set(event, set);
        }
        set.add(listener);
        this._rebind();
        return () => this.off(event, listener);
    }
    off(event, listener) {
        this._listeners.get(event)?.delete(listener);
    }
    /** @internal Called by NetCore when a new session is created or torn down. */
    _onSessionChanged() {
        this._rebind();
    }
    _rebind() {
        const current = this._net.session;
        if (current === this._boundSession)
            return;
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
    _dispatch(event, user) {
        const set = this._listeners.get(event);
        if (!set)
            return;
        for (const listener of set) {
            try {
                listener(user);
            }
            catch (err) {
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
class LocalUser {
    constructor(net) {
        this._net = net;
    }
    /** The local peer id, or undefined when not joined to a room. */
    get peerId() {
        return this._net.session?.localPeerId;
    }
    /** The local display name, or undefined when not joined to a room. */
    get displayName() {
        return this._net.session?.displayName;
    }
    /** The local self-reported role, or undefined when not joined. */
    get role() {
        return this._net.session?.role;
    }
}

export { LocalUser, Peers };
