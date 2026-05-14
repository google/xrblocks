class NetEvents {
    constructor(send) {
        this._handlers = new Map();
        this._send = send;
    }
    /** Subscribe to a topic. Returns an unsubscribe function. */
    on(topic, handler) {
        let set = this._handlers.get(topic);
        if (!set) {
            set = new Set();
            this._handlers.set(topic, set);
        }
        set.add(handler);
        return () => {
            set.delete(handler);
            if (set.size === 0)
                this._handlers.delete(topic);
        };
    }
    off(topic, handler) {
        this._handlers.get(topic)?.delete(handler);
    }
    /** Broadcast `payload` on `topic` to every other peer. */
    emit(topic, payload) {
        this._send({ type: 'rpc', topic, payload });
    }
    /** Send `payload` only to one peer. */
    emitTo(targetPeerId, topic, payload) {
        this._send({ type: 'rpc', topic, payload, to: targetPeerId });
    }
    /** Internal: dispatch an inbound RPC message to local handlers. */
    _dispatch(msg) {
        const set = this._handlers.get(msg.topic);
        if (!set || !msg.from)
            return;
        for (const handler of set) {
            try {
                handler(msg.payload, msg.from);
            }
            catch (err) {
                console.error('[netblocks] RPC handler threw:', err);
            }
        }
    }
}
function typedEvents(events) {
    return events;
}

export { NetEvents, typedEvents };
