import * as THREE from 'three';
import * as xb from 'xrblocks';
import { Keyboard } from 'xrblocks/addons/virtualkeyboard/Keyboard.js';
import { BroadcastChannelTransport, AVATAR_PALETTE, hashStringToIndex } from 'netblocks';
import { NetSample } from '../Sample.js';
import 'xrblocks/addons/simulator/SimulatorAddons.js';
import '../roomCode.js';

/**
 * IntegrationSample.
 *
 * The "shared room" demo. Combines every netblocks subsystem in a
 * single page so you can stand in a room with another tab and:
 *   - see each other as live ball-and-stick avatars (presence)
 *   - grab and toss shared cubes (NetObjects with cooperative ownership)
 *   - chat over the typed events bus
 *   - fire shared emoji bursts (typed-events RPC) with B / grip
 *   - hear each other spatialized via WebRTC voice
 *
 * Movement, look, and the on-screen reticle come from the standard
 * xrblocks SimulatorControls (see google/xrblocks#262). The chat input
 * flips `xb.core.simulator.controls.enabled` on focus so typing doesn't
 * walk the avatar around — same pattern the chat sample uses. Each cube
 * is tagged `draggable` so the platform's built-in DragManager handles
 * translation; we only intercept `selectstart`/`selectend` to call
 * `session.claim()` / `session.release()` so the network knows who owns
 * what.
 */
