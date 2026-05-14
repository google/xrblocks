import * as THREE from 'three';
import * as xb from 'xrblocks';
import { BroadcastChannelTransport } from 'netblocks';
import { NetSample } from '../../Sample.js';
import 'xrblocks/addons/simulator/SimulatorAddons.js';
import '../../roomCode.js';

/**
 * VoiceSample.
 *
 * Push-to-talk spatial voice chat. The audio itself flows over direct
 * WebRTC peer connections; the SDP/ICE handshake is signalled through
 * NetSession's transport — here, BroadcastChannelTransport — so this
 * sample works between two tabs without any external broker. To play
 * with friends across devices, click "Start new room" in the top-left
 * HUD and share the code.
 *
 * The audio is parented to each remote user's avatar head, so as you walk
 * around (or in XR, as the speaker walks around), their voice pans
 * naturally with their position via THREE.PositionalAudio.
 */
class VoiceSample extends NetSample {
    constructor() {
        super(...arguments);
        this._voiceOn = false;
        this._keys = new Set();
        this._yaw = 0;
        this._pitch = 0;
        this._dragging = false;
        this._lastT = 0;
    }
    getJoinOptions() {
        return {
            roomId: 'netblocks-sample-voice',
            options: {
                transport: new BroadcastChannelTransport(),
                displayName: `User-${Math.floor(Math.random() * 1000)}`,
            },
        };
    }
    onSession(session) {
        // Place each tab at a distinct point around a small circle so two
        // browser tabs on the same machine actually demo as spatial. In XR
        // the headset's real pose takes over and overrides this.
        const angle = Math.random() * Math.PI * 2;
        const radius = 1.5;
        const camera = xb.core?.camera;
        if (camera) {
            camera.position.set(Math.cos(angle) * radius, 1.6, Math.sin(angle) * radius);
            this._yaw = angle + Math.PI; // face the centre
            this._pitch = 0;
            this._moveCamera = camera;
            this._applyLook();
        }
        // Minimal WASD + mouse-drag look so the camera (and therefore the
        // local listener pose broadcast to peers) actually moves around in
        // a 2D browser window. In XR the real headset pose takes over.
        // Ignore keystrokes while the user is typing in an input/textarea
        // (e.g. an in-page chat box) so the character doesn't walk away.
        const isTyping = () => {
            const el = document.activeElement;
            if (!el)
                return false;
            const tag = el.tagName;
            return (tag === 'INPUT' ||
                tag === 'TEXTAREA' ||
                tag === 'SELECT' ||
                el.isContentEditable);
        };
        window.addEventListener('keydown', (e) => {
            if (isTyping())
                return;
            this._keys.add(e.key.toLowerCase());
        });
        window.addEventListener('keyup', (e) => {
            this._keys.delete(e.key.toLowerCase());
        });
        const canvas = document.querySelector('canvas');
        const target = canvas ?? document.body;
        target.addEventListener('mousedown', () => (this._dragging = true));
        window.addEventListener('mouseup', () => (this._dragging = false));
        window.addEventListener('mousemove', (e) => {
            if (!this._dragging)
                return;
            this._yaw -= e.movementX * 0.003;
            this._pitch = Math.max(-Math.PI / 2 + 0.05, Math.min(Math.PI / 2 - 0.05, this._pitch - e.movementY * 0.003));
            this._applyLook();
        });
        this._btn = document.createElement('button');
        this._btn.textContent = '🎙️ Enable voice';
        Object.assign(this._btn.style, {
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
        document.body.appendChild(this._btn);
        this._btn.addEventListener('click', () => this._toggleVoice(session));
        this._buildSpatialHud(session);
    }
    async _toggleVoice(session) {
        if (this._voiceOn) {
            session.voice.disable();
            this._voiceOn = false;
            if (this._btn)
                this._btn.textContent = '🎙️ Enable voice';
            this._spatialVoiceBtn?.setText('🎙️ Enable voice');
            this._spatialStatus?.setText('voice: off');
        }
        else {
            try {
                await session.voice.enable(session.transport.remotePeerIds);
                this._voiceOn = true;
                if (this._btn)
                    this._btn.textContent = '🔇 Disable voice';
                this._spatialVoiceBtn?.setText('🔇 Disable voice');
                this._spatialStatus?.setText('voice: on');
            }
            catch (err) {
                const msg = err.message;
                alert(`Could not start voice: ${msg}`);
                this._spatialStatus?.setText(`voice error: ${msg}`);
            }
        }
    }
    _buildSpatialHud(session) {
        const panel = new xb.SpatialPanel({
            width: 1.0,
            height: 0.5,
            backgroundColor: '#1a1a2add',
        });
        const grid = panel.addGrid();
        grid.addRow({ weight: 0.25 }).addText({
            text: '🎙️ Spatial voice',
            fontSize: 0.06,
            fontColor: '#bfa9ff',
            textAlign: 'center',
        });
        this._spatialStatus = grid.addRow({ weight: 0.25 }).addText({
            text: 'voice: off',
            fontSize: 0.05,
            fontColor: '#7ac0ff',
            textAlign: 'center',
        });
        this._spatialVoiceBtn = grid.addRow({ weight: 0.5 }).addTextButton({
            text: '🎙️ Enable voice',
            fontColor: '#ffffff',
            backgroundColor: '#9177c7',
            fontSize: 0.18,
        });
        this._spatialVoiceBtn.onTriggered = () => this._toggleVoice(session);
        panel.position.set(-1, 1.5, -1.4);
        panel.rotation.y = Math.PI / 8;
        this.add(panel);
    }
    _applyLook() {
        const cam = this._moveCamera;
        if (!cam)
            return;
        const e = new THREE.Euler(this._pitch, this._yaw, 0, 'YXZ');
        cam.quaternion.setFromEuler(e);
    }
    update(time, frame) {
        super.update(time, frame);
        const cam = this._moveCamera;
        if (!cam)
            return;
        const now = time ?? performance.now();
        const dt = this._lastT ? Math.min(0.1, (now - this._lastT) / 1000) : 0;
        this._lastT = now;
        if (!dt)
            return;
        const speed = 2.5; // m/s
        const lookSpeed = 2.0; // rad/s
        // Gamepad: left stick = move, right stick = look. Use xrblocks's
        // GamepadController so deadzone + active-pad selection match the
        // rest of the platform.
        const axes = xb.core?.input?.gamepadController?.getAxes?.() ?? [0, 0, 0, 0];
        const [gpMoveX, gpMoveY, gpLookX, gpLookY] = axes;
        if (gpLookX || gpLookY) {
            this._yaw -= gpLookX * lookSpeed * dt;
            this._pitch = Math.max(-Math.PI / 2 + 0.05, Math.min(Math.PI / 2 - 0.05, this._pitch - gpLookY * lookSpeed * dt));
            this._applyLook();
        }
        const fwd = new THREE.Vector3();
        cam.getWorldDirection(fwd);
        fwd.y = 0;
        fwd.normalize();
        const right = new THREE.Vector3(-fwd.z, 0, fwd.x);
        const move = new THREE.Vector3();
        if (this._keys.has('w') || this._keys.has('arrowup'))
            move.add(fwd);
        if (this._keys.has('s') || this._keys.has('arrowdown'))
            move.sub(fwd);
        if (this._keys.has('d') || this._keys.has('arrowright'))
            move.add(right);
        if (this._keys.has('a') || this._keys.has('arrowleft'))
            move.sub(right);
        if (gpMoveX || gpMoveY) {
            move.addScaledVector(fwd, -gpMoveY);
            move.addScaledVector(right, gpMoveX);
        }
        if (move.lengthSq() > 0) {
            move.normalize().multiplyScalar(speed * dt);
            cam.position.add(move);
        }
    }
}
NetSample.run(VoiceSample);
