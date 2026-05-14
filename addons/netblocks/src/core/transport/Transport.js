/**
 * Transport: the contract every netblocks transport must satisfy.
 *
 * A Transport is responsible for:
 *  - Establishing a connection to a "room" (any string id).
 *  - Reporting peer join/leave events as the local view of room membership
 *    changes.
 *  - Sending an opaque byte payload either to a specific peer or as a
 *    broadcast to every other peer in the room.
 *  - Surfacing inbound messages with the sender's peer id.
 *
 * The Transport intentionally knows nothing about the netblocks message
 * protocol — it just moves bytes. NetSession layers presence, RPC, etc. on
 * top via MessageCodec.
 *
 * All transports are EventTarget subclasses so that consumers can use the
 * standard `addEventListener` / `removeEventListener` API.
 */
class Transport extends EventTarget {
    /** Convenience: typed event subscription. */
    on(type, listener) {
        this.addEventListener(type, listener);
    }
    off(type, listener) {
        this.removeEventListener(type, listener);
    }
    emitPeerJoin(peerId) {
        this.dispatchEvent(new CustomEvent('peer-join', { detail: { peerId } }));
    }
    emitPeerLeave(peerId) {
        this.dispatchEvent(new CustomEvent('peer-leave', {
            detail: { peerId },
        }));
    }
    emitMessage(peerId, data) {
        this.dispatchEvent(new CustomEvent('message', {
            detail: { peerId, data },
        }));
    }
    emitError(error) {
        this.dispatchEvent(new CustomEvent('error', { detail: { error } }));
    }
}

export { Transport };
