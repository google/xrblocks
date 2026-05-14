import { RemoteUserAvatar } from './presence/RemoteUserAvatar.js';
import 'three';
import 'xrblocks';
import './presence/InterpolatedPose.js';
import './utils/IdUtils.js';

class NetUser {
    constructor(peerId, capabilities, displayName, role = 'user') {
        this.peerId = peerId;
        this.displayName = displayName;
        this.role = role;
        this.capabilities = capabilities;
        this.lastSeenMs = performance.now();
        this.avatar = new RemoteUserAvatar({ peerId, displayName });
    }
    dispose() {
        this.avatar.dispose();
        this.avatar.parent?.remove(this.avatar);
    }
}

export { NetUser };
