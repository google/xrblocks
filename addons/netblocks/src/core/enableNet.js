import * as xb from 'xrblocks';
import { NetCore } from './NetCore.js';
import './Peers.js';
import './NetSession.js';
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
import './transport/WebRTCTransport.js';
import './transport/Transport.js';

/**
 * Internal Script that drives `NetCore.update()` on every frame. We hide
 * it behind `enableNet()` rather than making `NetCore` itself a Script
 * to keep NetCore's type surface (and the addon's emitted .d.ts) free of
 * the deep xrblocks/three Object3D inheritance graph.
 */
class NetCoreScript extends xb.Script {
    constructor(netCore) {
        super();
        this.netCore = netCore;
        this.name = 'NetCore';
    }
    update(time, frame) {
        this.netCore.update(time, frame);
    }
}
/**
 * Register the netblocks addon with the running xrblocks core. Idempotent —
 * calling it again returns the existing NetCore. Must be called after
 * `xb.init()` so `xb.core.scene` and `xb.core.scriptsManager` are ready.
 *
 * After this call:
 * - `xb.core.net` holds the NetCore instance.
 * - A small Script wrapper is added to `xb.core.scene`, so the per-frame
 *   `NetCore.update()` runs automatically via the standard xrblocks
 *   scripts manager.
 *
 * You can `joinRoom()` on the returned instance whenever you're ready.
 */
function enableNet() {
    if (!xb.core) {
        throw new Error('[netblocks] enableNet() must be called after xb.init() — ' +
            'xb.core is not initialised yet.');
    }
    if (xb.core.net)
        return xb.core.net;
    const net = new NetCore(xb.core.scene);
    const driver = new NetCoreScript(net);
    xb.core.scene.add(driver);
    void xb.core.scriptsManager.initScript(driver);
    xb.core.net = net;
    return net;
}

export { enableNet };
