/**
 * GeminiVRMLipScript.js
 *
 * Orchestrates a Gemini Live voice conversation where a VRM avatar acts as
 * Gemini's body: the user talks, Gemini replies in audio, and the avatar's mouth
 * is driven from that audio by the lipsync add-on.
 *
 * Wiring:
 *   - Mic  → Gemini : xb.core.sound.enableAudio() streams the local mic to the
 *                     live session (same as demos/gemini_icebreakers).
 *   - Gemini → audio: each onmessage carries base64 PCM in `message.data`, which
 *                     we feed to AIAudioPlayer (plays to speakers + exposes a tap).
 *   - audio → mouth : LipsyncMouth analyses AIAudioPlayer.stream and writes visemes
 *                     to VRMVisemeTarget, which drives the VRM's mouth presets.
 */

import * as THREE from 'three';
import * as xb from 'xrblocks';
import {LipsyncMouth} from 'lipsync';

import {VRMAvatar} from './VRMAvatar.js';
import {VRMVisemeTarget} from './VRMVisemeTarget.js';
import {AIAudioPlayer} from './AIAudioPlayer.js';

export class GeminiVRMLipScript extends xb.Script {
  /**
   * @param {object} [opts={}]
   * @param {string} [opts.vrmUrl] URL to the .vrm file.
   * @param {string} [opts.tposeUrl] URL to the Tpose GLB.
   * @param {string} [opts.idleUrl] URL to the idle GLB.
   * @param {number} [opts.spawnDistance=1.8] Metres in front of the user.
   */
  constructor(opts = {}) {
    super();

    this._vrmUrl = opts.vrmUrl ?? '';
    this._tposeUrl = opts.tposeUrl ?? '';
    this._idleUrl = opts.idleUrl ?? '';
    this._spawnDistance = opts.spawnDistance ?? 1.8;

    this._avatar = new VRMAvatar();
    this._visemeTarget = null;
    this._loaded = false;

    // Live-session state.
    this._isAIRunning = false;
    this._aiPlayer = null;
    this._mouth = null;

    // UI handles.
    this._panel = null;
    this._statusView = null;
  }

  // -------------------------------------------------------------------------
  // Lifecycle
  // -------------------------------------------------------------------------

  async init() {
    if (!this._vrmUrl || !this._tposeUrl) {
      console.error('[GeminiVRMLip] vrmUrl and tposeUrl are required.');
      return;
    }

    console.log('[GeminiVRMLip] Loading VRM…');
    await this._avatar.load(this._vrmUrl);

    if (this._idleUrl) {
      console.log('[GeminiVRMLip] Loading idle animation…');
      await this._avatar.loadGLBAnimation(
        'idle',
        this._idleUrl,
        this._tposeUrl
      );
    }

    this.add(this._avatar.root);
    this._placeAvatarFacingUser();
    if (this._idleUrl) this._avatar.play('idle');

    this._visemeTarget = new VRMVisemeTarget(this._avatar.vrm);

    this._buildPanel();

    this._loaded = true;
    console.log('[GeminiVRMLip] Ready. Auto-starting Gemini Live…');
    this.startGeminiLive();
  }

  update() {
    if (!this._loaded) return;
    this._avatar.update(xb.core.timer.getDelta());
    // LipsyncMouth updates itself — it's a Script in the scene graph.
  }

  // -------------------------------------------------------------------------
  // UI
  // -------------------------------------------------------------------------

  _buildPanel() {
    const panel = new xb.SpatialPanel({
      width: 0.5,
      height: 0.14,
      backgroundColor: '#1a1a2add',
    });
    const grid = panel.addGrid();
    this._statusView = grid.addRow({weight: 1}).addText({
      text: 'connecting…',
      fontSize: 0.045,
      fontColor: '#7ac0ff',
      textAlign: 'center',
    });

    panel.updateLayouts();
    // Place to the left of the avatar and angle it toward the user.
    panel.position.set(-0.7, xb.user.height - 0.5, -0.8);
    panel.rotation.y = Math.PI / 6;
    this.add(panel);
    this._panel = panel;
  }

  _setStatus(text) {
    this._statusView?.setText(text);
  }

  // -------------------------------------------------------------------------
  // Gemini Live
  // -------------------------------------------------------------------------

  async startGeminiLive() {
    if (this._isAIRunning) return;
    if (!xb.core.ai) {
      this._setStatus('AI not enabled');
      return;
    }
    try {
      // Stream the local mic to Gemini.
      await xb.core.sound.enableAudio();

      // Player that both plays Gemini's voice and exposes it as a MediaStream.
      this._aiPlayer = new AIAudioPlayer();
      await this._aiPlayer.resume();

      // Drive the VRM mouth from that stream. LipsyncMouth is one-shot, so we
      // build a fresh instance each start.
      this._mouth = new LipsyncMouth(this._aiPlayer.stream, {
        target: this._visemeTarget,
        audioContext: this._aiPlayer.context,
      });
      this.add(this._mouth);

      await this._startLiveSession();

      this._isAIRunning = true;
      this._setStatus('listening — talk to Gemini');
    } catch (error) {
      console.error('[GeminiVRMLip] Failed to start AI session:', error);
      this._setStatus(`failed: ${error?.message ?? error}`);
      this._teardownSession();
      this._isAIRunning = false;
    }
  }

  async stopGeminiLive() {
    if (!this._isAIRunning) return;
    this._isAIRunning = false;
    await xb.core.ai?.stopLiveSession?.();
    xb.core.sound?.disableAudio?.();
    this._teardownSession();
    this._setStatus('idle');
  }

  _startLiveSession() {
    return new Promise((resolve, reject) => {
      xb.core.ai.setLiveCallbacks({
        onopen: resolve,
        onmessage: (message) => this._handleAIMessage(message),
        onerror: reject,
        onclose: () => {
          this._teardownSession();
          this._isAIRunning = false;
          this._setStatus('disconnected');
        },
      });
      xb.core.ai.startLiveSession().catch(reject);
    });
  }

  _handleAIMessage(message) {
    // Feed Gemini's voice to the player (plays + drives lipsync via the tap).
    message.data && this._aiPlayer?.playChunk(message.data);
  }

  /** Removes the lipsync driver (resetting the mouth) and tears down the player. */
  _teardownSession() {
    if (this._mouth) {
      // Removal triggers LipsyncMouth.dispose() on the next sync, which resets
      // the VRM mouth to rest via ZERO_VISEME.
      this.remove(this._mouth);
      this._mouth = null;
    }
    if (this._aiPlayer) {
      this._aiPlayer.stop();
      this._aiPlayer = null;
    }
  }

  // -------------------------------------------------------------------------
  // Placement (adapted from demos/vrm-avatar/VRMAvatarScript.js)
  // -------------------------------------------------------------------------

  _getUserPosition() {
    const p = xb.core.camera.position.clone();
    p.y = 0;
    return p;
  }

  _placeAvatarFacingUser() {
    const userPos = this._getUserPosition();
    const forward = new THREE.Vector3();
    xb.core.camera.getWorldDirection(forward);
    forward.y = 0;
    if (forward.lengthSq() < 1e-10) forward.set(0, 0, -1);
    forward.normalize();

    const root = this._avatar.root;
    root.position.copy(userPos).addScaledVector(forward, this._spawnDistance);
    root.position.y = 0;

    const faceDir = new THREE.Vector3().subVectors(userPos, root.position);
    faceDir.y = 0;
    if (faceDir.lengthSq() < 1e-10) faceDir.set(0, 0, 1);
    else faceDir.normalize();

    root.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), faceDir);
  }
}
