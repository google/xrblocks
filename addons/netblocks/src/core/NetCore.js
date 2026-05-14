import { Peers, LocalUser } from './Peers.js';
import { NetSession } from './NetSession.js';
import { WebRTCTransport } from './transport/WebRTCTransport.js';
import 'xrblocks';
import './codec/MessageCodec.js';
import './constants/NetConstants.js';
import './codec/PoseCodec.js';
import 'three';
import './objects/NetObject.js';
import './utils/IdUtils.js';
import './objects/NetObjectRegistry.js';
import './NetUser.js';
import './presence/RemoteUserAvatar.js';
import './presence/InterpolatedPose.js';
import './presence/PresenceBroadcaster.js';
import './rpc/NetEvents.js';
import './voice/SpatialVoice.js';
import './voice/VoiceChat.js';
import './transport/Transport.js';

class NetCore {
    /**
     * @param root - The Object3D under which remote-user avatars are added.
     *   Usually your app's root xb.Script. When using `enableNet()`, this is
     *   the xrblocks scene.
     */
    constructor(root) {
        this._root = root;
        this.peers = new Peers(this);
        this.user = new LocalUser(this);
    }
    /** Connect to a room. Defaults to a fresh WebRTCTransport when omitted. */
    async joinRoom(roomId, opts = {}) {
        if (this.session)
            this.leaveRoom();
        const { transport, ...sessionOpts } = opts;
        const t = transport ?? new WebRTCTransport();
        this.session = new NetSession(t, this._root, sessionOpts);
        this.peers._onSessionChanged();
        await this.session.open(roomId);
        return this.session;
    }
    /** Disconnect and clean up. */
    leaveRoom() {
        this.session?.close();
        this.session = undefined;
        this.peers._onSessionChanged();
    }
    /**
     * Broadcast `data` on `topic` to every connected peer. Shorthand for
     * `session.events.emit(topic, data)`. Throws if not joined.
     */
    send(topic, data) {
        if (!this.session) {
            throw new Error('[netblocks] net.send() called before joinRoom()');
        }
        this.session.events.emit(topic, data);
    }
    /** Per-frame tick. Driven automatically when registered via `enableNet()`. */
    update(time, frame) {
        this.session?.update(time, frame);
    }
    dispose() {
        this.leaveRoom();
    }
}

export { NetCore };
