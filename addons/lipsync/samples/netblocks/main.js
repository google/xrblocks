import * as THREE from 'three';
import * as xb from 'xrblocks';
import 'xrblocks/addons/simulator/SimulatorAddons.js';
import { BroadcastChannelTransport } from 'netblocks';
import { LipsyncMouth } from '../../LipsyncMouth.js';
import '../../BlendshapeReducer.js';
import { NetSample } from '../../../netblocks/samples/Sample.js';
import '../../computeAudioFeatures.js';
import '../../FormantVisemeMapper.js';
import '../../../netblocks/samples/roomCode.js';

/**
 * NetblocksLipsyncSample.
 *
 * Multiplayer demo: every remote peer's voice stream drives the face
 * that netblocks already attaches to their avatar. Opens this page in
 * two browser tabs and the avatars visibly speak with each other's
 * voices.
 *
 * The static face (eyes + closed mouth) is part of netblocks's default
 * avatar — it appears the moment a peer joins, regardless of whether
 * they ever enable voice. This sample only adds the audio→viseme
 * driver: a per-peer `LipsyncMouth` whose `target` is that face.
 *
 * Uses `BroadcastChannelTransport` for zero-broker two-tab demos. Click
 * the room-code "Start new room" button in the top-left to switch to
 * the WebRTC transport for cross-machine multiplayer.
 *
 * One shared `AudioContext` is reused across all peer drivers so the
 * browser doesn't run out of context slots when more than a handful of
 * peers join.
 */
class NetblocksLipsyncSample extends NetSample {
    constructor() {
        super(...arguments);
        this.sharedCtx = THREE.AudioContext.getContext();
        // Per-peer audio→viseme driver. Created on `voice.onTrack`, removed
        // on `voice.onTrackRemoved` or `user-leave`. We never own the face
        // itself — that's the avatar's `face` field.
        this.drivers = new Map();
    }
    getJoinOptions() {
        return {
            roomId: 'lipsync-netblocks',
            options: {
                transport: new BroadcastChannelTransport(),
                displayName: `User-${Math.floor(Math.random() * 1000)}`,
            },
        };
    }
    onSession(session) {
        // When a peer's voice MediaStream arrives, wire a LipsyncMouth to
        // drive their avatar's existing face. Reuses the shared
        // AudioContext so N peers don't exhaust the browser's per-page
        // context quota. `voice.onTrack` is additive, so this runs
        // alongside NetSession's own SpatialVoice attach.
        session.voice.onTrack((peerId, stream) => {
            const user = session.users.get(peerId);
            if (!user)
                return;
            this.detachDriver(peerId);
            const driver = new LipsyncMouth(stream, {
                target: user.avatar.face,
                audioContext: this.sharedCtx,
            });
            // Parent under the avatar so the script lifecycle (init, update,
            // dispose) is tied to the peer's avatar being in the scene.
            user.avatar.add(driver);
            this.drivers.set(peerId, driver);
        });
        session.voice.onTrackRemoved((peerId) => this.detachDriver(peerId));
        session.addEventListener('user-leave', (e) => {
            this.detachDriver(e.detail.user.peerId);
        });
        // Track local voice state from the authoritative NetSession event
        // rather than an optimistic flag, so a fast double-tap or a failed
        // enable() can't drift the UI.
        session.addEventListener('local-voice-state', (e) => {
            const on = e.detail.on;
            const label = on ? '🔇 Disable voice' : '🎙️ Enable voice';
            if (this.domBtn)
                this.domBtn.textContent = label;
            this.spatialBtn?.setText(label);
            this.spatialStatus?.setText(on ? 'voice: on. other tabs will see your mouth' : 'voice: off');
        });
        this.buildDomButton(session);
        this.buildSpatialPanel(session);
    }
    detachDriver(peerId) {
        const d = this.drivers.get(peerId);
        if (!d)
            return;
        d.parent?.remove(d);
        this.drivers.delete(peerId);
    }
    buildDomButton(session) {
        const btn = document.createElement('button');
        btn.textContent = '🎙️ Enable voice';
        Object.assign(btn.style, {
            position: 'fixed',
            top: '12px',
            right: '12px',
            padding: '10px 18px',
            background: '#9177c7',
            color: '#fff',
            border: 'none',
            borderRadius: '24px',
            fontSize: '14px',
            cursor: 'pointer',
            zIndex: '999',
        });
        document.body.appendChild(btn);
        btn.addEventListener('click', () => this.toggleVoice(session));
        this.domBtn = btn;
    }
    buildSpatialPanel(session) {
        const panel = new xb.SpatialPanel({
            width: 1.0,
            height: 0.5,
            backgroundColor: '#1a1a2add',
        });
        const grid = panel.addGrid();
        grid.addRow({ weight: 0.25 }).addText({
            text: '🎙️ Lipsync · netblocks',
            fontSize: 0.06,
            fontColor: '#bfa9ff',
            textAlign: 'center',
        });
        this.spatialStatus = grid.addRow({ weight: 0.25 }).addText({
            text: 'voice: off',
            fontSize: 0.05,
            fontColor: '#7ac0ff',
            textAlign: 'center',
        });
        this.spatialBtn = grid.addRow({ weight: 0.5 }).addTextButton({
            text: '🎙️ Enable voice',
            fontColor: '#ffffff',
            backgroundColor: '#9177c7',
            fontSize: 0.18,
        });
        this.spatialBtn.onTriggered = () => this.toggleVoice(session);
        panel.position.set(-1, 1.5, -1.4);
        panel.rotation.y = Math.PI / 8;
        this.add(panel);
    }
    async toggleVoice(session) {
        if (session.voice.isEnabled()) {
            session.voice.disable();
        }
        else {
            try {
                await session.voice.enable(session.transport.remotePeerIds);
            }
            catch (err) {
                const msg = err.message;
                this.spatialStatus?.setText(`voice error: ${msg}`);
            }
        }
    }
}
NetSample.run(NetblocksLipsyncSample);
