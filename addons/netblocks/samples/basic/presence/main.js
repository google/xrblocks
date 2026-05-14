import { BroadcastChannelTransport } from 'netblocks';
import { NetSample } from '../../Sample.js';
import 'xrblocks';
import 'xrblocks/addons/simulator/SimulatorAddons.js';
import '../../roomCode.js';

/**
 * PresenceSample.
 *
 * The simplest possible netblocks demo: join a room and watch other peers'
 * heads appear as default avatars (hands too when a peer is in XR with
 * hand tracking). Open this page in two tabs to see yourself across
 * both — the head spheres render the simulator camera pose, and any
 * hand joints reported by WebXR appear as fingertip dots. To play with
 * friends across devices, click "Start new room" in the top-left HUD
 * and share the code.
 */
class PresenceSample extends NetSample {
    getJoinOptions() {
        return {
            roomId: 'netblocks-sample-presence',
            options: {
                transport: new BroadcastChannelTransport(),
                displayName: `User-${Math.floor(Math.random() * 1000)}`,
            },
        };
    }
    onSession(session) {
        // Add a simple ambient hemisphere light + a floor disc so remote avatars
        // are visible without needing the simulator's debug visualizations.
        session.addEventListener('user-join', (e) => {
            const user = e.detail.user;
            console.log(`[presence] user joined: ${user.peerId} (${user.displayName ?? '?'})`);
        });
        session.addEventListener('user-leave', (e) => {
            const user = e.detail.user;
            console.log(`[presence] user left: ${user.peerId}`);
        });
    }
}
NetSample.run(PresenceSample);