const NUM_CUBES = 4;
const CUBE_COLORS = [0x9177c7, 0x7ac0ff, 0xffb86b, 0x7be3a4];
const PARTICLES_PER_BURST = 24;
const BURST_LIFETIME_MS = 1200;
class IntegrationSample extends NetSample {
    constructor() {
        super(...arguments);
        this._displayName = `User-${Math.floor(Math.random() * 1000)}`;
        this._cubes = [];
        this._drag = null;
        this._voiceOn = false;
        this._spatialLogLines = [];
        // Last canvas-relative pointer position (NDC space), used to bypass
        // the platform mouse raycaster (which has been returning intersections
        // mirrored around the origin in this sample) and pick cubes ourselves
        // off the camera + cursor directly. -2 is a sentinel meaning "no event
        // received yet" so we don't fire phantom hits at frame 0.
        this._ndc = new THREE.Vector2(-2, -2);
        this._mouseDown = false;
        this._mouseRaycaster = new THREE.Raycaster();
        this._bursts = [];
    }
    getJoinOptions() {
        return {
            roomId: 'netblocks-sample-integration',
            options: {
                // BroadcastChannel keeps the showcase self-contained: open the page
                // in two tabs and they see each other with no signaling broker. To
                // play across devices, click "Start new room" in the top-left HUD
                // and share the code — the framework swaps in WebRTCTransport.
                transport: new BroadcastChannelTransport(),
                displayName: this._displayName,
            },
        };
    }
    onSession(session) {
        this._spawnCubes(session);
        this._wireMouse();
        this._buildChatPanel(session);
        this._buildVoiceButton(session);
        this._buildSpatialHud(session);
        this._wireBursts(session);
    }
    // Track the canvas-relative cursor in NDC and our own mousedown
    // boolean. We intentionally don't rely on MouseController.userData
    // .selected for the mouse path because the platform's
    // setRaycasterFromController has been returning mirrored intersection
    // points for the simulator mouse in this sample.
    _wireMouse() {
        const canvas = xb.core?.renderer?.domElement;
        if (!canvas)
            return;
        const onMove = (e) => {
            const r = canvas.getBoundingClientRect();
            this._ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -(((e.clientY - r.top) / r.height) * 2 - 1));
        };
        const onDown = (e) => {
            if (e.button !== 0)
                return;
            onMove(e);
            this._mouseDown = true;
        };
        const onUp = (e) => {
            if (e.button !== 0)
                return;
            this._mouseDown = false;
        };
        canvas.addEventListener('pointermove', onMove);
        canvas.addEventListener('pointerdown', onDown);
        window.addEventListener('pointerup', onUp);
    }
    update(time, frame) {
        super.update(time, frame);
        const session = this.net.session;
        if (session)
            this._tickDrag(session);
        this._stepBursts();
    }
    // ---- Shared cubes ------------------------------------------------------
    _spawnCubes(session) {
        // Lay the cubes out in a short row in front of the default sim
        // camera (which sits at (0,1.6,0) looking down -Z) so they're in
        // view from the moment the demo loads.
        const z = -1;
        const y = 1.3;
        const xs = [-0.45, -0.15, 0.15, 0.45];
        for (let i = 0; i < NUM_CUBES; i++) {
            const cube = session.createNetObject({ id: `shared-cube-${i}` });
            cube.position.set(xs[i] ?? 0, y, z);
            const mesh = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.15, 0.15), new THREE.MeshBasicMaterial({
                color: CUBE_COLORS[i % CUBE_COLORS.length],
            }));
            const edges = new THREE.LineSegments(new THREE.EdgesGeometry(mesh.geometry), new THREE.LineBasicMaterial({
                color: 0x000000,
                transparent: true,
                opacity: 0.5,
            }));
            mesh.add(edges);
            cube.add(mesh);
            this._cubes.push(cube);
        }
    }
    // Simple plane-projection drag: on press, find the cube under the
    // cursor and remember (a) its distance from the camera and (b) the
    // offset from the cursor's world hit-point to the cube's world
    // position. Each frame we project the cursor onto the same-distance
    // plane in front of the camera and re-apply the offset. No matrix
    // gymnastics, no parent-frame issues.
    _tickDrag(session) {
        const camera = xb.core?.camera;
        if (!camera)
            return;
        const controllers = (xb.core?.input?.controllers ?? []).filter((c) => c && c.constructor?.name !== 'MouseController' && c.userData?.connected);
        if (!this._drag) {
            // Mouse path: pick whichever cube center is nearest the cursor.
            if (this._mouseDown && this._ndc.x > -2) {
                const cube = this._cubeUnderMouse(camera);
                if (cube)
                    return this._beginMouseDrag(session, cube, camera);
            }
            // Controller path: any selected XR/sim controller. Pick the cube
            // closest to the controller's forward ray.
            for (const c of controllers) {
                if (!c.userData?.selected)
                    continue;
                const cube = this._cubeUnderController(c);
                if (!cube)
                    continue;
                return this._beginControllerDrag(session, cube, c);
            }
            return;
        }
        const drag = this._drag;
        const stillHeld = drag.controller === null
            ? this._mouseDown
            : !!drag.controller.userData?.selected;
        if (!stillHeld) {
            session.release(drag.cube);
            this._drag = null;
            return;
        }
        // Compute the new world target.
        let targetWorld;
        if (drag.controller) {
            const ray = this._controllerRay(drag.controller);
            targetWorld = ray.origin
                .clone()
                .add(ray.direction.clone().multiplyScalar(drag.distance))
                .add(drag.offset);
        }
        else {
            const cameraWorld = new THREE.Vector3();
            camera.getWorldPosition(cameraWorld);
            const cursorWorld = this._cursorAtDistance(camera, drag.distance, cameraWorld);
            targetWorld = cursorWorld.add(drag.offset);
        }
        const cube = drag.cube;
        if (cube.parent) {
            cube.parent.updateMatrixWorld();
            const inv = new THREE.Matrix4().copy(cube.parent.matrixWorld).invert();
            cube.position.copy(targetWorld).applyMatrix4(inv);
        }
        else {
            cube.position.copy(targetWorld);
        }
    }
    _beginMouseDrag(session, cube, camera) {
        const cameraWorld = new THREE.Vector3();
        camera.getWorldPosition(cameraWorld);
        const cubeWorld = new THREE.Vector3();
        cube.getWorldPosition(cubeWorld);
        const distance = cameraWorld.distanceTo(cubeWorld);
        const cursorWorld = this._cursorAtDistance(camera, distance, cameraWorld);
        const offset = cubeWorld.clone().sub(cursorWorld);
        session.claim(cube);
        this._drag = { cube, distance, offset, controller: null };
    }
    _beginControllerDrag(session, cube, controller) {
        const ray = this._controllerRay(controller);
        const cubeWorld = new THREE.Vector3();
        cube.getWorldPosition(cubeWorld);
        const distance = ray.origin.distanceTo(cubeWorld);
        const onRay = ray.origin
            .clone()
            .add(ray.direction.clone().multiplyScalar(distance));
        const offset = cubeWorld.clone().sub(onRay);
        session.claim(cube);
        this._drag = { cube, distance, offset, controller };
    }
    // World-space ray from a controller pose: origin = controller world
    // position, direction = controller's local -Z mapped to world.
    _controllerRay(controller) {
        controller.updateMatrixWorld();
        const origin = new THREE.Vector3();
        controller.getWorldPosition(origin);
        const direction = new THREE.Vector3(0, 0, -1).applyQuaternion(controller.getWorldQuaternion(new THREE.Quaternion()));
        return new THREE.Ray(origin, direction);
    }
    // Pick the cube whose center is closest to the controller's forward
    // ray (within ~one cube radius perpendicular distance).
    _cubeUnderController(controller) {
        const ray = this._controllerRay(controller);
        let best;
        let bestDist = 0.15;
        const tmp = new THREE.Vector3();
        for (const cube of this._cubes) {
            cube.getWorldPosition(tmp);
            const along = tmp.clone().sub(ray.origin).dot(ray.direction);
            if (along <= 0)
                continue;
            const closest = ray.origin
                .clone()
                .add(ray.direction.clone().multiplyScalar(along));
            const d = closest.distanceTo(tmp);
            if (d < bestDist) {
                bestDist = d;
                best = cube;
            }
        }
        return best;
    }
    // Project the cursor (NDC) onto a plane perpendicular to the camera's
    // forward axis at the given distance from the camera.
    _cursorAtDistance(camera, distance, cameraWorld) {
        this._mouseRaycaster.setFromCamera(this._ndc, camera);
        const dir = this._mouseRaycaster.ray.direction;
        return cameraWorld.clone().add(dir.clone().multiplyScalar(distance));
    }
    // Pick the cube whose CENTER projects nearest to the cursor in NDC
    // space. This sidesteps THREE's `intersectObjects` returning multiple
    // (sometimes geometrically nonsensical) hits across the BoxGeometry
    // and EdgesGeometry children, and matches what the user actually
    // clicked on screen.
    _cubeUnderMouse(camera) {
        const camPos = new THREE.Vector3();
        camera.getWorldPosition(camPos);
        let best;
        let bestDist = Infinity;
        const tmp = new THREE.Vector3();
        for (const cube of this._cubes) {
            cube.getWorldPosition(tmp);
            tmp.project(camera);
            // Skip cubes behind the camera (z > 1 after projection).
            if (tmp.z > 1)
                continue;
            const dx = tmp.x - this._ndc.x;
            const dy = tmp.y - this._ndc.y;
            const d = Math.hypot(dx, dy);
            // Reject clicks that are too far from any cube to count as a hit
            // (~0.15 NDC units is roughly a cube radius at the default
            // viewing distance).
            if (d > 0.15)
                continue;
            if (d < bestDist) {
                bestDist = d;
                best = cube;
            }
        }
        return best;
    }
    // ---- Chat panel --------------------------------------------------------
    _buildChatPanel(session) {
        const panel = document.createElement('div');
        Object.assign(panel.style, {
            position: 'fixed',
            top: '20px',
            right: '20px',
            width: '320px',
            maxHeight: '60vh',
            display: 'flex',
            flexDirection: 'column',
            background: 'rgba(20, 20, 30, 0.85)',
            color: '#fff',
            borderRadius: '12px',
            padding: '10px',
            font: '13px system-ui, sans-serif',
            backdropFilter: 'blur(8px)',
            zIndex: '999',
            // Without this, dragging on the panel selects chat text instead of
            // grabbing the cube the user was actually aiming at.
            userSelect: 'none',
            WebkitUserSelect: 'none',
        });
        const header = document.createElement('div');
        header.textContent = `💬 ${this._displayName}`;
        Object.assign(header.style, {
            fontWeight: '600',
            marginBottom: '6px',
            color: '#bfa9ff',
        });
        panel.appendChild(header);
        const log = document.createElement('div');
        Object.assign(log.style, {
            flex: '1 1 auto',
            overflowY: 'auto',
            minHeight: '120px',
            padding: '4px 0',
        });
        panel.appendChild(log);
        this._log = log;
        this._chatPanel = panel;
        const inputRow = document.createElement('form');
        Object.assign(inputRow.style, {
            display: 'flex',
            gap: '6px',
            marginTop: '6px',
        });
        const input = document.createElement('input');
        input.type = 'text';
        input.placeholder = 'Say something…';
        input.maxLength = 280;
        Object.assign(input.style, {
            flex: '1 1 auto',
            padding: '6px 10px',
            borderRadius: '6px',
            border: '1px solid #444',
            background: '#13141c',
            color: '#fff',
            font: 'inherit',
            userSelect: 'text',
            WebkitUserSelect: 'text',
        });
        const send = document.createElement('button');
        send.type = 'submit';
        send.textContent = 'Send';
        Object.assign(send.style, {
            padding: '6px 14px',
            borderRadius: '6px',
            border: 'none',
            background: '#9177c7',
            color: '#fff',
            cursor: 'pointer',
            font: 'inherit',
        });
        inputRow.appendChild(input);
        inputRow.appendChild(send);
        panel.appendChild(inputRow);
        document.body.appendChild(panel);
        // Disable simulator controls while typing so WASD/space don't walk
        // the camera around (matches the chat sample / PR #262 pattern).
        const controls = xb.core?.simulator?.controls;
        input.addEventListener('focus', () => {
            if (controls)
                controls.enabled = false;
        });
        input.addEventListener('blur', () => {
            if (controls)
                controls.enabled = true;
        });
        inputRow.addEventListener('submit', (e) => {
            e.preventDefault();
            const text = input.value.trim();
            if (!text)
                return;
            const payload = {
                from: this._displayName,
                fromId: session.localPeerId,
                text,
                ts: Date.now(),
            };
            session.events.emit('chat-message', payload);
            this._appendLine(payload, true);
            input.value = '';
        });
        session.events.on('chat-message', (payload) => this._appendLine(payload, false));
    }
    _appendLine(p, self) {
        if (this._log) {
            const line = document.createElement('div');
            line.style.padding = '2px 0';
            const who = document.createElement('span');
            who.textContent = self ? 'you' : p.from;
            // Match the avatar head color so the sender name in chat lines up
            // with the body floating in the room. Local "you" uses a fixed
            // accent so it always reads as self.
            const colorHex = self
                ? '#9177c7'
                : '#' +
                    AVATAR_PALETTE[hashStringToIndex(p.fromId, AVATAR_PALETTE.length)]
                        .toString(16)
                        .padStart(6, '0');
            who.style.color = colorHex;
            who.style.fontWeight = '600';
            line.appendChild(who);
            line.appendChild(document.createTextNode(`: ${p.text}`));
            this._log.appendChild(line);
            this._log.scrollTop = this._log.scrollHeight;
        }
        this._appendSpatialLine(`${self ? 'you' : p.from}: ${p.text}`);
    }
    _appendSpatialLine(text) {
        if (!this._spatialLog)
            return;
        this._spatialLogLines.push(text);
        if (this._spatialLogLines.length > 12)
            this._spatialLogLines.shift();
        this._spatialLog.setText(this._spatialLogLines.join('\n'));
    }
    // ---- Spatial HUD (visible in immersive XR) -----------------------------
    _buildSpatialHud(session) {
        const panel = new xb.SpatialPanel({
            width: 1.4,
            height: 1.0,
            backgroundColor: '#1a1a2add',
        });
        const grid = panel.addGrid();
        grid.addRow({ weight: 0.1 }).addText({
            text: `💬 ${this._displayName}`,
            fontSize: 0.05,
            fontColor: '#bfa9ff',
            textAlign: 'center',
        });
        this._spatialLog = new xb.ScrollingTroikaTextView({
            text: '(start typing on the keyboard below to chat)',
            fontSize: 0.04,
            textAlign: 'left',
        });
        grid.addRow({ weight: 0.55 }).add(this._spatialLog);
        this._spatialDraft = grid.addRow({ weight: 0.13 }).addText({
            text: '› ',
            fontSize: 0.04,
            fontColor: '#7ac0ff',
            textAlign: 'left',
        });
        this._spatialVoiceBtn = grid.addRow({ weight: 0.22 }).addTextButton({
            text: '🎙️ Enable voice',
            fontColor: '#ffffff',
            backgroundColor: '#9177c7',
            fontSize: 0.18,
        });
        this._spatialVoiceBtn.onTriggered = () => this._toggleVoice(session);
        panel.position.set(-1.2, 1.5, -1.5);
        panel.rotation.y = Math.PI / 8;
        this.add(panel);
        this._buildKeyboard(session);
    }
    _buildKeyboard(session) {
        // Subclass to override init() (which would otherwise reset the
        // keyboard's transform to its default position above the user).
        class PositionedKeyboard extends Keyboard {
            init() {
                super.init();
                const sub = this.subspace;
                sub.position.set(-0.7, 0.7, -0.7);
                sub.scale.setScalar(0.6);
                sub.rotation.set(-Math.PI / 6, 0, 0);
            }
        }
        const keyboard = new PositionedKeyboard();
        this._keyboard = keyboard;
        xb.add(keyboard);
        keyboard.onTextChanged = (text) => {
            this._spatialDraft?.setText(`› ${text}`);
        };
        keyboard.onEnterPressed = (text) => {
            const trimmed = text.trim();
            if (!trimmed)
                return;
            const payload = {
                from: this._displayName,
                fromId: session.localPeerId,
                text: trimmed,
                ts: Date.now(),
            };
            session.events.emit('chat-message', payload);
            this._appendLine(payload, true);
            keyboard.setText('');
        };
    }
    async _toggleVoice(session) {
        if (this._voiceOn) {
            session.voice.disable();
            this._voiceOn = false;
            this._spatialVoiceBtn?.setText('🎙️ Enable voice');
        }
        else {
            try {
                await session.voice.enable(session.transport.remotePeerIds);
                this._voiceOn = true;
                this._spatialVoiceBtn?.setText('🔇 Disable voice');
            }
            catch (err) {
                this._appendSpatialLine(`voice error: ${err.message}`);
            }
        }
    }
    // ---- Voice button ------------------------------------------------------
    _buildVoiceButton(session) {
        const btn = document.createElement('button');
        btn.textContent = '🎙️ Enable voice';
        Object.assign(btn.style, {
            marginTop: '8px',
            padding: '8px 14px',
            background: '#9177c7',
            color: '#fff',
            border: 'none',
            borderRadius: '20px',
            fontSize: '13px',
            cursor: 'pointer',
            alignSelf: 'flex-start',
        });
        (this._chatPanel ?? document.body).appendChild(btn);
        btn.addEventListener('click', async () => {
            await this._toggleVoice(session);
            btn.textContent = this._voiceOn ? '🔇 Disable voice' : '🎙️ Enable voice';
        });
    }
    // ---- Emoji burst RPC ---------------------------------------------------
    // Press 'B' (or trigger an XR select on empty space) to fire a particle
    // puff that every peer sees. Demonstrates the typed events bus same as
    // the basic events sample, but here so the integration demo also shows
    // a visible RPC alongside chat and shared cubes.
    _wireBursts(session) {
        session.events.on('emoji-burst', (p) => this._spawnBurst(p));
        const fire = (origin) => {
            const payload = {
                x: origin.x,
                y: origin.y,
                z: origin.z,
                hue: Math.random(),
            };
            session.events.emit('emoji-burst', payload);
            this._spawnBurst(payload);
        };
        window.addEventListener('keydown', (e) => {
            if (e.key !== 'b' && e.key !== 'B')
                return;
            const t = e.target;
            if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA'))
                return;
            const cam = xb.core?.camera;
            if (!cam)
                return;
            const fwd = new THREE.Vector3(0, 0, -1).applyQuaternion(cam.quaternion);
            fire(cam.position.clone().add(fwd.multiplyScalar(1.2)));
        });
        // Quest grip button (squeeze) on either controller fires a burst from
        // the controller's tip — separate from the trigger so it doesn't
        // collide with cube drag (which uses select).
        xb.core?.input?.bindSqueezeStart?.((event) => {
            const ctrl = event.target;
            if (!ctrl)
                return;
            fire(ctrl.getWorldPosition(new THREE.Vector3()));
        });
    }
    _spawnBurst(p) {
        const positions = new Float32Array(PARTICLES_PER_BURST * 3);
        const velocities = new Float32Array(PARTICLES_PER_BURST * 3);
        for (let i = 0; i < PARTICLES_PER_BURST; i++) {
            positions[i * 3] = p.x;
            positions[i * 3 + 1] = p.y;
            positions[i * 3 + 2] = p.z;
            const theta = Math.random() * Math.PI * 2;
            const phi = Math.acos(2 * Math.random() - 1);
            const speed = 0.4 + Math.random() * 0.4;
            velocities[i * 3] = speed * Math.sin(phi) * Math.cos(theta);
            velocities[i * 3 + 1] = speed * Math.cos(phi) + 0.4;
            velocities[i * 3 + 2] = speed * Math.sin(phi) * Math.sin(theta);
        }
        const geom = new THREE.BufferGeometry();
        geom.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        const color = new THREE.Color().setHSL(p.hue, 0.85, 0.6);
        const mat = new THREE.PointsMaterial({
            color,
            size: 0.04,
            transparent: true,
        });
        const points = new THREE.Points(geom, mat);
        this.add(points);
        this._bursts.push({ points, velocities, bornAt: performance.now() });
    }
    _stepBursts() {
        const now = performance.now();
        const dt = 1 / 60;
        for (let i = this._bursts.length - 1; i >= 0; i--) {
            const b = this._bursts[i];
            const age = now - b.bornAt;
            if (age > BURST_LIFETIME_MS) {
                this.remove(b.points);
                b.points.geometry.dispose();
                b.points.material.dispose();
                this._bursts.splice(i, 1);
                continue;
            }
            const pos = b.points.geometry.getAttribute('position');
            for (let j = 0; j < pos.count; j++) {
                pos.setXYZ(j, pos.getX(j) + b.velocities[j * 3] * dt, pos.getY(j) + b.velocities[j * 3 + 1] * dt - 0.6 * dt, pos.getZ(j) + b.velocities[j * 3 + 2] * dt);
                b.velocities[j * 3 + 1] -= 1.5 * dt;
            }
            pos.needsUpdate = true;
            b.points.material.opacity =
                1 - age / BURST_LIFETIME_MS;
        }
    }
}
NetSample.run(IntegrationSample);
