import * as THREE from 'three';
import * as xb from 'xrblocks';
import { BroadcastChannelTransport } from 'netblocks';
import { NetSample } from '../../Sample.js';
import 'xrblocks/addons/simulator/SimulatorAddons.js';
import '../../roomCode.js';

/**
 * ObjectsSample.
 *
 * Spawns a small set of shared cubes with deterministic ids (so all
 * peers agree on which cube is which). Click-and-drag with the mouse,
 * or point and pinch in XR / with a sim controller. While dragging,
 * the local peer broadcasts ownership and transform updates; other
 * tabs see the cubes fly around in real time.
 *
 * Picking and drag mechanics mirror the integration sample: NDC-based
 * mouse hit-test, controller forward-ray hit-test, and a
 * plane-projection drag that preserves each cube's depth so they
 * don't snap into the camera.
 */
const NUM_CUBES = 4;
const CUBE_COLORS = [0x9177c7, 0x7ac0ff, 0xffb86b, 0x7be3a4];
class ObjectsSample extends NetSample {
    constructor() {
        super(...arguments);
        this._cubes = [];
        this._drag = null;
        this._ndc = new THREE.Vector2(-2, -2);
        this._mouseDown = false;
        this._mouseRaycaster = new THREE.Raycaster();
    }
    getJoinOptions() {
        return {
            roomId: 'netblocks-sample-objects',
            options: {
                transport: new BroadcastChannelTransport(),
                displayName: `User-${Math.floor(Math.random() * 1000)}`,
            },
        };
    }
    onSession(session) {
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
            edges.ignoreReticleRaycast = true;
            mesh.add(edges);
            cube.add(mesh);
            this._cubes.push(cube);
        }
        this._wireMouse();
    }
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
    }
    _tickDrag(session) {
        const camera = xb.core?.camera;
        if (!camera)
            return;
        const controllers = (xb.core?.input?.controllers ?? []).filter((c) => c && c.constructor?.name !== 'MouseController' && c.userData?.connected);
        if (!this._drag) {
            if (this._mouseDown && this._ndc.x > -2) {
                const cube = this._cubeUnderMouse(camera);
                if (cube)
                    return this._beginMouseDrag(session, cube, camera);
            }
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
    _controllerRay(controller) {
        controller.updateMatrixWorld();
        const origin = new THREE.Vector3();
        controller.getWorldPosition(origin);
        const direction = new THREE.Vector3(0, 0, -1).applyQuaternion(controller.getWorldQuaternion(new THREE.Quaternion()));
        return new THREE.Ray(origin, direction);
    }
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
    _cursorAtDistance(camera, distance, cameraWorld) {
        this._mouseRaycaster.setFromCamera(this._ndc, camera);
        const dir = this._mouseRaycaster.ray.direction;
        return cameraWorld.clone().add(dir.clone().multiplyScalar(distance));
    }
    _cubeUnderMouse(camera) {
        const camPos = new THREE.Vector3();
        camera.getWorldPosition(camPos);
        let best;
        let bestDist = Infinity;
        const tmp = new THREE.Vector3();
        for (const cube of this._cubes) {
            cube.getWorldPosition(tmp);
            tmp.project(camera);
            if (tmp.z > 1)
                continue;
            const dx = tmp.x - this._ndc.x;
            const dy = tmp.y - this._ndc.y;
            const d = Math.hypot(dx, dy);
            if (d > 0.15)
                continue;
            if (d < bestDist) {
                bestDist = d;
                best = cube;
            }
        }
        return best;
    }
}
NetSample.run(ObjectsSample);
