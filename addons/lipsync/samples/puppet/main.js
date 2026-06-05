import * as THREE from 'three';
import * as xb from 'xrblocks';
import 'xrblocks/addons/simulator/SimulatorAddons.js';
import { LipsyncMouth } from '../../LipsyncMouth.js';
import '../../BlendshapeReducer.js';
import '../../computeAudioFeatures.js';
import '../../FormantVisemeMapper.js';

/**
 * Puppet sample. Floats a stylised head about a metre in front of the
 * user and drives its mouth from the local mic. The puppet acts as a
 * stand-in for what a remote peer would see, since in immersive XR you
 * can't see your own face. Works in both the desktop simulator and an
 * immersive WebXR session.
 *
 * Tap the on-screen / in-scene mic button to grant audio permission,
 * then talk to the puppet. Vowels open the mouth, /oo/ rounds it, /ee/
 * widens it.
 */
class LipsyncPuppetSample extends xb.Script {
    constructor() {
        super(...arguments);
        this.started = false;
        // Scratch vectors for the per-frame face-the-camera lookAt.
        this.camWorld = new THREE.Vector3();
        this.headWorld = new THREE.Vector3();
    }
    init() {
        // Stylised puppet head: a sphere face, two eye dots, no body. Uses
        // a 0.1 m face radius to match netblocks `RemoteUserAvatar` so the
        // default LipsyncMouth fits naturally.
        const head = new THREE.Group();
        head.position.set(0, xb.user.height, -1);
        const faceR = 0.1;
        const faceGeom = new THREE.SphereGeometry(faceR, 32, 24);
        const faceMat = new THREE.MeshStandardMaterial({
            color: 0xf2d4b3,
            roughness: 0.6,
            metalness: 0.05,
        });
        const face = new THREE.Mesh(faceGeom, faceMat);
        head.add(face);
        const eyeGeom = new THREE.SphereGeometry(faceR * 0.1, 12, 8);
        const eyeMat = new THREE.MeshBasicMaterial({ color: 0x111111 });
        for (const dx of [-faceR * 0.3, faceR * 0.3]) {
            const eye = new THREE.Mesh(eyeGeom, eyeMat);
            // Eyes on the front of the head (local -Z) to match three.js /
            // WebXR head-forward convention.
            eye.position.set(dx, faceR * 0.2, -faceR * 0.92);
            head.add(eye);
        }
        this.puppetHead = head;
        this.add(head);
        this.add(new THREE.AmbientLight(0xffffff, 0.6));
        const key = new THREE.DirectionalLight(0xffffff, 0.9);
        key.position.set(1, 2, 1);
        this.add(key);
        this.buildDomButton();
        this.buildSpatialPanel();
    }
    update() {
        // Keep the puppet facing the user. The mouth canvas and the eye
        // spheres both live on the head's local -Z (three.js / WebXR
        // head-forward convention), so a static puppet would hide them
        // the moment the user walked or turned around it. Three.js's
        // Object3D.lookAt orients local +Z at the target, so we look at
        // the camera mirrored through the head: that puts local -Z (face
        // side) on the camera. Y is clamped so the puppet only yaws and
        // doesn't pitch when the user is taller or shorter than it.
        const head = this.puppetHead;
        const cam = xb.core?.camera;
        if (!head || !cam)
            return;
        cam.getWorldPosition(this.camWorld);
        head.getWorldPosition(this.headWorld);
        const targetX = 2 * this.headWorld.x - this.camWorld.x;
        const targetZ = 2 * this.headWorld.z - this.camWorld.z;
        head.lookAt(targetX, this.headWorld.y, targetZ);
    }
    buildDomButton() {
        const btn = document.createElement('button');
        btn.textContent = '🎙️ Start mic';
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
        btn.addEventListener('click', () => this.toggleMic());
        this.domBtn = btn;
    }
    buildSpatialPanel() {
        const panel = new xb.SpatialPanel({
            width: 0.8,
            height: 0.4,
            backgroundColor: '#1a1a2add',
        });
        const grid = panel.addGrid();
        grid.addRow({ weight: 0.3 }).addText({
            text: '🎙️ Lipsync puppet',
            fontSize: 0.06,
            fontColor: '#bfa9ff',
            textAlign: 'center',
        });
        this.spatialStatus = grid.addRow({ weight: 0.25 }).addText({
            text: 'mic: off',
            fontSize: 0.05,
            fontColor: '#7ac0ff',
            textAlign: 'center',
        });
        this.spatialBtn = grid.addRow({ weight: 0.45 }).addTextButton({
            text: '🎙️ Start mic',
            fontColor: '#ffffff',
            backgroundColor: '#9177c7',
            fontSize: 0.18,
        });
        this.spatialBtn.onTriggered = () => this.toggleMic();
        panel.position.set(-0.9, xb.user.height + 0.2, -1);
        panel.rotation.y = Math.PI / 8;
        this.add(panel);
    }
    toggleMic() {
        return this.started ? this.stopMic() : this.startMic();
    }
    async startMic() {
        if (this.started)
            return;
        this.started = true;
        try {
            const stream = await navigator.mediaDevices.getUserMedia({
                audio: { echoCancellation: true, noiseSuppression: true },
                video: false,
            });
            this.micStream = stream;
            // The puppet head already has its own 3D eye spheres, so the
            // canvas face only draws the mouth (`showEyes: false`).
            this.face = new xb.StylizedFace({ showEyes: false });
            this.puppetHead?.add(this.face);
            this.mouth = new LipsyncMouth(stream, { target: this.face });
            this.puppetHead?.add(this.mouth);
            if (this.domBtn)
                this.domBtn.textContent = '🎙️ Disable mic';
            this.spatialBtn?.setText('🎙️ Disable mic');
            this.spatialStatus?.setText('mic: on. talk to the puppet');
        }
        catch (err) {
            this.started = false;
            const msg = err.message;
            if (this.domBtn)
                this.domBtn.textContent = `mic failed: ${msg}`;
            this.spatialStatus?.setText(`mic failed: ${msg}`);
        }
    }
    stopMic() {
        if (!this.started)
            return;
        this.started = false;
        if (this.mouth) {
            this.mouth.parent?.remove(this.mouth);
            this.mouth = undefined;
        }
        if (this.face) {
            this.face.parent?.remove(this.face);
            this.face.dispose();
            this.face = undefined;
        }
        if (this.micStream) {
            for (const t of this.micStream.getTracks())
                t.stop();
            this.micStream = undefined;
        }
        if (this.domBtn)
            this.domBtn.textContent = '🎙️ Start mic';
        this.spatialBtn?.setText('🎙️ Start mic');
        this.spatialStatus?.setText('mic: off');
    }
}
document.addEventListener('DOMContentLoaded', () => {
    const options = new xb.Options();
    options.reticles.enabled = true;
    options.controllers.visualizeRays = true;
    options.setAppTitle('Lipsync · Puppet');
    xb.add(new LipsyncPuppetSample());
    xb.init(options);
});
