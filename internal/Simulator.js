/**
 * Copyright 2025 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 *
 * @file xrblocks.js
 * @version v0.20.0
 * @commitid 95b37da
 * @builddate 2026-08-19T17:54:02.531Z
 * @description XR Blocks SDK, built from source with the above commit ID.
 * @agent When using with Gemini to create XR apps, use **Gemini Canvas** mode,
 * and follow rules below:
 * 1. Include the following importmap for maximum compatibility:
    "three": "https://cdn.jsdelivr.net/npm/three@0.184.0/build/three.module.js",
    "three/addons/": "https://cdn.jsdelivr.net/npm/three@0.184.0/examples/jsm/",
    "troika-three-text": "https://cdn.jsdelivr.net/gh/protectwise/troika@028b81cf308f0f22e5aa8e78196be56ec1997af5/packages/troika-three-text/src/index.js",
    "troika-three-utils": "https://cdn.jsdelivr.net/gh/protectwise/troika@v0.52.4/packages/troika-three-utils/src/index.js",
    "troika-worker-utils": "https://cdn.jsdelivr.net/gh/protectwise/troika@v0.52.4/packages/troika-worker-utils/src/index.js",
    "bidi-js": "https://esm.sh/bidi-js@%5E1.0.2?target=es2022",
    "webgl-sdf-generator": "https://esm.sh/webgl-sdf-generator@1.1.1/es2022/webgl-sdf-generator.mjs",
    "@pmndrs/uikit": "https://cdn.jsdelivr.net/npm/@pmndrs/uikit@1.0.64/dist/index.min.js",
    "@pmndrs/uikit-pub-sub": "https://cdn.jsdelivr.net/npm/@pmndrs/uikit-pub-sub@1.0.64/dist/index.min.js",
    "@pmndrs/msdfonts": "https://cdn.jsdelivr.net/npm/@pmndrs/msdfonts@1.0.64/dist/index.min.js",
    "@preact/signals-core": "https://cdn.jsdelivr.net/npm/@preact/signals-core@1.14.0/dist/signals-core.mjs",
    "yoga-layout/load": "https://cdn.jsdelivr.net/npm/yoga-layout@3.2.1/dist/src/load.js",
    "lit": "https://esm.sh/lit@3.3.1",
    "lit/": "https://esm.sh/lit@3.3.1/",
    "three-pathfinding": "https://cdn.jsdelivr.net/npm/three-pathfinding@1.3.0/dist/three-pathfinding.module.js",
    2. If the app focus on standalone objects, spawn it in front of the user in
    WebXR and rescale to reasonable physical size. Wrap them with xb.ModelViewer
    and make sure users can drag the platform to move it around in XR.
    3. When rendering a large scene, remember users may navigate the scene in a
    physical world space, also add locomotion methods like pinch to teleport.
    4. Do not halluciate mode files --- use either public high-quality assets,
    or generate from primitive shapes of use vox formats for voxels or
    lego-styles.
 */
import * as THREE from 'three';
import { FullScreenQuad } from 'three/addons/postprocessing/Pass.js';
import { K as Keycodes, S as SimulatorHandPose, a as Script, R as Reticle, b as SimulatorMode, c as SetSimulatorModeEvent, H as Handedness, d as SIMULATOR_HAND_POSE_ROTATIONS, e as SimulatorHandPoseChangeRequestEvent, f as HAND_JOINT_NAMES, r as resolveSimulatorHandPoseRotations, g as applySimulatorHandPoseRotationConstraints, h as disposeObjectChildren, i as SetSimulatorEnvironmentEvent, j as ShowSimulatorInstructionsEvent, k as SetSimulatorHandPhysicsEvent, l as Registry, W as WaitFrame, m as callInitWithDependencyInjection, M as ModelLoader, n as disposeObjectTree, o as World, D as Depth, O as Options, I as Interaction, p as Input, q as SimulatorOptions, X as XRDeviceCamera, P as Physics, s as SparkRendererHolder } from './entry.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import 'three/addons/webxr/XRControllerModelFactory.js';
import 'three/addons/webxr/XRHandModelFactory.js';
import 'three/addons/webxr/XREstimatedLight.js';
import 'three/addons/loaders/DRACOLoader.js';
import 'three/addons/loaders/KTX2Loader.js';

class SimulatorMediaDeviceInfo {
    constructor(deviceId = 'simulator', groupId = 'simulator', kind = 'videoinput', label = 'Simulator Camera') {
        this.deviceId = deviceId;
        this.groupId = groupId;
        this.kind = kind;
        this.label = label;
    }
}

var ConstrainDomStringMatch;
(function (ConstrainDomStringMatch) {
    ConstrainDomStringMatch[ConstrainDomStringMatch["EXACT"] = 0] = "EXACT";
    ConstrainDomStringMatch[ConstrainDomStringMatch["IDEAL"] = 1] = "IDEAL";
    ConstrainDomStringMatch[ConstrainDomStringMatch["ACCEPTABLE"] = 2] = "ACCEPTABLE";
    ConstrainDomStringMatch[ConstrainDomStringMatch["UNACCEPTABLE"] = 3] = "UNACCEPTABLE";
})(ConstrainDomStringMatch || (ConstrainDomStringMatch = {}));
/**
 * Evaluates how a string value satisfies a ConstrainDOMString constraint.
 *
 * @param constraint - The ConstrainDOMString to check against.
 * @param value - The string value to test.
 * @returns A `ConstrainDomStringMatch` enum indicating the match level.
 */
function evaluateConstrainDOMString(constraint, value) {
    // Helper to check for a match against a string or string array.
    const matches = (c, v) => {
        return typeof c === 'string' ? v === c : c.includes(v);
    };
    // If no constraint is given, the value is simply acceptable.
    if (constraint == null) {
        return ConstrainDomStringMatch.ACCEPTABLE;
    }
    // A standalone string or array is treated as an implicit 'exact' requirement.
    if (typeof constraint === 'string' || Array.isArray(constraint)) {
        return matches(constraint, value)
            ? ConstrainDomStringMatch.EXACT
            : ConstrainDomStringMatch.UNACCEPTABLE;
    }
    // Handle the object-based constraint.
    if (typeof constraint === 'object') {
        // The 'exact' property is a hard requirement that overrides all others.
        if (constraint.exact !== undefined) {
            return matches(constraint.exact, value)
                ? ConstrainDomStringMatch.EXACT
                : ConstrainDomStringMatch.UNACCEPTABLE;
        }
        // If there's no 'exact' constraint, check 'ideal'.
        if (constraint.ideal !== undefined) {
            if (matches(constraint.ideal, value)) {
                return ConstrainDomStringMatch.IDEAL;
            }
        }
        // If the value doesn't match 'ideal' (or if 'ideal' wasn't specified),
        // it's still acceptable because 'ideal' is only a preference.
        return ConstrainDomStringMatch.ACCEPTABLE;
    }
    // Fallback for any unknown constraint types.
    return ConstrainDomStringMatch.UNACCEPTABLE;
}

class SimulatorCamera {
    constructor(renderer) {
        this.renderer = renderer;
        this.cameraCreated = false;
        this.fps = 30;
        this.matchRenderingCamera = true;
        this.width = 512;
        this.height = 512;
        this.camera = new THREE.PerspectiveCamera();
    }
    init() {
        this.createSimulatorCamera();
    }
    createSimulatorCamera() {
        if (this.cameraCreated) {
            return;
        }
        this.canvas = document.createElement('canvas');
        this.canvas.width = this.width;
        this.canvas.height = this.height;
        this.context = this.canvas.getContext('2d');
        this.mediaStream = this.canvas.captureStream(this.fps);
        const videoTrack = this.mediaStream.getVideoTracks()[0];
        const id = this.mediaStream.getVideoTracks()[0].getSettings().deviceId;
        this.cameraInfo = new SimulatorMediaDeviceInfo(/*deviceId=*/ id);
        videoTrack.stop();
        this.cameraCreated = true;
    }
    async enumerateDevices() {
        if (this.cameraInfo) {
            return [this.cameraInfo];
        }
        return [];
    }
    onBeforeSimulatorSceneRender(camera, renderScene) {
        if (!this.cameraCreated) {
            return;
        }
        if (!this.matchRenderingCamera) {
            this.camera.position.copy(camera.position);
            this.camera.quaternion.copy(camera.quaternion);
            renderScene(this.camera);
            const sWidth = this.renderer.domElement.width;
            const sHeight = this.renderer.domElement.height;
            const aspectRatio = this.width / this.height;
            const croppedSourceWidth = Math.min(sWidth, sHeight * aspectRatio);
            const croppedSourceHeight = Math.min(sHeight, sWidth / aspectRatio);
            const sx = (sWidth - croppedSourceWidth) / 2;
            const sy = (sHeight - croppedSourceHeight) / 2;
            this.context.drawImage(this.renderer.domElement, sx, sy, croppedSourceWidth, croppedSourceHeight, 0, 0, this.width, this.height);
        }
    }
    onSimulatorSceneRendered() {
        if (!this.cameraCreated) {
            return;
        }
        if (this.matchRenderingCamera) {
            const sWidth = this.renderer.domElement.width;
            const sHeight = this.renderer.domElement.height;
            const aspectRatio = this.width / this.height;
            const croppedSourceWidth = Math.min(sWidth, sHeight * aspectRatio);
            const croppedSourceHeight = Math.min(sHeight, sWidth / aspectRatio);
            const sx = (sWidth - croppedSourceWidth) / 2;
            const sy = (sHeight - croppedSourceHeight) / 2;
            this.context.drawImage(this.renderer.domElement, sx, sy, croppedSourceWidth, croppedSourceHeight, 0, 0, this.width, this.height);
        }
    }
    restartVideoTrack() {
        if (!this.cameraCreated) {
            return;
        }
        this.mediaStream = this.canvas.captureStream(this.fps);
        const id = this.mediaStream.getVideoTracks()[0].getSettings().deviceId;
        this.cameraInfo.deviceId = id || '';
    }
    getMedia(constraints = {}) {
        if (!this.cameraCreated) {
            return;
        }
        if (!constraints?.deviceId ||
            evaluateConstrainDOMString(constraints?.deviceId, this.cameraInfo.deviceId) != ConstrainDomStringMatch.UNACCEPTABLE) {
            const videoTrack = this.mediaStream.getVideoTracks()[0];
            if (videoTrack.readyState == 'ended') {
                this.restartVideoTrack();
            }
            return this.mediaStream;
        }
        return null;
    }
    dispose() {
        for (const track of this.mediaStream?.getTracks() ?? [])
            track.stop();
        this.mediaStream = undefined;
        this.cameraInfo = undefined;
        this.canvas = undefined;
        this.context = undefined;
        this.cameraCreated = false;
    }
}

const AVERAGE_IPD_METERS = 0.063;
var SimulatorRenderMode;
(function (SimulatorRenderMode) {
    SimulatorRenderMode["DEFAULT"] = "default";
    SimulatorRenderMode["STEREO_LEFT"] = "left";
    SimulatorRenderMode["STEREO_RIGHT"] = "right";
})(SimulatorRenderMode || (SimulatorRenderMode = {}));

class SimulatorControllerState {
    constructor() {
        this.localControllerPositions = [
            new THREE.Vector3(-0.3, -0.1, -0.3),
            new THREE.Vector3(0.3, -0.1, -0.3),
        ];
        this.localControllerOrientations = [
            new THREE.Quaternion(),
            new THREE.Quaternion(),
        ];
        this.currentControllerIndex = 0;
    }
}

const { A_CODE: A_CODE$1, D_CODE: D_CODE$1, E_CODE: E_CODE$1, Q_CODE: Q_CODE$1, S_CODE: S_CODE$1, W_CODE: W_CODE$1 } = Keycodes;
const vector3$2 = new THREE.Vector3();
const desiredCameraPosition = new THREE.Vector3();
const originVec = new THREE.Vector3();
const forwardVec = new THREE.Vector3(0, 0, -1);
const offsetVec = new THREE.Vector3();
const axisVec = new THREE.Vector3();
const currentOffsetVec = new THREE.Vector3();
const newOffsetVec = new THREE.Vector3();
const euler = new THREE.Euler();
const yawEuler = new THREE.Euler();
const yawQuaternion = new THREE.Quaternion();
const HAND_POSES = Object.values(SimulatorHandPose);
class SimulatorControlMode {
    /**
     * Create a SimulatorControlMode
     */
    constructor(simulatorControllerState, downKeys, hands, navMesh, setStereoRenderMode, toggleUserInterface, cycleSimulatorMode = () => { }) {
        this.simulatorControllerState = simulatorControllerState;
        this.downKeys = downKeys;
        this.hands = hands;
        this.navMesh = navMesh;
        this.setStereoRenderMode = setStereoRenderMode;
        this.toggleUserInterface = toggleUserInterface;
        this.cycleSimulatorMode = cycleSimulatorMode;
    }
    /**
     * Initialize the simulator control mode.
     */
    init({ camera, input, interaction, timer, domElement, simulatorOptions, }) {
        this.camera = camera;
        this.input = input;
        this.interaction = interaction;
        this.timer = timer;
        this.domElement = domElement;
        this.simulatorOptions = simulatorOptions;
        input.gamepadController.init({ camera });
    }
    onPointerDown(_) { }
    onPointerUp(_) { }
    onPointerMove(_) { }
    onWheel(_) {
        return false;
    }
    onKeyDown(event) {
        if (event.code == Keycodes.DIGIT_1) {
            this.setStereoRenderMode(SimulatorRenderMode.STEREO_LEFT);
        }
        else if (event.code == Keycodes.DIGIT_2) {
            this.setStereoRenderMode(SimulatorRenderMode.STEREO_RIGHT);
        }
        else if (event.code == Keycodes.BACKQUOTE) {
            this.toggleUserInterface();
        }
    }
    onModeActivated() { }
    onModeDeactivated() { }
    update() {
        this.updateGamepad();
        this.updateCameraPosition();
        this.updateControllerPositions();
    }
    /**
     * Poll the gamepad and handle button actions. Called from all modes.
     */
    updateGamepad() {
        const gp = this.input.gamepadController;
        gp.update();
        if (gp.userData.connected) {
            this.updateGamepadUI(gp);
        }
    }
    updateCameraPosition() {
        const gp = this.input.gamepadController;
        // While a modal menu owns gamepad input, don't move the camera.
        if (gp.menuActive)
            return;
        const deltaTime = this.timer.getDelta();
        const cameraRotation = this.camera.quaternion;
        const downKeys = this.downKeys;
        this.applyYawRelativeMovement(Number(downKeys.has(D_CODE$1)) - Number(downKeys.has(A_CODE$1)), this.navMesh.constrained
            ? 0
            : Number(downKeys.has(Q_CODE$1)) - Number(downKeys.has(E_CODE$1)), Number(downKeys.has(S_CODE$1)) - Number(downKeys.has(W_CODE$1)), deltaTime);
        // Gamepad stick input (if connected). Skip while the tab isn't
        // focused — the Gamepad API delivers state to every tab, so without
        // this guard the camera moves in background tabs whenever the user
        // touches the stick in the foreground tab.
        if (gp.userData.connected && document.hasFocus()) {
            const [lx, ly, rx, ry] = gp.getAxes();
            // Left stick → move camera.
            if (lx !== 0 || ly !== 0) {
                this.applyYawRelativeMovement(lx, 0, ly, deltaTime);
            }
            // Right stick → look (yaw + pitch).
            if (rx !== 0 || ry !== 0) {
                const LOOK_SPEED = 2.0;
                euler.setFromQuaternion(cameraRotation, 'YXZ');
                euler.y -= rx * LOOK_SPEED * deltaTime;
                euler.x -= ry * LOOK_SPEED * deltaTime;
                const PI_2 = Math.PI / 2;
                euler.x = Math.max(-PI_2 + 0.01, Math.min(PI_2 - 0.01, euler.x));
                cameraRotation.setFromEuler(euler);
            }
            // Configurable vertical movement bindings (defaults LT/RT, analog).
            if (!this.navMesh.constrained) {
                const downVal = gp.getButtonValue(gp.bindings.getBinding('moveDown'));
                const upVal = gp.getButtonValue(gp.bindings.getBinding('moveUp'));
                const verticalDelta = (upVal - downVal) * deltaTime;
                if (verticalDelta !== 0) {
                    desiredCameraPosition.copy(this.camera.position);
                    desiredCameraPosition.y += verticalDelta;
                    this.navMesh.applyUserMovement(this.camera, desiredCameraPosition);
                }
            }
        }
    }
    applyYawRelativeMovement(localX, localY, localZ, deltaTime) {
        euler.setFromQuaternion(this.camera.quaternion, 'YXZ');
        yawEuler.set(0, euler.y, 0, 'YXZ');
        yawQuaternion.setFromEuler(yawEuler);
        vector3$2
            .set(localX, 0, localZ)
            .multiplyScalar(deltaTime)
            .applyQuaternion(yawQuaternion);
        vector3$2.y += localY * deltaTime;
        desiredCameraPosition.copy(this.camera.position).add(vector3$2);
        this.navMesh.applyUserMovement(this.camera, desiredCameraPosition);
    }
    /**
     * Handle gamepad buttons for simulator UI using configurable bindings.
     */
    updateGamepadUI(gp) {
        // Suppress normal actions during rebind or while a modal menu owns input.
        if (gp.captureActive || gp.menuActive)
            return;
        const b = gp.bindings;
        if (gp.isButtonJustPressed(b.getBinding('cycleHandPoseLeft'))) {
            this.cycleHandPose(-1);
        }
        if (gp.isButtonJustPressed(b.getBinding('cycleHandPoseRight'))) {
            this.cycleHandPose(1);
        }
        if (gp.isButtonJustPressed(b.getBinding('cycleSimulatorMode'))) {
            this.cycleSimulatorMode();
        }
        if (gp.isButtonJustPressed(b.getBinding('toggleUI'))) {
            this.toggleUserInterface();
        }
        if (gp.isButtonJustPressed(b.getBinding('toggleHand'))) {
            this.hands.toggleHandedness();
        }
        if (gp.isButtonJustPressed(b.getBinding('openSettings'))) {
            gp.onOpenSettings?.();
        }
    }
    cycleHandPose(direction) {
        const idx = this.simulatorControllerState.currentControllerIndex;
        const currentPose = idx === 0 ? this.hands.leftHandPose : this.hands.rightHandPose;
        const currentIdx = HAND_POSES.indexOf(currentPose ?? HAND_POSES[0]);
        const nextIdx = (currentIdx + direction + HAND_POSES.length) % HAND_POSES.length;
        const nextPose = HAND_POSES[nextIdx];
        if (idx === 0) {
            this.hands.setLeftHandLerpPose(nextPose);
        }
        else {
            this.hands.setRightHandLerpPose(nextPose);
        }
    }
    getHandOrigin(idx, target) {
        const distOpt = this.simulatorOptions?.reachDistance;
        const angleOpt = this.simulatorOptions?.reachAngle;
        if (!distOpt?.enabled && !angleOpt?.enabled)
            return false;
        const originObj = idx === 0
            ? this.simulatorOptions.leftHandOrigin
            : this.simulatorOptions.rightHandOrigin;
        target.set(originObj.x, originObj.y, originObj.z);
        return true;
    }
    limitMovementAtReachEdge(idx, localPos, delta) {
        if (!this.getHandOrigin(idx, originVec))
            return;
        const distOpt = this.simulatorOptions.reachDistance;
        const angleOpt = this.simulatorOptions.reachAngle;
        currentOffsetVec.copy(localPos).sub(originVec);
        newOffsetVec.copy(currentOffsetVec).add(delta);
        if (distOpt.enabled) {
            const curDistSq = currentOffsetVec.lengthSq();
            const radSq = distOpt.radius * distOpt.radius;
            if (curDistSq >= radSq && newOffsetVec.lengthSq() >= curDistSq) {
                delta.set(0, 0, 0);
                return;
            }
        }
        if (angleOpt.enabled) {
            const maxAngle = angleOpt.angle * 0.5;
            const curAngle = currentOffsetVec.angleTo(forwardVec);
            if (curAngle >= maxAngle &&
                newOffsetVec.angleTo(forwardVec) >= curAngle) {
                delta.set(0, 0, 0);
            }
        }
    }
    updateControllerPositions() {
        const distOpt = this.simulatorOptions?.reachDistance;
        const angleOpt = this.simulatorOptions?.reachAngle;
        const distEnabled = !!distOpt?.enabled;
        const angleEnabled = !!angleOpt?.enabled;
        if (distEnabled || angleEnabled) {
            const radius = distOpt.radius;
            const maxAngle = angleOpt.angle * 0.5;
            for (let i = 0; i < 2; i++) {
                this.getHandOrigin(i, originVec);
                const localPos = this.simulatorControllerState.localControllerPositions[i];
                offsetVec.copy(localPos).sub(originVec);
                const dist = offsetVec.length();
                const angle = offsetVec.angleTo(forwardVec);
                const atMax = (distEnabled && dist >= radius) ||
                    (angleEnabled && angle >= maxAngle);
                if (i === 0) {
                    this.hands.leftHandAtMaxRange = atMax;
                }
                else {
                    this.hands.rightHandAtMaxRange = atMax;
                }
                if (angleEnabled && angle > maxAngle) {
                    axisVec.copy(offsetVec).cross(forwardVec);
                    if (axisVec.lengthSq() < 1e-6) {
                        axisVec.set(0, 1, 0);
                    }
                    else {
                        axisVec.normalize();
                    }
                    offsetVec.applyAxisAngle(axisVec, angle - maxAngle);
                }
                if (distEnabled && offsetVec.lengthSq() > radius * radius) {
                    offsetVec.clampLength(0, radius);
                }
                localPos.copy(originVec).add(offsetVec);
            }
        }
        else {
            this.hands.leftHandAtMaxRange = false;
            this.hands.rightHandAtMaxRange = false;
        }
        this.camera.updateMatrixWorld();
        for (let i = 0; i < 2 && i < this.input.controllers.length; i++) {
            const controller = this.input.controllers[i];
            controller.position
                .copy(this.simulatorControllerState.localControllerPositions[i])
                .applyMatrix4(this.camera.matrixWorld);
            controller.quaternion
                .copy(this.simulatorControllerState.localControllerOrientations[i])
                .premultiply(this.camera.quaternion);
            controller.updateMatrix();
            const mesh = i == 0 ? this.hands.leftController : this.hands.rightController;
            mesh.position.copy(controller.position);
            mesh.quaternion.copy(controller.quaternion);
        }
    }
    rotateOnPointerMove(event, objectQuaternion, multiplier = 0.002) {
        euler.setFromQuaternion(objectQuaternion, 'YXZ');
        euler.y += event.movementX * multiplier;
        euler.x += event.movementY * multiplier;
        // Clamp camera pitch to +/-90 deg (+/-1.57 rad) with a 0.01 rad (0.573 deg)
        // buffer to prevent gimbal lock.
        const PI_2 = Math.PI / 2;
        euler.x = Math.max(-PI_2 + 0.01, Math.min(PI_2 - 0.01, euler.x));
        objectQuaternion.setFromEuler(euler);
    }
    enableSimulatorHands() {
        this.hands.showHands();
        this.input.dispatchEvent({
            type: 'connected',
            target: this.input.controllers[0],
            data: { handedness: 'left' },
        });
        this.input.dispatchEvent({
            type: 'connected',
            target: this.input.controllers[1],
            data: { handedness: 'right' },
        });
    }
    disableSimulatorHands() {
        this.hands.hideHands();
        this.input.dispatchEvent({
            type: 'disconnected',
            target: this.input.controllers[0],
            data: { handedness: 'left' },
        });
        this.input.dispatchEvent({
            type: 'disconnected',
            target: this.input.controllers[1],
            data: { handedness: 'right' },
        });
    }
}

const vector3$1 = new THREE.Vector3();
const { A_CODE, D_CODE, E_CODE, Q_CODE, S_CODE, SPACE_CODE, T_CODE, W_CODE } = Keycodes;
class SimulatorControllerMode extends SimulatorControlMode {
    onPointerMove(event) {
        if (event.buttons) {
            const controllerOrientation = this.simulatorControllerState.localControllerOrientations[this.simulatorControllerState.currentControllerIndex];
            this.rotateOnPointerMove(event, controllerOrientation, -2e-3);
        }
    }
    update() {
        this.updateGamepad();
        this.updateControllerPositions();
    }
    onModeActivated() {
        this.enableSimulatorHands();
    }
    updateControllerPositions() {
        const deltaTime = this.timer.getDelta();
        const downKeys = this.downKeys;
        const idx = this.simulatorControllerState.currentControllerIndex;
        const localPos = this.simulatorControllerState.localControllerPositions[idx];
        vector3$1
            .set(Number(downKeys.has(D_CODE)) - Number(downKeys.has(A_CODE)), Number(downKeys.has(Q_CODE)) - Number(downKeys.has(E_CODE)), Number(downKeys.has(S_CODE)) - Number(downKeys.has(W_CODE)))
            .multiplyScalar(deltaTime);
        this.limitMovementAtReachEdge(idx, localPos, vector3$1);
        localPos.add(vector3$1);
        // Gamepad: left stick moves hand on XZ; configurable buttons on Y.
        // Skip when the tab isn't focused so background tabs don't react to
        // stick input meant for the foreground tab.
        const gp = this.input.gamepadController;
        if (gp.userData.connected && !gp.menuActive && document.hasFocus()) {
            const [lx, ly] = gp.getAxes();
            const downVal = gp.getButtonValue(gp.bindings.getBinding('moveDown'));
            const upVal = gp.getButtonValue(gp.bindings.getBinding('moveUp'));
            vector3$1.set(lx, upVal - downVal, ly).multiplyScalar(deltaTime);
            this.limitMovementAtReachEdge(idx, localPos, vector3$1);
            localPos.add(vector3$1);
        }
        super.updateControllerPositions();
    }
    toggleControllerIndex() {
        this.hands.toggleHandedness();
    }
    onKeyDown(event) {
        super.onKeyDown(event);
        if (event.code == T_CODE) {
            this.toggleControllerIndex();
        }
        else if (event.code == SPACE_CODE) {
            const controllerSelecting = this.input.controllers[this.simulatorControllerState.currentControllerIndex].userData?.selected;
            const newSelectingState = !controllerSelecting;
            if (this.simulatorControllerState.currentControllerIndex == 0) {
                this.hands.setLeftHandPinching(newSelectingState);
            }
            else {
                this.hands.setRightHandPinching(newSelectingState);
            }
        }
    }
}

const WHEEL_SCALE_SPEED = 0.001;
// Approximate one line-mode wheel unit as 16 CSS pixels.
const WHEEL_LINE_HEIGHT = 16;
class SimulatorUserMode extends SimulatorControlMode {
    onModeActivated() {
        this.disableSimulatorHands();
        this.input.mouseController.connect();
    }
    onModeDeactivated() {
        this.input.mouseController.disconnect();
    }
    /**
     * In User mode, hands are hidden — switch to a hand-visible mode
     * before cycling so the change is visible.
     */
    cycleHandPose(direction) {
        this.cycleSimulatorMode();
        super.cycleHandPose(direction);
    }
    onPointerDown(event) {
        if (event.buttons & 1) {
            this.input.mouseController.callSelectStart();
        }
    }
    onPointerUp() {
        if (this.input.mouseController.userData.selected) {
            this.input.mouseController.callSelectEnd();
        }
    }
    onPointerMove(event) {
        this.input.mouseController.updateMousePositionFromEvent(event);
        if (event.buttons & 2) {
            this.rotateOnPointerMove(event, this.camera.quaternion);
        }
    }
    onWheel(event) {
        let deltaY = event.deltaY;
        if (event.deltaMode === WheelEvent.DOM_DELTA_LINE) {
            deltaY *= WHEEL_LINE_HEIGHT;
        }
        else if (event.deltaMode === WheelEvent.DOM_DELTA_PAGE) {
            deltaY *= this.domElement?.clientHeight || window.innerHeight;
        }
        if (deltaY === 0) {
            return false;
        }
        const mouseController = this.input.mouseController;
        mouseController.updateMousePositionFromEvent(event);
        if (!mouseController.userData.connected) {
            return false;
        }
        return (this.interaction?.queueScaleIntent(mouseController, Math.exp(-deltaY * WHEEL_SCALE_SPEED)) ?? false);
    }
}

/**
 * Identical to SimulatorUserMode for camera movement and click-raycast
 * behavior (WASDQE navigation, plain left-click = raycast) -- it exists as
 * its own SimulatorMode purely so an addon (e.g. a scene editor) can key
 * off `simulatorMode === SimulatorMode.EDITOR` to decide whether to show
 * its own UI, without changing how the user navigates or clicks.
 */
class SimulatorEditorMode extends SimulatorUserMode {
}

class SimulatorPoseMode extends SimulatorControlMode {
    onModeActivated() {
        this.enableSimulatorHands();
    }
    onPointerMove(event) {
        if (event.buttons) {
            this.rotateOnPointerMove(event, this.camera.quaternion);
        }
    }
}

class SimulatorPointerLockController extends Script {
    constructor() {
        super(...arguments);
        this.type = 'SimulatorPointerLockController';
        this.name = 'Simulator Pointer Lock Controller';
        this.userData = { id: 4, connected: false, selected: false };
        this.reticle = new Reticle();
    }
    static { this.dependencies = { camera: THREE.Camera }; }
    init({ camera }) {
        this.camera = camera;
    }
    updatePose() {
        this.position.copy(this.camera.position);
        this.quaternion.copy(this.camera.quaternion);
        this.updateMatrixWorld();
    }
    update() {
        super.update();
        if (!this.userData.connected)
            return;
        this.updatePose();
    }
    callSelectStart() {
        this.dispatchEvent({ type: 'selectstart', target: this });
    }
    callSelectEnd() {
        this.dispatchEvent({ type: 'selectend', target: this });
    }
    connect() {
        this.dispatchEvent({ type: 'connected', target: this });
    }
    disconnect() {
        this.dispatchEvent({ type: 'disconnected', target: this });
    }
}

class SimulatorPointerLockMode extends SimulatorControlMode {
    constructor() {
        super(...arguments);
        this.isPointerLocked = false;
        this.pointerLockController = new SimulatorPointerLockController();
        this.onPointerLockChange = () => {
            this.isPointerLocked = document.pointerLockElement === this.domElement;
        };
    }
    init(params) {
        super.init(params);
        this.pointerLockController.init({ camera: params.camera });
    }
    onModeActivated() {
        this.disableSimulatorHands();
        this.input.enableController(this.pointerLockController);
        document.addEventListener('pointerlockchange', this.onPointerLockChange);
    }
    onModeDeactivated() {
        this.input.disableController(this.pointerLockController);
        this.exitLock();
        document.removeEventListener('pointerlockchange', this.onPointerLockChange);
    }
    exitLock() {
        if (document.pointerLockElement === this.domElement) {
            document.exitPointerLock();
        }
    }
    onPointerDown(event) {
        if (!this.isPointerLocked && this.domElement) {
            this.domElement.requestPointerLock();
        }
        else if (this.isPointerLocked && event.buttons & 1) {
            this.pointerLockController.userData.selected = true;
            this.pointerLockController.callSelectStart();
        }
    }
    onPointerUp() {
        if (this.pointerLockController.userData.selected) {
            this.pointerLockController.userData.selected = false;
            this.pointerLockController.callSelectEnd();
        }
    }
    onPointerMove(event) {
        if (this.isPointerLocked) {
            this.rotateOnPointerMove(event, this.camera.quaternion);
        }
    }
}

function preventDefault(event) {
    event.preventDefault();
}
class SimulatorControls {
    #enabled;
    get enabled() {
        return this.#enabled;
    }
    set enabled(value) {
        this.setEnabled(value);
    }
    /**
     * Create the simulator controls.
     * @param hands - The simulator hands manager.
     * @param setStereoRenderMode - A function to set the stereo mode.
     * @param userInterface - The simulator user interface manager.
     */
    constructor(simulatorControllerState, hands, navMesh, setStereoRenderMode, userInterface) {
        this.simulatorControllerState = simulatorControllerState;
        this.hands = hands;
        this.navMesh = navMesh;
        this.userInterface = userInterface;
        this.pointerDown = false;
        this.downKeys = new Set();
        this.simulatorMode = SimulatorMode.USER;
        this.connected = false;
        this.initialized = false;
        this.#enabled = true;
        this.onPointerMove = (event) => {
            if (!this.enabled)
                return;
            this.simulatorModeControls.onPointerMove(event);
        };
        this.onPointerDown = (event) => {
            if (!this.enabled)
                return;
            this.simulatorModeControls.onPointerDown(event);
            this.pointerDown = true;
            this.activePointerId = event.pointerId;
            if (this.simulatorMode !== SimulatorMode.POINTER_LOCK) {
                this.renderer?.domElement.setPointerCapture?.(event.pointerId);
            }
        };
        this.onPointerUp = (event) => {
            if (!this.enabled)
                return;
            this.endPointerInteraction(event);
            this.releasePointerCapture(event.pointerId);
        };
        this.onPointerCancel = (event) => {
            this.endPointerInteraction(event);
            this.releasePointerCapture(event.pointerId);
        };
        this.onLostPointerCapture = (event) => {
            if (event.pointerId !== this.activePointerId)
                return;
            this.activePointerId = undefined;
            this.endPointerInteraction(event);
        };
        this.onWheel = (event) => {
            if (!this.enabled)
                return;
            if (this.simulatorModeControls.onWheel(event)) {
                event.preventDefault();
            }
        };
        this.onKeyDown = (event) => {
            if (!this.enabled)
                return;
            // On macOS, keyup events are not fired for keys held when Command (Meta)
            // is pressed. Clear all keys to prevent stuck movement.
            if (event.metaKey ||
                event.code === 'MetaLeft' ||
                event.code === 'MetaRight') {
                this.downKeys.clear();
                return;
            }
            this.downKeys.add(event.code);
            if (this.simulatorOptions?.modeToggle.enabled &&
                event.code === this.simulatorOptions.modeToggle.toggleKey) {
                this.setSimulatorMode(this.simulatorOptions.modeToggle.toggleOrder[this.simulatorMode]);
            }
            this.simulatorModeControls.onKeyDown(event);
        };
        this.onKeyUp = (event) => {
            if (!this.enabled)
                return;
            this.downKeys.delete(event.code);
        };
        this.onBlur = () => {
            this.downKeys.clear();
            this.cancelPointerInteraction();
        };
        this.onSetSimulatorMode = (event) => {
            if (event instanceof SetSimulatorModeEvent) {
                this.setSimulatorMode(event.simulatorMode);
            }
        };
        const toggleUserInterface = () => {
            this.userInterface.toggleInterfaceVisible();
        };
        const cycleSimulatorMode = () => {
            if (!this.simulatorOptions)
                return;
            this.setSimulatorMode(this.simulatorOptions.modeToggle.toggleOrder[this.simulatorMode]);
        };
        this.simulatorModes = {
            [SimulatorMode.USER]: new SimulatorUserMode(this.simulatorControllerState, this.downKeys, hands, navMesh, setStereoRenderMode, toggleUserInterface, cycleSimulatorMode),
            [SimulatorMode.POSE]: new SimulatorPoseMode(this.simulatorControllerState, this.downKeys, hands, navMesh, setStereoRenderMode, toggleUserInterface, cycleSimulatorMode),
            [SimulatorMode.CONTROLLER]: new SimulatorControllerMode(this.simulatorControllerState, this.downKeys, hands, navMesh, setStereoRenderMode, toggleUserInterface, cycleSimulatorMode),
            [SimulatorMode.POINTER_LOCK]: new SimulatorPointerLockMode(this.simulatorControllerState, this.downKeys, hands, navMesh, setStereoRenderMode, toggleUserInterface, cycleSimulatorMode),
            [SimulatorMode.EDITOR]: new SimulatorEditorMode(this.simulatorControllerState, this.downKeys, hands, navMesh, setStereoRenderMode, toggleUserInterface, cycleSimulatorMode),
        };
        this.simulatorModeControls = this.simulatorModes[this.simulatorMode];
    }
    /**
     * Initialize the simulator controls.
     */
    init({ camera, input, interaction, timer, renderer, simulatorOptions, }) {
        for (const mode in this.simulatorModes) {
            this.simulatorModes[mode].init({
                camera,
                input,
                interaction,
                timer,
                domElement: renderer.domElement,
                simulatorOptions,
            });
        }
        this.renderer = renderer;
        this.setSimulatorMode(simulatorOptions.defaultMode);
        this.simulatorControllerState.currentControllerIndex =
            simulatorOptions.defaultHand === Handedness.LEFT ? 0 : 1;
        this.simulatorOptions = simulatorOptions;
        this.initialized = true;
        this.connect();
    }
    connect() {
        if (this.connected)
            return;
        const domElement = this.renderer?.domElement;
        if (!domElement)
            throw new Error('SimulatorControls is not initialized.');
        document.addEventListener('keyup', this.onKeyUp);
        document.addEventListener('keydown', this.onKeyDown);
        domElement.addEventListener('pointermove', this.onPointerMove);
        domElement.addEventListener('pointerdown', this.onPointerDown);
        domElement.addEventListener('pointerup', this.onPointerUp);
        domElement.addEventListener('pointercancel', this.onPointerCancel);
        domElement.addEventListener('lostpointercapture', this.onLostPointerCapture);
        domElement.addEventListener('wheel', this.onWheel, { passive: false });
        domElement.addEventListener('contextmenu', preventDefault);
        window.addEventListener('blur', this.onBlur);
        document.addEventListener('visibilitychange', this.onBlur);
        this.connected = true;
    }
    disconnect() {
        if (!this.connected)
            return;
        const domElement = this.renderer?.domElement;
        if (!domElement) {
            this.connected = false;
            return;
        }
        document.removeEventListener('keyup', this.onKeyUp);
        document.removeEventListener('keydown', this.onKeyDown);
        domElement.removeEventListener('pointermove', this.onPointerMove);
        domElement.removeEventListener('pointerdown', this.onPointerDown);
        domElement.removeEventListener('pointerup', this.onPointerUp);
        domElement.removeEventListener('pointercancel', this.onPointerCancel);
        domElement.removeEventListener('lostpointercapture', this.onLostPointerCapture);
        domElement.removeEventListener('wheel', this.onWheel);
        domElement.removeEventListener('contextmenu', preventDefault);
        window.removeEventListener('blur', this.onBlur);
        document.removeEventListener('visibilitychange', this.onBlur);
        this.connected = false;
        this.onBlur();
    }
    update() {
        this.simulatorModeControls.update();
    }
    setSimulatorMode(mode) {
        this.simulatorMode = mode;
        this.simulatorModeControls.onModeDeactivated();
        this.simulatorModeControls = this.simulatorModes[this.simulatorMode];
        this.simulatorModeControls.onModeActivated();
        if (this.simulatorSettingsPanelElement) {
            this.simulatorSettingsPanelElement.simulatorMode = mode;
        }
    }
    setSimulatorSettingsPanelElement(element) {
        this.simulatorSettingsPanelElement?.removeEventListener('setSimulatorMode', this.onSetSimulatorMode);
        element.simulatorMode = this.simulatorMode;
        element.addEventListener('setSimulatorMode', this.onSetSimulatorMode);
        this.simulatorSettingsPanelElement = element;
    }
    dispose() {
        this.disconnect();
        if (this.initialized) {
            this.simulatorModeControls.onModeDeactivated();
            this.initialized = false;
        }
        this.simulatorSettingsPanelElement?.removeEventListener('setSimulatorMode', this.onSetSimulatorMode);
        this.simulatorSettingsPanelElement = undefined;
        this.simulatorOptions = undefined;
        this.setEnabled(false);
        this.renderer = undefined;
    }
    setEnabled(value) {
        if (value == this.#enabled) {
            return;
        }
        this.#enabled = value;
        if (!value) {
            this.downKeys.clear();
            this.cancelPointerInteraction();
        }
    }
    cancelPointerInteraction() {
        if (!this.pointerDown && this.activePointerId === undefined)
            return;
        this.endPointerInteraction(new MouseEvent('mouseup'));
        this.releasePointerCapture();
    }
    endPointerInteraction(event) {
        this.simulatorModeControls.onPointerUp(event);
        this.pointerDown = false;
    }
    releasePointerCapture(pointerId = this.activePointerId) {
        if (pointerId === undefined)
            return;
        const domElement = this.renderer?.domElement;
        if (!domElement)
            return;
        if (pointerId === this.activePointerId) {
            this.activePointerId = undefined;
        }
        if (domElement.hasPointerCapture?.(pointerId)) {
            domElement.releasePointerCapture(pointerId);
        }
    }
}

class SimulatorDepthMaterial extends THREE.MeshBasicMaterial {
    onBeforeCompile(shader) {
        shader.vertexShader = shader.vertexShader
            .replace('#include <clipping_planes_pars_vertex>', [
            '#include <clipping_planes_pars_vertex>',
            'varying vec4 vViewCoordinates;',
        ].join('\n'))
            .replace('#include <project_vertex>', ['#include <project_vertex>', 'vViewCoordinates = mvPosition;'].join('\n'));
        shader.fragmentShader = shader.fragmentShader
            .replace('#include <clipping_planes_pars_fragment>', [
            '#include <clipping_planes_pars_fragment>',
            'varying vec4 vViewCoordinates;',
        ].join('\n'))
            .replace('#include <dithering_fragment>', [
            '#include <dithering_fragment>',
            'gl_FragColor = vec4(-vViewCoordinates.z, 0.0, 0.0, 1.0);',
        ].join('\n'));
    }
}

class SimulatorDepth {
    constructor(simulatorScene) {
        this.simulatorScene = simulatorScene;
        this.depthWidth = 160;
        this.depthHeight = 160;
        this.depthBufferSlice = new Float32Array();
        /**
         * If true, copies the rendering camera's projection matrix each frame.
         */
        this.autoUpdateDepthCameraProjection = true;
        /**
         * If true, copies the rendering camera's transform each frame.
         */
        this.autoUpdateDepthCameraTransform = true;
        this.projectionMatrixArray = new Float32Array(16);
        // Don't queue a new updateDepth while the previous async pass is
        // still in flight. simulatorUpdate fires once per frame, but
        // updateDepth() resolves via a WebGL fence poll that typically takes
        // longer than a frame on desktop. Without this guard the
        // setTimeout-based fence polling chains stack up and dominate the
        // main thread.
        this.updateInFlight = false;
        this.disposed = false;
        this.resourcesDisposed = false;
        /**
         * Longest a depth buffer is allowed to go without being refreshed while
         * nothing detectable has changed, in milliseconds.
         *
         * This is not only a hedge against animation the skip cannot see, such as
         * skinning or vertex shaders. It is also what keeps the depth mesh's
         * position attribute version advancing while the scene sits still.
         * `FaceRecognizer`, `HumanRecognizer`, and `ObjectDetector` each cache a
         * cloned depth mesh, and its BVH, keyed on that version. If this were
         * removed, a stationary scene would freeze the version, those caches would
         * never invalidate, and per-landmark raycasts would keep hitting a stale
         * clone. That is the failure this repository already fixed once, where the
         * face wireframe only appeared while the camera was moving.
         *
         * Raising it trades depth freshness for fewer readbacks; setting it to
         * `Infinity` would reintroduce that bug.
         */
        this.maxDepthAgeMs = 500;
        this.lastDepthPosition = new THREE.Vector3(NaN, NaN, NaN);
        this.lastDepthQuaternion = new THREE.Quaternion(NaN, NaN, NaN, NaN);
        this.lastSceneSignature = NaN;
        this.lastDepthUpdateMs = -Infinity;
        // Scratch used to hash the raw bits of a float, so the signature reacts to
        // any change rather than relying on a tolerance.
        this.hashFloat = new Float64Array(1);
        this.hashInts = new Int32Array(this.hashFloat.buffer);
    }
    /**
     * Initialize Simulator Depth.
     */
    init(renderer, camera, depth) {
        this.disposed = false;
        this.resourcesDisposed = false;
        this.renderer = renderer;
        this.camera = camera;
        this.depth = depth;
        if (this.camera instanceof THREE.PerspectiveCamera) {
            this.depthCamera = new THREE.PerspectiveCamera();
        }
        else if (this.camera instanceof THREE.OrthographicCamera) {
            this.depthCamera = new THREE.OrthographicCamera();
        }
        else {
            throw new Error('Unknown camera type');
        }
        this.depthCamera.copy(this.camera, /*recursive=*/ false);
        this.createRenderTarget();
        this.depthMaterial = new SimulatorDepthMaterial();
    }
    createRenderTarget() {
        this.depthRenderTarget = new THREE.WebGLRenderTarget(this.depthWidth, this.depthHeight, {
            format: THREE.RedFormat,
            type: THREE.FloatType,
        });
        this.depthBuffer = new Float32Array(this.depthWidth * this.depthHeight);
    }
    update() {
        if (this.disposed)
            return;
        this.updateDepthCamera();
        // Skip if an earlier updateDepth() is still resolving its readback
        // fence. We'd just race ourselves and stack up promises (the
        // setTimeout-based fence poll inside readRenderTargetPixelsAsync
        // was a dominant main-thread cost in perf traces before this).
        if (this.updateInFlight)
            return;
        // Reading the depth target back stalls the GPU pipeline: the buffer is
        // only 160x160 but the readback has to wait for the render to finish, so
        // it costs far more than its size suggests. When neither the view nor
        // anything in the scene has moved the result would be identical, so skip
        // the whole render + readback and keep the previous buffer.
        if (!this.depthNeedsUpdate())
            return;
        this.renderDepthScene();
        this.markDepthUpdated();
        this.updateInFlight = true;
        this.updateDepth().finally(() => {
            this.updateInFlight = false;
            if (this.disposed)
                this.disposeResources();
        });
    }
    /**
     * Whether the depth buffer would differ from the one already captured.
     *
     * @returns True when the camera moved, the scene moved, or the buffer has
     * gone stale.
     */
    depthNeedsUpdate() {
        if (performance.now() - this.lastDepthUpdateMs >= this.maxDepthAgeMs) {
            return true;
        }
        if (!this.depthCamera.position.equals(this.lastDepthPosition) ||
            !this.depthCamera.quaternion.equals(this.lastDepthQuaternion)) {
            return true;
        }
        return this.computeSceneSignature() !== this.lastSceneSignature;
    }
    /**
     * Cheap hash over the world transforms of everything the depth pass draws.
     *
     * Anything that moves, rotates, scales, or is shown or hidden changes the
     * hash, so a still camera in front of a moving object still refreshes. This
     * is arithmetic over a few hundred nodes, which is orders of magnitude
     * cheaper than the GPU stall a readback costs.
     *
     * @returns A hash of the scene's current visible transforms.
     */
    computeSceneSignature() {
        let hash = 0;
        this.simulatorScene.traverse((object) => {
            hash = (hash ^ (object.visible ? 0x9e3779b9 : 0x85ebca6b)) | 0;
            if (!object.visible)
                return;
            const e = object.matrixWorld.elements;
            for (let i = 0; i < 16; i++) {
                this.hashFloat[0] = e[i];
                hash = Math.imul(hash ^ this.hashInts[0], 0x27220a95) | 0;
                hash = Math.imul(hash ^ this.hashInts[1], 0x27220a95) | 0;
            }
        });
        return hash;
    }
    markDepthUpdated() {
        this.lastDepthPosition.copy(this.depthCamera.position);
        this.lastDepthQuaternion.copy(this.depthCamera.quaternion);
        this.lastSceneSignature = this.computeSceneSignature();
        this.lastDepthUpdateMs = performance.now();
    }
    updateDepthCamera() {
        const renderingCamera = this.camera;
        const depthCamera = this.depthCamera;
        if (this.autoUpdateDepthCameraProjection) {
            depthCamera.projectionMatrix.copy(renderingCamera.projectionMatrix);
            depthCamera.projectionMatrixInverse.copy(renderingCamera.projectionMatrixInverse);
        }
        if (this.autoUpdateDepthCameraTransform) {
            depthCamera.position.copy(renderingCamera.position);
            depthCamera.rotation.order = renderingCamera.rotation.order;
            depthCamera.quaternion.copy(renderingCamera.quaternion);
            depthCamera.scale.copy(renderingCamera.scale);
            depthCamera.matrix.copy(renderingCamera.matrix);
            depthCamera.matrixWorld.copy(renderingCamera.matrixWorld);
            depthCamera.matrixWorldInverse.copy(renderingCamera.matrixWorldInverse);
        }
    }
    renderDepthScene() {
        const originalRenderTarget = this.renderer.getRenderTarget();
        this.renderer.setRenderTarget(this.depthRenderTarget);
        this.simulatorScene.overrideMaterial = this.depthMaterial;
        this.renderer.render(this.simulatorScene, this.depthCamera);
        this.simulatorScene.overrideMaterial = null;
        this.renderer.setRenderTarget(originalRenderTarget);
    }
    async updateDepth() {
        // We preventively unbind the PIXEL_PACK_BUFFER before reading from the
        // render target in case external libraries (Spark.js) left it bound.
        const context = this.renderer.getContext();
        context.bindBuffer(context.PIXEL_PACK_BUFFER, null);
        // Cache the projection matrix and transform of the rendered depth.
        const projectionMatrix = this.depthCamera.projectionMatrix.clone();
        const transform = new XRRigidTransform(this.depthCamera.position, this.depthCamera.quaternion);
        await this.renderer.readRenderTargetPixelsAsync(this.depthRenderTarget, 0, 0, this.depthWidth, this.depthHeight, this.depthBuffer);
        if (this.disposed)
            return;
        // Flip the depth buffer.
        if (this.depthBufferSlice.length != this.depthWidth) {
            this.depthBufferSlice = new Float32Array(this.depthWidth);
        }
        for (let i = 0; i < this.depthHeight / 2; ++i) {
            const j = this.depthHeight - 1 - i;
            const i_offset = i * this.depthWidth;
            const j_offset = j * this.depthWidth;
            // Copy row i to a temp slice
            this.depthBufferSlice.set(this.depthBuffer.subarray(i_offset, i_offset + this.depthWidth));
            // Copy row j to row i
            this.depthBuffer.copyWithin(i_offset, j_offset, j_offset + this.depthWidth);
            // Copy the temp slice (original row i) to row j
            this.depthBuffer.set(this.depthBufferSlice, j_offset);
        }
        projectionMatrix.toArray(this.projectionMatrixArray);
        const depthData = {
            width: this.depthWidth,
            height: this.depthHeight,
            data: this.depthBuffer.buffer,
            rawValueToMeters: 1.0,
            projectionMatrix: this.projectionMatrixArray,
            transform: transform,
        };
        this.depth.updateCPUDepthData(depthData, 0, 'float32');
    }
    dispose() {
        this.disposed = true;
        if (!this.updateInFlight)
            this.disposeResources();
    }
    disposeResources() {
        if (this.resourcesDisposed)
            return;
        this.resourcesDisposed = true;
        this.depthRenderTarget?.dispose();
        this.depthMaterial?.dispose();
    }
}

class SimulatorXRHand {
}

const DEFAULT_HAND_PROFILE_PATH = 'https://cdn.jsdelivr.net/npm/@webxr-input-profiles/assets@1.0/dist/profiles/generic-hand/';
const vector3 = new THREE.Vector3();
const quaternion = new THREE.Quaternion();
const wristPosition = new THREE.Vector3();
const metacarpalPosition = new THREE.Vector3();
const desiredPalmPosition = new THREE.Vector3();
const constrainedPalmPosition = new THREE.Vector3();
const controllerWorldPosition = new THREE.Vector3();
const handOriginWorldPosition = new THREE.Vector3();
const ROTATION_JOINT_NAMES = HAND_JOINT_NAMES.filter((jointName) => !jointName.endsWith('-tip'));
function cloneHandPoseRotations(rotations) {
    const clonedRotations = {};
    for (const jointName of ROTATION_JOINT_NAMES) {
        const rotation = rotations[jointName];
        if (!rotation)
            continue;
        clonedRotations[jointName] = [rotation[0], rotation[1], rotation[2]];
    }
    return clonedRotations;
}
function lerpHandPoseRotations(currentRotations, targetRotations, lerpSpeed) {
    for (const jointName of ROTATION_JOINT_NAMES) {
        const currentRotation = currentRotations[jointName] ?? (currentRotations[jointName] = [0, 0, 0]);
        const targetRotation = targetRotations[jointName] ?? [0, 0, 0];
        currentRotation[0] += (targetRotation[0] - currentRotation[0]) * lerpSpeed;
        currentRotation[1] += (targetRotation[1] - currentRotation[1]) * lerpSpeed;
        currentRotation[2] += (targetRotation[2] - currentRotation[2]) * lerpSpeed;
    }
}
function applyHandJoints(bones, joints) {
    for (let i = 0; i < bones.length; i++) {
        const bone = bones[i];
        const jointData = joints[i];
        if (!bone || !jointData)
            continue;
        bone.position.fromArray(jointData.t);
        bone.quaternion.fromArray(jointData.r);
        bone.scale.fromArray([1, 1, 1]);
    }
}
function lerpHandJoints(bones, joints, lerpSpeed) {
    for (let i = 0; i < bones.length; i++) {
        const bone = bones[i];
        const targetJoint = joints[i];
        if (!bone || !targetJoint)
            continue;
        vector3.fromArray(targetJoint.t);
        quaternion.fromArray(targetJoint.r);
        bone.position.lerp(vector3, lerpSpeed);
        bone.quaternion.slerp(quaternion, lerpSpeed);
    }
}
class SimulatorHands {
    constructor(simulatorControllerState, simulatorScene) {
        this.simulatorControllerState = simulatorControllerState;
        this.simulatorScene = simulatorScene;
        this.leftController = new THREE.Object3D();
        this.rightController = new THREE.Object3D();
        this.leftHandBones = [];
        this.rightHandBones = [];
        this.leftHandPose = SimulatorHandPose.RELAXED;
        this.rightHandPose = SimulatorHandPose.RELAXED;
        this.leftHandAtMaxRange = false;
        this.rightHandAtMaxRange = false;
        this.leftHandCurrentRotations = cloneHandPoseRotations(SIMULATOR_HAND_POSE_ROTATIONS[SimulatorHandPose.RELAXED]);
        this.rightHandCurrentRotations = cloneHandPoseRotations(SIMULATOR_HAND_POSE_ROTATIONS[SimulatorHandPose.RELAXED]);
        this.leftHandTargetRotations = cloneHandPoseRotations(SIMULATOR_HAND_POSE_ROTATIONS[SimulatorHandPose.RELAXED]);
        this.rightHandTargetRotations = cloneHandPoseRotations(SIMULATOR_HAND_POSE_ROTATIONS[SimulatorHandPose.RELAXED]);
        this.lerpSpeed = 0.1;
        this.leftXRHand = new SimulatorXRHand();
        this.rightXRHand = new SimulatorXRHand();
        this.onHandPoseChangeRequest = (event) => {
            if (event.type != SimulatorHandPoseChangeRequestEvent.type)
                return;
            const handPoseChangeEvent = event;
            if (this.simulatorControllerState.currentControllerIndex === 0) {
                this.setLeftHandLerpPose(handPoseChangeEvent.pose);
            }
            else {
                this.setRightHandLerpPose(handPoseChangeEvent.pose);
            }
        };
    }
    /**
     * Initialize Simulator Hands.
     */
    async init({ input, physics, camera, simulatorOptions, }) {
        this.input = input;
        this.physics = physics;
        this.camera = camera;
        this.simulatorOptions = simulatorOptions;
        await this.loadMeshes();
        this.simulatorScene.add(this.leftController);
        this.simulatorScene.add(this.rightController);
    }
    loadMeshes() {
        this.loader = new GLTFLoader();
        this.loader.setPath(DEFAULT_HAND_PROFILE_PATH);
        return Promise.all([
            this.loadHandMesh('left.glb', Handedness.LEFT),
            this.loadHandMesh('right.glb', Handedness.RIGHT),
        ]);
    }
    loadHandMesh(path, handedness) {
        return new Promise((resolve, reject) => {
            this.loader.load(path, (gltf) => {
                const isLeft = handedness === Handedness.LEFT;
                const handednessName = isLeft ? 'left' : 'right';
                const bones = isLeft ? this.leftHandBones : this.rightHandBones;
                bones.length = 0;
                if (isLeft) {
                    this.leftHand = gltf.scene;
                    this.leftController.add(this.leftHand);
                }
                else {
                    this.rightHand = gltf.scene;
                    this.rightController.add(this.rightHand);
                }
                HAND_JOINT_NAMES.forEach((jointName) => {
                    const bone = gltf.scene.getObjectByName(jointName);
                    bones.push(bone);
                    if (!bone) {
                        console.warn(`Couldn't find ${jointName} in ${handednessName} hand mesh`);
                    }
                });
                applyHandJoints(bones, resolveSimulatorHandPoseRotations(handedness, isLeft
                    ? this.leftHandCurrentRotations
                    : this.rightHandCurrentRotations));
                // Three.js starts reading every joint as soon as it receives the
                // connected event. Populate the complete joint map first so a frame
                // cannot render a partially connected simulator hand.
                this.syncHandJoints();
                this.input.hands[isLeft ? 0 : 1]?.dispatchEvent?.({
                    type: 'connected',
                    data: {
                        hand: isLeft ? this.leftXRHand : this.rightXRHand,
                        handedness: handednessName,
                    },
                });
                resolve();
            }, () => { }, (error) => reject(error));
        });
    }
    setLeftHandLerpPose(pose) {
        if (this.leftHandPose !== SimulatorHandPose.PINCHING &&
            pose === SimulatorHandPose.PINCHING) {
            this.input.dispatchEvent({
                type: 'selectstart',
                target: this.input.controllers[0],
                data: {
                    handedness: 'left',
                },
            });
        }
        else if (this.leftHandPose === SimulatorHandPose.PINCHING &&
            pose !== SimulatorHandPose.PINCHING) {
            this.input.dispatchEvent({
                type: 'selectend',
                target: this.input.controllers[0],
                data: {
                    handedness: 'left',
                },
            });
        }
        this.leftHandPose = pose;
        this.leftHandRawTargetJoints = undefined;
        this.leftHandTargetRotations = cloneHandPoseRotations(SIMULATOR_HAND_POSE_ROTATIONS[pose]);
        this.updateHandPosePanel();
    }
    setRightHandLerpPose(pose) {
        if (this.rightHandPose !== SimulatorHandPose.PINCHING &&
            pose === SimulatorHandPose.PINCHING) {
            this.input.dispatchEvent({
                type: 'selectstart',
                target: this.input.controllers[1],
                data: {
                    handedness: 'right',
                },
            });
        }
        else if (this.rightHandPose === SimulatorHandPose.PINCHING &&
            pose !== SimulatorHandPose.PINCHING) {
            this.input.dispatchEvent({
                type: 'selectend',
                target: this.input.controllers[1],
                data: {
                    handedness: 'right',
                },
            });
        }
        this.rightHandPose = pose;
        this.rightHandRawTargetJoints = undefined;
        this.rightHandTargetRotations = cloneHandPoseRotations(SIMULATOR_HAND_POSE_ROTATIONS[pose]);
        this.updateHandPosePanel();
    }
    /** Applies semantic biomechanical rotations from SimulatorHandPoseRotations. */
    setLeftHandRotations(rotations, applyConstraints = false) {
        if (this.leftHandPose === SimulatorHandPose.PINCHING) {
            this.input.dispatchEvent({
                type: 'selectend',
                target: this.input.controllers[0],
                data: {
                    handedness: 'left',
                },
            });
        }
        this.leftHandPose = undefined;
        this.leftHandRawTargetJoints = undefined;
        this.leftHandTargetRotations = cloneHandPoseRotations(applyConstraints
            ? applySimulatorHandPoseRotationConstraints(rotations)
            : rotations);
        this.updateHandPosePanel();
    }
    /** Applies semantic biomechanical rotations from SimulatorHandPoseRotations. */
    setRightHandRotations(rotations, applyConstraints = false) {
        if (this.rightHandPose === SimulatorHandPose.PINCHING) {
            this.input.dispatchEvent({
                type: 'selectend',
                target: this.input.controllers[1],
                data: {
                    handedness: 'right',
                },
            });
        }
        this.rightHandPose = undefined;
        this.rightHandRawTargetJoints = undefined;
        this.rightHandTargetRotations = cloneHandPoseRotations(applyConstraints
            ? applySimulatorHandPoseRotationConstraints(rotations)
            : rotations);
        this.updateHandPosePanel();
    }
    setLeftHandJoints(joints) {
        // Unset the pose if the joints are manually defined.
        if (this.leftHandPose === SimulatorHandPose.PINCHING) {
            this.input.dispatchEvent({
                type: 'selectend',
                target: this.input.controllers[0],
                data: {
                    handedness: 'left',
                },
            });
        }
        this.leftHandPose = undefined;
        this.leftHandRawTargetJoints = joints;
        applyHandJoints(this.leftHandBones, joints);
    }
    setRightHandJoints(joints) {
        // Unset the pose if the joints are manually defined.
        if (this.rightHandPose === SimulatorHandPose.PINCHING) {
            this.input.dispatchEvent({
                type: 'selectend',
                target: this.input.controllers[1],
                data: {
                    handedness: 'right',
                },
            });
        }
        this.rightHandPose = undefined;
        this.rightHandRawTargetJoints = joints;
        applyHandJoints(this.rightHandBones, joints);
    }
    update() {
        this.lerpLeftHandPose();
        this.lerpRightHandPose();
        this.constrainHand(0, this.leftController, this.leftHand);
        this.constrainHand(1, this.rightController, this.rightHand);
        this.syncHandJoints();
    }
    constrainHand(index, controller, hand) {
        if (!this.physics)
            return;
        controller.updateWorldMatrix(true, true);
        const wrist = hand?.getObjectByName('wrist');
        const metacarpal = hand?.getObjectByName('middle-finger-metacarpal');
        if (wrist && metacarpal) {
            wrist.getWorldPosition(wristPosition);
            metacarpal.getWorldPosition(metacarpalPosition);
            desiredPalmPosition.lerpVectors(wristPosition, metacarpalPosition, 0.5);
        }
        else {
            controller.getWorldPosition(desiredPalmPosition);
        }
        constrainedPalmPosition.copy(desiredPalmPosition);
        if (this.camera && this.simulatorOptions) {
            const origin = index === 0
                ? this.simulatorOptions.leftHandOrigin
                : this.simulatorOptions.rightHandOrigin;
            handOriginWorldPosition
                .set(origin.x, origin.y, origin.z)
                .applyMatrix4(this.camera.matrixWorld);
        }
        this.physics.constrainHand(index, constrainedPalmPosition, controller.visible, this.camera && this.simulatorOptions ? handOriginWorldPosition : undefined);
        if (!controller.visible)
            return;
        controller.getWorldPosition(controllerWorldPosition);
        controllerWorldPosition.add(constrainedPalmPosition.sub(desiredPalmPosition));
        if (controller.parent) {
            controller.parent.worldToLocal(controllerWorldPosition);
        }
        controller.position.copy(controllerWorldPosition);
        controller.updateWorldMatrix(true, true);
    }
    lerpLeftHandPose() {
        if (this.leftHandRawTargetJoints) {
            lerpHandJoints(this.leftHandBones, this.leftHandRawTargetJoints, this.lerpSpeed);
            return;
        }
        lerpHandPoseRotations(this.leftHandCurrentRotations, this.leftHandTargetRotations, this.lerpSpeed);
        applyHandJoints(this.leftHandBones, resolveSimulatorHandPoseRotations(Handedness.LEFT, this.leftHandCurrentRotations));
    }
    lerpRightHandPose() {
        if (this.rightHandRawTargetJoints) {
            lerpHandJoints(this.rightHandBones, this.rightHandRawTargetJoints, this.lerpSpeed);
            return;
        }
        lerpHandPoseRotations(this.rightHandCurrentRotations, this.rightHandTargetRotations, this.lerpSpeed);
        applyHandJoints(this.rightHandBones, resolveSimulatorHandPoseRotations(Handedness.RIGHT, this.rightHandCurrentRotations));
    }
    syncHandJoints() {
        const hands = this.input.hands;
        const leftHand = hands[0];
        if (leftHand) {
            this.syncXRHandJoints(leftHand, this.leftController, this.leftHandBones);
        }
        const rightHand = hands[1];
        if (rightHand) {
            this.syncXRHandJoints(rightHand, this.rightController, this.rightHandBones);
        }
    }
    syncXRHandJoints(hand, controller, bones) {
        controller.updateWorldMatrix(true, false);
        hand.position.setFromMatrixPosition(controller.matrixWorld);
        hand.setRotationFromMatrix(controller.matrixWorld);
        hand.updateMatrix();
        for (let i = 0; i < HAND_JOINT_NAMES.length; i++) {
            const jointName = HAND_JOINT_NAMES[i];
            let joint = hand.joints[jointName];
            if (!joint) {
                joint = new THREE.Group();
                hand.joints[jointName] = joint;
                hand.add(joint);
            }
            const bone = bones[i];
            joint.visible = bone !== undefined;
            if (!bone)
                continue;
            joint.position.copy(bone.position);
            joint.quaternion.copy(bone.quaternion);
        }
        hand.updateWorldMatrix(false, true);
    }
    setLeftHandPinching(pinching = true) {
        this.setLeftHandLerpPose(pinching ? SimulatorHandPose.PINCHING : SimulatorHandPose.RELAXED);
    }
    setRightHandPinching(pinching = true) {
        this.setRightHandLerpPose(pinching ? SimulatorHandPose.PINCHING : SimulatorHandPose.RELAXED);
    }
    showHands() {
        this.leftController.visible = true;
        this.rightController.visible = true;
        for (let i = 0; i < this.input.hands.length; i++) {
            this.input.hands[i].visible = true;
        }
        this.updateHandPosePanel();
    }
    hideHands() {
        this.leftController.visible = false;
        this.rightController.visible = false;
        for (let i = 0; i < this.input.hands.length; i++) {
            this.input.hands[i].visible = false;
        }
        this.updateHandPosePanel();
    }
    updateHandPosePanel() {
        if (!this.handPosePanelElement)
            return;
        if (this.simulatorControllerState.currentControllerIndex === 0) {
            this.handPosePanelElement.visible = this.leftController.visible;
            this.handPosePanelElement.handPose = this.leftHandPose;
        }
        else {
            this.handPosePanelElement.visible = this.rightController.visible;
            this.handPosePanelElement.handPose = this.rightHandPose;
        }
    }
    setHandPosePanelElement(element) {
        if (this.handPosePanelElement) {
            this.handPosePanelElement.removeEventListener(SimulatorHandPoseChangeRequestEvent.type, this.onHandPoseChangeRequest);
        }
        element.addEventListener(SimulatorHandPoseChangeRequestEvent.type, this.onHandPoseChangeRequest);
        this.handPosePanelElement = element;
        this.updateHandPosePanel();
    }
    dispose() {
        this.handPosePanelElement?.removeEventListener(SimulatorHandPoseChangeRequestEvent.type, this.onHandPoseChangeRequest);
        this.handPosePanelElement = undefined;
        this.onHandednessChanged = undefined;
        disposeObjectChildren(this.leftController);
        disposeObjectChildren(this.rightController);
        this.leftController.removeFromParent();
        this.rightController.removeFromParent();
        this.leftHand = undefined;
        this.rightHand = undefined;
        this.leftHandBones.length = 0;
        this.rightHandBones.length = 0;
        this.physics = undefined;
        this.camera = undefined;
        this.simulatorOptions = undefined;
    }
    toggleHandedness() {
        this.simulatorControllerState.currentControllerIndex =
            (this.simulatorControllerState.currentControllerIndex + 1) % 2;
        this.updateHandPosePanel();
        this.onHandednessChanged?.(this.simulatorControllerState.currentControllerIndex === 0
            ? 'left'
            : 'right');
    }
}

function loadSimulatorElements() {
    return import('./SimulatorElements.js');
}
/** Standard gamepad button names for display. */
const BUTTON_NAMES = {
    0: 'A',
    1: 'B',
    2: 'X',
    3: 'Y',
    4: 'LB',
    5: 'RB',
    6: 'LT',
    7: 'RT',
    8: 'Back',
    9: 'Start',
    10: 'L3',
    11: 'R3',
    12: 'D-Up',
    13: 'D-Down',
    14: 'D-Left',
    15: 'D-Right',
};
function btnName(index) {
    return BUTTON_NAMES[index] ?? `Btn ${index}`;
}
class SimulatorInterface {
    constructor(simulatorElementsLoader = loadSimulatorElements) {
        this.simulatorElementsLoader = simulatorElementsLoader;
        this.elements = [];
        this.interfaceVisible = true;
        this.onGamepadConnected = () => {
            const gp = this.gamepadController;
            if (!gp || gp.hasShownToast)
                return;
            gp.hasShownToast = true;
            this.showGamepadToast(gp);
        };
    }
    /**
     * Initialize the simulator interface.
     */
    async init(simulatorOptions, simulatorControls, simulatorHands, input, setEnvironment, handPhysicsAvailable = false) {
        if (!(await this.ensureElementsAvailable()))
            return;
        if (setEnvironment) {
            this.createSimulatorSettingsPanel(simulatorOptions, simulatorControls, setEnvironment, handPhysicsAvailable);
        }
        this.showGeminiLivePanel(simulatorOptions);
        this.createHandPosePanel(simulatorOptions, simulatorHands);
        this.simulatorHands = simulatorHands;
        simulatorHands.onHandednessChanged = (handedness) => {
            this._ensureGamepadToast().flash(`Active Hand: ${handedness === 'left' ? 'Left' : 'Right'}`);
        };
        if (simulatorOptions.instructions.showAutomatically) {
            this.showInstructions(simulatorOptions);
        }
        if (input)
            this._initGamepadUI(input);
    }
    ensureElementsAvailable() {
        this.elementsAvailable ??= this.simulatorElementsLoader()
            .then(() => true)
            .catch((error) => {
            console.info('The simulator interface was not shown because Lit is not available. Add "lit" and "lit/" to the import map to enable it.', error);
            return false;
        });
        return this.elementsAvailable;
    }
    createSimulatorSettingsPanel(simulatorOptions, simulatorControls, setEnvironment, handPhysicsAvailable) {
        if (simulatorOptions.simulatorSettingsPanel.enabled) {
            const settingsElement = document.createElement(simulatorOptions.simulatorSettingsPanel.element);
            settingsElement.environments = simulatorOptions.environments;
            settingsElement.activeEnvironmentIndex =
                simulatorOptions.activeEnvironmentIndex;
            settingsElement.instructionsEnabled =
                simulatorOptions.instructions.enabled;
            settingsElement.handPhysicsAvailable = handPhysicsAvailable;
            settingsElement.handPhysicsEnabled = simulatorOptions.handPhysics.enabled;
            document.body.appendChild(settingsElement);
            simulatorControls.setSimulatorSettingsPanelElement(settingsElement);
            settingsElement.addEventListener(SetSimulatorEnvironmentEvent.type, (event) => {
                if (event instanceof SetSimulatorEnvironmentEvent) {
                    const environment = simulatorOptions.environments[event.environmentIndex];
                    if (!environment) {
                        console.error(`Simulator environment index ${event.environmentIndex} does not exist.`);
                        return;
                    }
                    void setEnvironment(environment).catch((error) => {
                        console.error('Failed to switch simulator environment.', error);
                    });
                }
            });
            settingsElement.addEventListener(ShowSimulatorInstructionsEvent.type, () => {
                this.showInstructions(simulatorOptions);
            });
            settingsElement.addEventListener(SetSimulatorHandPhysicsEvent.type, (event) => {
                if (event instanceof SetSimulatorHandPhysicsEvent) {
                    simulatorOptions.handPhysics.enabled = event.enabled;
                }
            });
            this.elements.push(settingsElement);
        }
    }
    showInstructions(simulatorOptions) {
        if (simulatorOptions.instructions.enabled) {
            if (document.querySelector(simulatorOptions.instructions.element)) {
                return; // Already showing
            }
            const element = document.createElement(simulatorOptions.instructions.element);
            element.customInstructions =
                simulatorOptions.instructions.customInstructions;
            document.body.appendChild(element);
            this.elements.push(element);
        }
    }
    showGeminiLivePanel(simulatorOptions) {
        if (simulatorOptions.geminiLivePanel.enabled) {
            const element = document.createElement(simulatorOptions.geminiLivePanel.element);
            document.body.appendChild(element);
            this.elements.push(element);
        }
    }
    createHandPosePanel(simulatorOptions, simulatorHands) {
        if (simulatorOptions.handPosePanel.enabled) {
            const handsPanelElement = document.createElement(simulatorOptions.handPosePanel.element);
            document.body.appendChild(handsPanelElement);
            simulatorHands.setHandPosePanelElement(handsPanelElement);
            this.elements.push(handsPanelElement);
        }
    }
    hideUiElements() {
        this.elements = this.elements.filter((el) => el.isConnected);
        for (const element of this.elements) {
            element.style.display = 'none';
        }
        this.interfaceVisible = false;
    }
    showUiElements() {
        this.elements = this.elements.filter((el) => el.isConnected);
        for (const element of this.elements) {
            element.style.display = '';
        }
        this.interfaceVisible = true;
    }
    getInterfaceVisible() {
        return !this.interfaceVisible;
    }
    toggleInterfaceVisible() {
        if (this.interfaceVisible) {
            this.hideUiElements();
        }
        else {
            this.showUiElements();
        }
    }
    _initGamepadUI(input) {
        const gp = input.gamepadController;
        this.gamepadController?.removeEventListener('connected', this.onGamepadConnected);
        this.gamepadController = gp;
        gp.addEventListener('connected', this.onGamepadConnected);
        gp.onOpenSettings = () => this.toggleGamepadSettings(gp);
    }
    dispose() {
        if (this.gamepadController) {
            this.gamepadController.removeEventListener('connected', this.onGamepadConnected);
            this.gamepadController.onOpenSettings = undefined;
            this.gamepadController = undefined;
        }
        if (this.simulatorHands) {
            this.simulatorHands.onHandednessChanged = undefined;
            this.simulatorHands = undefined;
        }
        for (const element of this.elements)
            element.remove();
        this.elements.length = 0;
        this._gamepadToast?.remove();
        this._gamepadToast = undefined;
        this._gamepadSettings?.remove();
        this._gamepadSettings = undefined;
    }
    _ensureGamepadToast() {
        if (!this._gamepadToast) {
            this._gamepadToast = document.createElement('xrblocks-gamepad-toast');
            document.body.appendChild(this._gamepadToast);
        }
        return this._gamepadToast;
    }
    showGamepadToast(gp) {
        const toast = this._ensureGamepadToast();
        const b = gp.bindings;
        toast.show({
            'Left Stick': 'Move (or Hand in Controller mode)',
            'Right Stick': 'Look',
            [btnName(b.getBinding('moveUp')) +
                ' / ' +
                btnName(b.getBinding('moveDown'))]: 'Up / Down',
            [btnName(b.getBinding('select'))]: 'Select / Interact',
            [btnName(b.getBinding('cycleHandPoseLeft')) +
                ' / ' +
                btnName(b.getBinding('cycleHandPoseRight'))]: 'Cycle Hand Pose',
            [btnName(b.getBinding('cycleSimulatorMode'))]: 'Cycle Simulator Mode',
            [btnName(b.getBinding('toggleUI'))]: 'Toggle UI',
            [btnName(b.getBinding('toggleHand'))]: 'Swap Active Hand',
            [btnName(b.getBinding('openSettings'))]: 'Gamepad Settings',
        });
    }
    toggleGamepadSettings(gp) {
        if (!this._gamepadSettings) {
            this._gamepadSettings = document.createElement('xrblocks-gamepad-settings');
            this._gamepadSettings.bindings = gp.bindings;
            this._gamepadSettings.gamepadController = gp;
            this._gamepadSettings.hidden = true;
            document.body.appendChild(this._gamepadSettings);
        }
        if (this._gamepadSettings.hidden) {
            this._gamepadSettings.show();
        }
        else {
            this._gamepadSettings.hide();
        }
    }
}

const DEFAULT_ZONE_ID = 'simulator';
const RANDOM_PATH_SAMPLE_ATTEMPTS = 8;
const PATHFINDING_MODULE_SPECIFIER = 'three-pathfinding';
const desiredGroundPosition = new THREE.Vector3();
const startGroundPosition = new THREE.Vector3();
const clampedGroundPosition = new THREE.Vector3();
const environmentMatrix = new THREE.Matrix4();
const targetWorldPosition = new THREE.Vector3();
const randomTriangleA = new THREE.Vector3();
const randomTriangleB = new THREE.Vector3();
const randomTriangleC = new THREE.Vector3();
const randomTriangleAB = new THREE.Vector3();
const randomTriangleAC = new THREE.Vector3();
class SimulatorNavMesh {
    constructor() {
        this.enabled = false;
        this.ready = false;
        this.debugVisualization = new THREE.Group();
        this.zoneId = DEFAULT_ZONE_ID;
        this.groupId = null;
        this.currentNode = null;
        this.eyeHeight = 1.5;
        this.debugVisualizationVisible = false;
        this.debugVisualization.name = 'Simulator Navmesh Visualization';
        this.debugVisualization.raycast = () => { };
    }
    get constrained() {
        return this.enabled && this.ready;
    }
    get debugVisualizationsVisible() {
        return this.debugVisualizationVisible;
    }
    showDebugVisualizations(visible = true) {
        this.debugVisualizationVisible = visible;
        this.debugVisualization.visible = visible;
    }
    async prepareEnvironment(manifest, options) {
        const prepared = {
            enabled: options.navMesh.enabled,
            eyeHeight: options.navMesh.eyeHeight,
        };
        const shouldLoad = prepared.enabled || options.navMesh.showDebugVisualizations;
        if (!shouldLoad)
            return prepared;
        if (!manifest.navMeshPath) {
            console.warn('SimulatorNavMesh: navmesh is enabled or visualized, but the active environment has no navMeshPath.');
            return prepared;
        }
        try {
            environmentMatrix.compose(new THREE.Vector3().fromArray(manifest.position ?? [0, 0, 0]), new THREE.Quaternion().fromArray(manifest.quaternion ?? [0, 0, 0, 1]), new THREE.Vector3().fromArray(manifest.scale ?? [1, 1, 1]));
            const geometry = await this.loadGeometry(manifest.navMeshPath, environmentMatrix);
            try {
                prepared.debugGeometry = geometry.clone();
                if (prepared.enabled) {
                    const Pathfinding = await this.loadPathfinding();
                    const zone = Pathfinding.createZone(geometry);
                    const pathfinding = new Pathfinding();
                    pathfinding.setZoneData(this.zoneId, zone);
                    prepared.zone = zone;
                    prepared.pathfinding = pathfinding;
                }
            }
            finally {
                geometry.dispose();
            }
        }
        catch (error) {
            prepared.debugGeometry?.dispose();
            throw new Error(`SimulatorNavMesh: failed to load navmesh at ${manifest.navMeshPath}.`, { cause: error });
        }
        return prepared;
    }
    commitEnvironment(prepared) {
        this.enabled = prepared.enabled;
        this.eyeHeight = prepared.eyeHeight;
        this.pathfinding = prepared.pathfinding;
        this.zone = prepared.zone;
        this.ready = !!prepared.pathfinding;
        this.groupId = null;
        this.currentNode = null;
        this.setDebugGeometry(prepared.debugGeometry);
    }
    dispose() {
        this.setDebugGeometry();
        this.pathfinding = undefined;
        this.zone = undefined;
        this.ready = false;
        this.groupId = null;
        this.currentNode = null;
    }
    setDebugGeometry(geometry) {
        for (const child of [...this.debugVisualization.children]) {
            const mesh = child;
            mesh.geometry.dispose();
            const materials = Array.isArray(mesh.material)
                ? mesh.material
                : [mesh.material];
            for (const material of materials)
                material.dispose();
            child.removeFromParent();
        }
        if (!geometry)
            return;
        const wireframe = new THREE.LineSegments(new THREE.EdgesGeometry(geometry, 1), new THREE.LineBasicMaterial({
            color: 0x00e5ff,
            transparent: true,
            opacity: 0.9,
            depthTest: false,
        }));
        wireframe.renderOrder = 1000;
        wireframe.raycast = () => { };
        this.debugVisualization.add(wireframe);
        geometry.dispose();
    }
    async setGeometry(geometry) {
        const Pathfinding = await this.loadPathfinding();
        const zone = Pathfinding.createZone(geometry);
        this.pathfinding = new Pathfinding();
        this.pathfinding.setZoneData(this.zoneId, zone);
        this.zone = zone;
        this.ready = true;
        this.groupId = null;
        this.currentNode = null;
    }
    applyUserMovement(camera, desiredCameraPosition) {
        if (!this.constrained || !this.pathfinding) {
            camera.position.copy(desiredCameraPosition);
            return;
        }
        startGroundPosition.copy(camera.position);
        startGroundPosition.y -= this.eyeHeight;
        desiredGroundPosition.copy(desiredCameraPosition);
        desiredGroundPosition.y -= this.eyeHeight;
        if (this.groupId === null || this.currentNode === null) {
            this.groupId = this.pathfinding.getGroup(this.zoneId, startGroundPosition);
            if (this.groupId === null) {
                camera.position.copy(desiredCameraPosition);
                return;
            }
            this.currentNode = this.pathfinding.getClosestNode(startGroundPosition, this.zoneId, this.groupId, true);
            this.currentNode ??= this.pathfinding.getClosestNode(startGroundPosition, this.zoneId, this.groupId, false);
        }
        if (!this.currentNode || this.groupId === null) {
            camera.position.copy(desiredCameraPosition);
            return;
        }
        this.currentNode = this.pathfinding.clampStep(startGroundPosition, desiredGroundPosition, this.currentNode, this.zoneId, this.groupId, clampedGroundPosition);
        camera.position.set(clampedGroundPosition.x, clampedGroundPosition.y + this.eyeHeight, clampedGroundPosition.z);
    }
    findPathTo(startCameraPosition, targetGroundPosition) {
        if (!this.constrained || !this.pathfinding)
            return null;
        const start = startGroundPosition.copy(startCameraPosition);
        start.y -= this.eyeHeight;
        const groupId = this.getGroup(start);
        if (groupId === null)
            return null;
        return this.pathfinding.findPath(start, targetGroundPosition, this.zoneId, groupId);
    }
    findRandomPathFrom(startCameraPosition) {
        if (!this.constrained || !this.pathfinding || !this.zone)
            return null;
        const start = startGroundPosition.copy(startCameraPosition);
        start.y -= this.eyeHeight;
        const groupId = this.getGroup(start);
        if (groupId === null)
            return null;
        for (let i = 0; i < RANDOM_PATH_SAMPLE_ATTEMPTS; i++) {
            const target = this.getRandomPointInGroup(groupId);
            if (!target)
                continue;
            const path = this.pathfinding.findPath(start, target, this.zoneId, groupId);
            if (path)
                return { target, path };
        }
        return null;
    }
    isGroundPositionReachable(startCameraPosition, targetGroundPosition) {
        return this.isLocationReachable(startCameraPosition, targetGroundPosition);
    }
    isLocationReachable(startCameraPosition, targetGroundPosition) {
        return this.findPathTo(startCameraPosition, targetGroundPosition) !== null;
    }
    isObjectReachable(startCameraPosition, object) {
        object.getWorldPosition(targetWorldPosition);
        return this.isGroundPositionReachable(startCameraPosition, targetWorldPosition);
    }
    getGroup(position) {
        if (!this.pathfinding)
            return null;
        return this.pathfinding.getGroup(this.zoneId, position);
    }
    getRandomPointInGroup(groupId) {
        const group = this.zone?.groups[groupId];
        if (!group)
            return null;
        let totalArea = 0;
        const areas = group.map((node) => {
            const area = this.getNodeArea(node);
            totalArea += area;
            return totalArea;
        });
        if (totalArea <= 0)
            return null;
        const targetArea = Math.random() * totalArea;
        const nodeIndex = areas.findIndex((area) => area >= targetArea);
        const node = group[nodeIndex === -1 ? group.length - 1 : nodeIndex];
        return this.sampleNode(node);
    }
    getNodeArea(node) {
        if (!node || !this.zone)
            return 0;
        const [a, b, c] = node.vertexIds.map((id) => this.zone.vertices[id]);
        randomTriangleAB.subVectors(b, a);
        randomTriangleAC.subVectors(c, a);
        return randomTriangleAB.cross(randomTriangleAC).length() * 0.5;
    }
    sampleNode(node) {
        if (!node || !this.zone)
            return null;
        const [a, b, c] = node.vertexIds.map((id) => this.zone.vertices[id]);
        randomTriangleA.copy(a);
        randomTriangleB.copy(b);
        randomTriangleC.copy(c);
        let u = Math.random();
        let v = Math.random();
        if (u + v > 1) {
            u = 1 - u;
            v = 1 - v;
        }
        return new THREE.Vector3()
            .copy(randomTriangleA)
            .addScaledVector(randomTriangleAB.subVectors(randomTriangleB, randomTriangleA), u)
            .addScaledVector(randomTriangleAC.subVectors(randomTriangleC, randomTriangleA), v);
    }
    async loadGeometry(path, transform) {
        const loader = new GLTFLoader();
        const gltf = await loader.loadAsync(path);
        try {
            gltf.scene.applyMatrix4(transform);
            gltf.scene.updateMatrixWorld(true);
            const navMesh = this.findFirstMesh(gltf.scene);
            if (!navMesh) {
                throw new Error('No mesh found in navmesh glTF/GLB.');
            }
            const geometry = navMesh.geometry.clone();
            geometry.applyMatrix4(navMesh.matrixWorld);
            return geometry;
        }
        finally {
            this.disposeGLTFResources(gltf);
        }
    }
    disposeGLTFResources(gltf) {
        gltf.scene.traverse((object) => {
            const mesh = object;
            if (!mesh.isMesh)
                return;
            mesh.geometry?.dispose();
            const materials = Array.isArray(mesh.material)
                ? mesh.material
                : [mesh.material];
            for (const material of materials) {
                this.disposeMaterial(material);
            }
        });
    }
    disposeMaterial(material) {
        if (!material)
            return;
        for (const value of Object.values(material)) {
            if (value instanceof THREE.Texture) {
                value.dispose();
            }
        }
        material.dispose();
    }
    findFirstMesh(root) {
        const queue = [root];
        while (queue.length > 0) {
            const object = queue.shift();
            const mesh = object;
            if (mesh.isMesh && mesh.geometry) {
                return mesh;
            }
            queue.push(...object.children);
        }
        return null;
    }
    async loadPathfinding() {
        if (!this.Pathfinding) {
            const module = (await import(PATHFINDING_MODULE_SPECIFIER));
            this.Pathfinding = module.Pathfinding;
        }
        return this.Pathfinding;
    }
}

class SimulatorScene extends THREE.Scene {
    constructor() {
        super();
        this.add(new THREE.HemisphereLight(0xbbbbbb, 0x888888, 3));
    }
    createEnvironmentRoot(manifest) {
        const root = new THREE.Group();
        root.name = 'Simulator Environment';
        if (manifest.position)
            root.position.fromArray(manifest.position);
        if (manifest.quaternion)
            root.quaternion.fromArray(manifest.quaternion);
        if (manifest.scale)
            root.scale.fromArray(manifest.scale);
        const objects = new THREE.Group();
        objects.name = 'Simulator Objects';
        root.add(objects);
        return { root, objects };
    }
    commitEnvironment(root, gltf) {
        const previousRoot = this.environmentRoot;
        this.add(root);
        this.environmentRoot = root;
        this.gltf = gltf;
        previousRoot?.removeFromParent();
        return previousRoot;
    }
    clearEnvironment() {
        this.environmentRoot?.removeFromParent();
        this.environmentRoot = undefined;
        this.gltf = undefined;
    }
}

class SimulatorUser extends Script {
    static { this.dependencies = { waitFrame: WaitFrame, registry: Registry }; }
    constructor() {
        super();
        this.name = 'Simulator User';
        this.journeyId = 0;
    }
    init({ waitFrame, registry }) {
        this.waitFrame = waitFrame;
        this.registry = registry;
    }
    stopJourney() {
        ++this.journeyId;
    }
    isOnJourneyId(id) {
        return id == this.journeyId;
    }
    async loadJourney(actions) {
        console.log('Load journey');
        const currentJourneyId = ++this.journeyId;
        for (let i = 0; this.isOnJourneyId(currentJourneyId) && i < actions.length; ++i) {
            callInitWithDependencyInjection(actions[i], this.registry, undefined);
            await actions[i].play({
                simulatorUser: this,
                journeyId: currentJourneyId,
                waitFrame: this.waitFrame,
            });
        }
        console.log('Journey finished');
    }
}

const worldPosition$1 = new THREE.Vector3();
const worldQuaternion$1 = new THREE.Quaternion();
const rigidWorldMatrix = new THREE.Matrix4();
const inverseRigidWorldMatrix = new THREE.Matrix4();
const relativeMatrix = new THREE.Matrix4();
/**
 * Merges the meshes below an object into geometry expressed relative to the
 * object's world-space rigid transform. Scale is baked into the vertices.
 */
function mergeObjectGeometry(root) {
    root.updateWorldMatrix(true, true);
    root.getWorldPosition(worldPosition$1);
    root.getWorldQuaternion(worldQuaternion$1);
    rigidWorldMatrix.compose(worldPosition$1, worldQuaternion$1, new THREE.Vector3(1, 1, 1));
    inverseRigidWorldMatrix.copy(rigidWorldMatrix).invert();
    const geometries = [];
    root.traverse((object) => {
        const mesh = object;
        if (!mesh.isMesh || !mesh.geometry?.attributes.position)
            return;
        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute('position', mesh.geometry.attributes.position.clone());
        if (mesh.geometry.index) {
            geometry.setIndex(mesh.geometry.index.clone());
        }
        relativeMatrix.multiplyMatrices(inverseRigidWorldMatrix, mesh.matrixWorld);
        geometry.applyMatrix4(relativeMatrix);
        geometries.push(geometry);
    });
    if (geometries.length === 0)
        return null;
    const merged = mergeGeometries(geometries, false);
    for (const geometry of geometries)
        geometry.dispose();
    if (!merged)
        return null;
    if (!merged.index) {
        const count = merged.attributes.position.count;
        const indices = new Uint32Array(count);
        for (let i = 0; i < count; i++)
            indices[i] = i;
        merged.setIndex(new THREE.BufferAttribute(indices, 1));
    }
    merged.computeVertexNormals();
    return merged;
}
function geometryVertices(geometry) {
    const position = geometry.getAttribute('position');
    const vertices = new Float32Array(position.count * 3);
    for (let i = 0; i < position.count; i++) {
        const offset = i * 3;
        vertices[offset] = position.getX(i);
        vertices[offset + 1] = position.getY(i);
        vertices[offset + 2] = position.getZ(i);
    }
    return vertices;
}
function geometryIndices(geometry) {
    const index = geometry.getIndex();
    if (!index)
        return new Uint32Array();
    return new Uint32Array(index.array);
}

const MANIFEST_KEYS = new Set([
    'name',
    'scenePath',
    'videoPath',
    'scenePlanesPath',
    'navMeshPath',
    'position',
    'quaternion',
    'scale',
    'objects',
]);
const OBJECT_KEYS = new Set([
    'id',
    'assetPath',
    'position',
    'quaternion',
    'scale',
    'visible',
    'detectObject',
    'label',
    'data',
    'physics',
]);
function isRecord(value) {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}
function assertKnownKeys(value, keys, location) {
    for (const key of Object.keys(value)) {
        if (!keys.has(key)) {
            throw new Error(`${location}: unknown field '${key}'.`);
        }
    }
}
function parseString(value, location) {
    if (value === undefined)
        return undefined;
    if (typeof value !== 'string' || value.length === 0) {
        throw new Error(`${location}: expected a non-empty string.`);
    }
    return value;
}
function parseTuple(value, length, location) {
    if (value === undefined)
        return undefined;
    if (!Array.isArray(value) ||
        value.length !== length ||
        value.some((item) => typeof item !== 'number' || !Number.isFinite(item))) {
        throw new Error(`${location}: expected an array of ${length} finite numbers.`);
    }
    return value;
}
function parseBoolean(value, location) {
    if (value === undefined)
        return undefined;
    if (typeof value !== 'boolean') {
        throw new Error(`${location}: expected a boolean.`);
    }
    return value;
}
function parsePhysics(value, location) {
    if (value === undefined || value === false)
        return false;
    if (value !== 'fixed' && value !== 'dynamic') {
        throw new Error(`${location}: expected false, 'fixed', or 'dynamic'.`);
    }
    return value;
}
function parseObject(value, index, seenIds) {
    const location = `objects[${index}]`;
    if (!isRecord(value)) {
        throw new Error(`${location}: expected an object.`);
    }
    assertKnownKeys(value, OBJECT_KEYS, location);
    const id = parseString(value.id, `${location}.id`);
    if (id && seenIds.has(id)) {
        throw new Error(`${location}: duplicate id '${id}'.`);
    }
    if (id)
        seenIds.add(id);
    const assetPath = parseString(value.assetPath, `${location}.assetPath`);
    if (!assetPath) {
        throw new Error(`${location}: assetPath is required.`);
    }
    const detectObject = parseBoolean(value.detectObject, `${location}.detectObject`);
    const label = parseString(value.label, `${location}.label`);
    if (detectObject && !label) {
        throw new Error(`${location}: detectObject requires label.`);
    }
    const quaternion = parseTuple(value.quaternion, 4, `${location}.quaternion`);
    if (quaternion && quaternion.every((component) => component === 0)) {
        throw new Error(`${location}.quaternion: expected a non-zero quaternion.`);
    }
    const scale = parseTuple(value.scale, 3, `${location}.scale`);
    if (scale?.some((component) => component === 0)) {
        throw new Error(`${location}.scale: components must be non-zero.`);
    }
    return {
        id,
        assetPath,
        position: parseTuple(value.position, 3, `${location}.position`),
        quaternion,
        scale,
        visible: parseBoolean(value.visible, `${location}.visible`),
        detectObject,
        label,
        data: value.data,
        physics: parsePhysics(value.physics, `${location}.physics`),
    };
}
function resolveOptionalUrl(path, baseUrl) {
    return path ? new URL(path, baseUrl).href : undefined;
}
function parseSimulatorSceneManifest(value, manifestUrl) {
    if (!isRecord(value)) {
        throw new Error(`Invalid simulator manifest at ${manifestUrl}: expected an object.`);
    }
    try {
        assertKnownKeys(value, MANIFEST_KEYS, 'manifest');
        const scenePath = parseString(value.scenePath, 'manifest.scenePath');
        const videoPath = parseString(value.videoPath, 'manifest.videoPath');
        if (scenePath && videoPath) {
            throw new Error('manifest: scenePath and videoPath are mutually exclusive.');
        }
        const objectValues = value.objects;
        if (objectValues !== undefined && !Array.isArray(objectValues)) {
            throw new Error('manifest.objects: expected an array.');
        }
        const seenIds = new Set();
        const objects = (objectValues ?? []).map((object, index) => parseObject(object, index, seenIds));
        const quaternion = parseTuple(value.quaternion, 4, 'manifest.quaternion');
        if (quaternion && quaternion.every((component) => component === 0)) {
            throw new Error('manifest.quaternion: expected a non-zero quaternion.');
        }
        const scale = parseTuple(value.scale, 3, 'manifest.scale');
        if (scale?.some((component) => component === 0)) {
            throw new Error('manifest.scale: components must be non-zero.');
        }
        return {
            name: parseString(value.name, 'manifest.name'),
            scenePath: resolveOptionalUrl(scenePath, manifestUrl),
            videoPath: resolveOptionalUrl(videoPath, manifestUrl),
            scenePlanesPath: resolveOptionalUrl(parseString(value.scenePlanesPath, 'manifest.scenePlanesPath'), manifestUrl),
            navMeshPath: resolveOptionalUrl(parseString(value.navMeshPath, 'manifest.navMeshPath'), manifestUrl),
            position: parseTuple(value.position, 3, 'manifest.position'),
            quaternion,
            scale,
            objects: objects.map((object) => ({
                ...object,
                assetPath: resolveOptionalUrl(object.assetPath, manifestUrl),
            })),
            manifestUrl,
        };
    }
    catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        throw new Error(`Invalid simulator manifest at ${manifestUrl}: ${message}`);
    }
}
async function loadSimulatorSceneManifest(manifestPath, baseUrl = document.baseURI) {
    const manifestUrl = new URL(manifestPath, baseUrl).href;
    // Manifests are small, mutable environment descriptors. Always refresh them
    // while allowing the larger assets they reference to use normal HTTP caching.
    const response = await fetch(manifestUrl, { cache: 'no-store' });
    if (!response.ok) {
        throw new Error(`Failed to load simulator manifest at ${manifestUrl}: ${response.status} ${response.statusText}`);
    }
    return parseSimulatorSceneManifest(await response.json(), manifestUrl);
}

function getManifestFallbackName(manifestUrl) {
    return new URL(manifestUrl).pathname.split('/').pop() || manifestUrl;
}
class SimulatorEnvironmentManager {
    constructor(options, renderer, simulatorScene, simulatorObjects, navMesh, simulatorWorld, physics, setVideoPath) {
        this.options = options;
        this.renderer = renderer;
        this.simulatorScene = simulatorScene;
        this.simulatorObjects = simulatorObjects;
        this.navMesh = navMesh;
        this.simulatorWorld = simulatorWorld;
        this.physics = physics;
        this.setVideoPath = setVideoPath;
        this.generation = 0;
        this.simulatorObjects.onChanged = this.refreshMeshes.bind(this);
    }
    /**
     * Resolves manifest names for the settings panel without loading scene assets.
     */
    async resolveEnvironmentNames(environments) {
        await Promise.all(environments.map(async (environment) => {
            if (environment.name)
                return;
            try {
                const manifest = await loadSimulatorSceneManifest(environment.manifestPath);
                environment.name = manifest.name;
            }
            catch (error) {
                console.warn(`Failed to read simulator environment name from ${environment.manifestPath}.`, error);
            }
        }));
    }
    async setEnvironment(environment) {
        const generation = ++this.generation;
        const manifest = await loadSimulatorSceneManifest(environment.manifestPath);
        const { root, objects: objectsGroup } = this.simulatorScene.createEnvironmentRoot(manifest);
        let gltf;
        let roomGeometry;
        try {
            const roomPromise = manifest.scenePath
                ? new ModelLoader().loadGLTF({
                    url: manifest.scenePath,
                    renderer: this.renderer,
                })
                : Promise.resolve(undefined);
            const results = await Promise.allSettled([
                roomPromise,
                this.simulatorObjects.prepareObjects(manifest.objects, manifest.manifestUrl, { replaceExisting: true }),
                this.navMesh.prepareEnvironment(manifest, this.options),
                this.simulatorWorld.preparePlanes(manifest),
            ]);
            const failure = results.find((result) => result.status === 'rejected');
            if (failure) {
                const loadedRoom = results[0];
                if (loadedRoom.status === 'fulfilled' && loadedRoom.value) {
                    root.add(loadedRoom.value.scene);
                }
                const loadedObjects = results[1];
                if (loadedObjects.status === 'fulfilled') {
                    for (const record of loadedObjects.value.records) {
                        objectsGroup.add(record.object);
                    }
                }
                const loadedNavMesh = results[2];
                if (loadedNavMesh.status === 'fulfilled') {
                    loadedNavMesh.value.debugGeometry?.dispose();
                }
                throw failure.reason;
            }
            const [loadedRoom, loadedObjects, loadedNavMesh, loadedPlanes] = results;
            const preparedObjects = loadedObjects.value;
            const preparedNavMesh = loadedNavMesh.value;
            const preparedPlanes = loadedPlanes.value;
            gltf = loadedRoom.value;
            if (gltf)
                root.add(gltf.scene);
            for (const record of preparedObjects.records) {
                objectsGroup.add(record.object);
            }
            if (gltf && this.physics) {
                roomGeometry = mergeObjectGeometry(gltf.scene) ?? undefined;
                if (!roomGeometry) {
                    throw new Error('Simulator room has no mesh geometry for physics.');
                }
            }
            if (generation !== this.generation) {
                roomGeometry?.dispose();
                preparedNavMesh.debugGeometry?.dispose();
                disposeObjectTree(root);
                return;
            }
            const previousRoot = this.simulatorScene.environmentRoot;
            this.disposeRoomPhysics();
            this.simulatorObjects.reset();
            this.simulatorScene.commitEnvironment(root, gltf);
            this.simulatorObjects.setEnvironmentGroup(objectsGroup);
            this.simulatorObjects.activatePrepared(preparedObjects, objectsGroup);
            this.createRoomPhysics(gltf?.scene, roomGeometry);
            roomGeometry = undefined;
            this.navMesh.commitEnvironment(preparedNavMesh);
            this.simulatorWorld.commitPlanes(preparedPlanes);
            this.refreshMeshes();
            this.setVideoPath(manifest.videoPath);
            environment.name =
                environment.name ??
                    manifest.name ??
                    getManifestFallbackName(manifest.manifestUrl);
            this.activeEnvironment = environment;
            this.manifest = manifest;
            if (previousRoot)
                disposeObjectTree(previousRoot);
        }
        catch (error) {
            roomGeometry?.dispose();
            if (root !== this.simulatorScene.environmentRoot) {
                disposeObjectTree(root);
            }
            throw error;
        }
    }
    createRoomPhysics(room, geometry) {
        if (!room || !this.physics)
            return;
        if (!geometry) {
            throw new Error('Simulator room has no mesh geometry for physics.');
        }
        room.updateWorldMatrix(true, true);
        const position = new THREE.Vector3();
        const quaternion = new THREE.Quaternion();
        room.getWorldPosition(position);
        room.getWorldQuaternion(quaternion);
        const body = this.physics.world.createRigidBody(this.physics.RAPIER.RigidBodyDesc.fixed()
            .setTranslation(position.x, position.y, position.z)
            .setRotation(quaternion));
        this.physics.world.createCollider(this.physics.RAPIER.ColliderDesc.trimesh(geometryVertices(geometry), geometryIndices(geometry)), body);
        geometry.dispose();
        this.roomPhysics = { rigidBody: body };
    }
    disposeRoomPhysics() {
        if (this.physics && this.roomPhysics) {
            this.physics.world.removeRigidBody(this.roomPhysics.rigidBody);
        }
        this.roomPhysics = undefined;
    }
    refreshMeshes() {
        this.simulatorWorld.commitMeshes(this.simulatorScene.gltf?.scene, this.simulatorObjects);
    }
    suspendSensing() {
        this.simulatorWorld.suspendSimulatorSensing();
    }
    resumeSensing() {
        this.simulatorWorld.restoreSimulatorPlanes();
        this.refreshMeshes();
    }
    dispose() {
        this.generation++;
        this.simulatorWorld.suspendSimulatorSensing();
        this.disposeRoomPhysics();
        this.simulatorObjects.dispose();
        this.navMesh.dispose();
        const root = this.simulatorScene.environmentRoot;
        root?.removeFromParent();
        if (root)
            disposeObjectTree(root);
        this.simulatorScene.clearEnvironment();
        this.activeEnvironment = undefined;
        this.manifest = undefined;
        this.setVideoPath(undefined);
    }
}

const samplePoints = Array.from({ length: 9 }, () => new THREE.Vector3());
/** Ground-truth object detection for the desktop simulator. */
class SimulatorObjectDetectionSource {
    constructor(camera, scene, objects) {
        this.camera = camera;
        this.scene = scene;
        this.objects = objects;
        this.frustum = new THREE.Frustum();
        this.raycaster = new THREE.Raycaster();
    }
    detect() {
        this.camera.updateWorldMatrix(true, false);
        this.scene.updateWorldMatrix(true, true);
        const projectionView = new THREE.Matrix4().multiplyMatrices(this.camera.projectionMatrix, this.camera.matrixWorldInverse);
        this.frustum.setFromProjectionMatrix(projectionView);
        const cameraPosition = new THREE.Vector3();
        this.camera.getWorldPosition(cameraPosition);
        const results = [];
        for (const record of this.objects.get()) {
            if (!record.definition.detectObject || !record.definition.label)
                continue;
            if (!record.object.visible)
                continue;
            const box = new THREE.Box3().setFromObject(record.object);
            if (box.isEmpty() || !this.frustum.intersectsBox(box))
                continue;
            this.fillSamples(box);
            if (!this.isVisible(record.object, cameraPosition, samplePoints))
                continue;
            const boundingBox = this.projectBox();
            if (boundingBox.isEmpty())
                continue;
            const boxCenter = box.getCenter(new THREE.Vector3());
            results.push({
                label: record.definition.label,
                position: this.findDetectionPoint(record.object, boundingBox, boxCenter, cameraPosition),
                boundingBox,
                data: record.definition.data ?? {},
            });
        }
        return results;
    }
    fillSamples(box) {
        box.getCenter(samplePoints[0]);
        let index = 1;
        for (const x of [box.min.x, box.max.x]) {
            for (const y of [box.min.y, box.max.y]) {
                for (const z of [box.min.z, box.max.z]) {
                    samplePoints[index++].set(x, y, z);
                }
            }
        }
    }
    isVisible(target, cameraPosition, points) {
        const roots = this.scene.environmentRoot
            ? [this.scene.environmentRoot]
            : [];
        let visibleSamples = 0;
        for (const point of points) {
            const direction = point.clone().sub(cameraPosition);
            const distance = direction.length();
            if (distance === 0)
                return true;
            this.raycaster.set(cameraPosition, direction.normalize());
            this.raycaster.far = distance + 0.001;
            const hit = this.raycaster.intersectObjects(roots, true)[0];
            if (!hit || this.isDescendantOf(hit.object, target)) {
                visibleSamples++;
                if (visibleSamples >= 2)
                    return true;
            }
        }
        return false;
    }
    isDescendantOf(object, ancestor) {
        for (let current = object; current; current = current.parent) {
            if (current === ancestor)
                return true;
        }
        return false;
    }
    projectBox() {
        const projected = new THREE.Box2();
        for (let i = 1; i < samplePoints.length; i++) {
            const point = samplePoints[i].clone().project(this.camera);
            projected.expandByPoint(new THREE.Vector2(THREE.MathUtils.clamp((point.x + 1) / 2, 0, 1), THREE.MathUtils.clamp((1 - point.y) / 2, 0, 1)));
        }
        return projected;
    }
    findDetectionPoint(target, boundingBox, fallback, cameraPosition) {
        const screenCenter = boundingBox.getCenter(new THREE.Vector2());
        const ndc = new THREE.Vector2(screenCenter.x * 2 - 1, 1 - screenCenter.y * 2);
        this.raycaster.setFromCamera(ndc, this.camera);
        const centerHit = this.raycaster.intersectObject(target, true)[0];
        if (centerHit)
            return centerHit.point.clone();
        const meshCenters = [];
        target.traverse((object) => {
            const mesh = object;
            if (!mesh.isMesh || !mesh.geometry?.attributes.position)
                return;
            mesh.geometry.computeBoundingSphere();
            if (!mesh.geometry.boundingSphere)
                return;
            meshCenters.push(mesh.geometry.boundingSphere.center
                .clone()
                .applyMatrix4(mesh.matrixWorld));
        });
        for (const meshCenter of meshCenters) {
            this.raycaster.set(cameraPosition, meshCenter.clone().sub(cameraPosition).normalize());
            const hit = this.raycaster.intersectObject(target, true)[0];
            if (hit)
                return hit.point.clone();
        }
        return fallback;
    }
}

const worldPosition = new THREE.Vector3();
const worldQuaternion = new THREE.Quaternion();
const localPosition = new THREE.Vector3();
const parentQuaternion = new THREE.Quaternion();
/** @internal */
class SimulatorObjectsManager {
    constructor() {
        this.records = new Map();
        this.nextId = 1;
    }
    init(renderer, physics) {
        this.renderer = renderer;
        this.physics = physics;
    }
    async prepareObjects(definitions, baseUrl = document.baseURI, { replaceExisting = false } = {}) {
        const assignedIds = new Set(replaceExisting ? [] : this.records.keys());
        const assignedObjects = new Set(replaceExisting
            ? []
            : Array.from(this.records.values(), (record) => record.object));
        let nextId = replaceExisting ? 1 : this.nextId;
        const normalized = definitions.map((definition) => {
            let id = definition.id;
            while (!id) {
                const candidate = `simulator-object-${nextId++}`;
                if (!assignedIds.has(candidate))
                    id = candidate;
            }
            if (assignedIds.has(id)) {
                throw new Error(`Simulator object id '${id}' is already in use.`);
            }
            assignedIds.add(id);
            if (!!definition.assetPath === !!definition.object) {
                throw new Error(`Simulator object '${id}' must provide exactly one of assetPath or object.`);
            }
            if (definition.object && assignedObjects.has(definition.object)) {
                throw new Error(`Simulator object '${id}' uses the same runtime object more than once.`);
            }
            if (definition.object)
                assignedObjects.add(definition.object);
            if (definition.detectObject && !definition.label) {
                throw new Error(`Simulator object '${id}' requires label when detectObject is true.`);
            }
            const physics = definition.physics ?? false;
            if (physics && !this.physics) {
                throw new Error(`Simulator object '${id}' requires physics, but simulator physics is not enabled.`);
            }
            return { definition, id };
        });
        const settled = await Promise.allSettled(normalized.map(async ({ definition, id }) => {
            if (definition.object)
                return { definition, id, object: definition.object };
            const assetUrl = new URL(definition.assetPath, baseUrl).href;
            const gltf = await new ModelLoader().loadGLTF({
                url: assetUrl,
                renderer: this.renderer,
            });
            return { definition, id, object: gltf.scene };
        }));
        const failure = settled.find((result) => result.status === 'rejected');
        if (failure) {
            for (const result of settled) {
                if (result.status === 'fulfilled' && !result.value.definition.object) {
                    disposeObjectTree(result.value.object);
                }
            }
            throw failure.reason;
        }
        const loaded = settled.map((result) => result.value);
        const records = [];
        try {
            for (const { definition, id, object } of loaded) {
                const hasTransform = !!definition.position ||
                    !!definition.quaternion ||
                    !!definition.scale;
                object.name ||= id;
                if (definition.position)
                    object.position.fromArray(definition.position);
                if (definition.quaternion)
                    object.quaternion.fromArray(definition.quaternion);
                if (definition.scale)
                    object.scale.fromArray(definition.scale);
                object.visible = definition.visible ?? true;
                const physicsGeometry = (definition.physics ?? false)
                    ? (mergeObjectGeometry(object) ?? undefined)
                    : undefined;
                if ((definition.physics ?? false) && !physicsGeometry) {
                    throw new Error(`Simulator object '${id}' has no mesh geometry for physics.`);
                }
                records.push({
                    id,
                    object,
                    definition: { ...definition, id },
                    physicsGeometry,
                    ownsObject: !definition.object,
                    preserveWorldTransform: !!definition.object?.parent && !hasTransform,
                });
            }
        }
        catch (error) {
            for (const record of records)
                record.physicsGeometry?.dispose();
            for (const entry of loaded) {
                if (!entry.definition.object)
                    disposeObjectTree(entry.object);
            }
            throw error;
        }
        return { records, nextId };
    }
    activatePrepared(prepared, targetGroup) {
        for (const record of prepared.records) {
            if (record.object.parent !== targetGroup) {
                if (record.preserveWorldTransform)
                    targetGroup.attach(record.object);
                else
                    targetGroup.add(record.object);
            }
            this.createPhysics(record);
            this.records.set(record.id, record);
        }
        this.group = targetGroup;
        this.nextId = prepared.nextId;
        return prepared.records;
    }
    setEnvironmentGroup(group) {
        this.group = group;
        this.nextId = 1;
    }
    async addObjects(definitions, { baseUrl = document.baseURI } = {}) {
        if (!this.group) {
            throw new Error('Simulator environment is not ready.');
        }
        const prepared = await this.prepareObjects(definitions, baseUrl);
        try {
            const activated = this.activatePrepared(prepared, this.group);
            if (activated.length > 0)
                this.onChanged?.();
            return activated;
        }
        catch (error) {
            for (const record of prepared.records) {
                this.disposeRecord(record);
                this.records.delete(record.id);
            }
            throw error;
        }
    }
    get(ids) {
        if (!ids)
            return Array.from(this.records.values());
        return ids
            .map((id) => this.records.get(id))
            .filter((record) => !!record);
    }
    async updateObjects(updates) {
        const seen = new Set();
        const entries = updates.map((update) => {
            if (seen.has(update.id)) {
                throw new Error(`Simulator object '${update.id}' is updated more than once.`);
            }
            seen.add(update.id);
            const record = this.records.get(update.id);
            if (!record) {
                throw new Error(`Simulator object '${update.id}' does not exist.`);
            }
            this.validateUpdate(update);
            return { record, update };
        });
        const snapshots = entries.map(({ record }) => ({
            record,
            definition: { ...record.definition },
            position: record.object.position.clone(),
            quaternion: record.object.quaternion.clone(),
            scale: record.object.scale.clone(),
            visible: record.object.visible,
        }));
        const geometries = new Map();
        const physicsUpdates = new Set(entries
            .filter(({ update }) => ['position', 'quaternion', 'scale', 'physics'].some((key) => Object.prototype.hasOwnProperty.call(update, key)))
            .map(({ record }) => record));
        try {
            for (const { record, update } of entries) {
                this.applyUpdate(record, update);
                if (physicsUpdates.has(record) &&
                    (record.definition.physics ?? false) &&
                    this.physics) {
                    const geometry = mergeObjectGeometry(record.object);
                    if (!geometry) {
                        throw new Error(`Simulator object '${record.id}' has no mesh geometry for physics.`);
                    }
                    geometries.set(record, geometry);
                }
            }
            for (const { record } of entries) {
                if (!physicsUpdates.has(record))
                    continue;
                this.removePhysics(record);
                record.physicsGeometry = geometries.get(record);
                this.createPhysics(record);
            }
        }
        catch (error) {
            for (const geometry of geometries.values())
                geometry.dispose();
            for (const snapshot of snapshots) {
                if (physicsUpdates.has(snapshot.record))
                    this.removePhysics(snapshot.record);
                snapshot.record.definition = snapshot.definition;
                snapshot.record.object.position.copy(snapshot.position);
                snapshot.record.object.quaternion.copy(snapshot.quaternion);
                snapshot.record.object.scale.copy(snapshot.scale);
                snapshot.record.object.visible = snapshot.visible;
                if (physicsUpdates.has(snapshot.record) &&
                    (snapshot.definition.physics ?? false) &&
                    this.physics) {
                    snapshot.record.physicsGeometry =
                        mergeObjectGeometry(snapshot.record.object) ?? undefined;
                    this.createPhysics(snapshot.record);
                }
            }
            throw error;
        }
        if (entries.length > 0)
            this.onChanged?.();
        return entries.map(({ record }) => record);
    }
    validateUpdate(update) {
        const finiteTuple = (value, length) => value === undefined ||
            (value.length === length && value.every(Number.isFinite));
        if (!finiteTuple(update.position, 3)) {
            throw new Error(`Simulator object '${update.id}' has an invalid position.`);
        }
        if (!finiteTuple(update.quaternion, 4) ||
            update.quaternion?.every((component) => component === 0)) {
            throw new Error(`Simulator object '${update.id}' has an invalid quaternion.`);
        }
        if (!finiteTuple(update.scale, 3) ||
            update.scale?.some((component) => component === 0)) {
            throw new Error(`Simulator object '${update.id}' has an invalid scale.`);
        }
        if (update.label !== undefined && update.label !== null && !update.label) {
            throw new Error(`Simulator object '${update.id}' has an invalid label.`);
        }
        if (update.physics && !this.physics) {
            throw new Error(`Simulator object '${update.id}' requires physics, but simulator physics is not enabled.`);
        }
        const detectObject = update.detectObject;
        const label = update.label;
        if (detectObject && label === null) {
            throw new Error(`Simulator object '${update.id}' requires label when detectObject is true.`);
        }
    }
    applyUpdate(record, update) {
        if (update.position)
            record.object.position.fromArray(update.position);
        if (update.quaternion)
            record.object.quaternion.fromArray(update.quaternion).normalize();
        if (update.scale)
            record.object.scale.fromArray(update.scale);
        if (update.visible !== undefined)
            record.object.visible = update.visible;
        const definition = record.definition;
        if (update.position)
            definition.position = [...update.position];
        if (update.quaternion)
            definition.quaternion = [...update.quaternion];
        if (update.scale)
            definition.scale = [...update.scale];
        if (update.visible !== undefined)
            definition.visible = update.visible;
        if (update.detectObject !== undefined)
            definition.detectObject = update.detectObject;
        if (update.label !== undefined)
            definition.label = update.label ?? undefined;
        if (Object.prototype.hasOwnProperty.call(update, 'data'))
            definition.data = update.data;
        if (update.physics !== undefined)
            definition.physics = update.physics;
        if (definition.detectObject && !definition.label) {
            throw new Error(`Simulator object '${record.id}' requires label when detectObject is true.`);
        }
    }
    getMeshRecords() {
        return Array.from(this.records.values());
    }
    setDetectedMeshes(meshes) {
        for (const record of this.records.values()) {
            record.detectedMesh = meshes.get(record.id);
        }
    }
    removeObjects(ids) {
        const changed = this.removeRecords(ids);
        if (changed)
            this.onChanged?.();
        return this;
    }
    removeRecords(ids) {
        let changed = false;
        for (const id of ids) {
            const record = this.records.get(id);
            if (!record)
                continue;
            this.disposeRecord(record);
            this.records.delete(id);
            changed = true;
        }
        return changed;
    }
    clear() {
        const changed = this.removeRecords(Array.from(this.records.keys()));
        if (changed)
            this.onChanged?.();
        return this;
    }
    reset() {
        this.removeRecords(Array.from(this.records.keys()));
        this.nextId = 1;
    }
    physicsStep() {
        for (const record of this.records.values()) {
            if (record.definition.physics !== 'dynamic' || !record.rigidBody)
                continue;
            const translation = record.rigidBody.translation();
            const rotation = record.rigidBody.rotation();
            worldPosition.set(translation.x, translation.y, translation.z);
            worldQuaternion.set(rotation.x, rotation.y, rotation.z, rotation.w);
            const parent = record.object.parent;
            if (parent) {
                parent.updateWorldMatrix(true, false);
                localPosition.copy(worldPosition);
                parent.worldToLocal(localPosition);
                parent.getWorldQuaternion(parentQuaternion).invert();
                record.object.position.copy(localPosition);
                record.object.quaternion.copy(parentQuaternion.multiply(worldQuaternion));
            }
            else {
                record.object.position.copy(worldPosition);
                record.object.quaternion.copy(worldQuaternion);
            }
            record.object.updateWorldMatrix(true, true);
            if (record.detectedMesh) {
                record.detectedMesh.position.copy(worldPosition);
                record.detectedMesh.quaternion.copy(worldQuaternion);
                record.detectedMesh.updateWorldMatrix(true, true);
                const virtualBody = record.detectedMesh.getRigidBody;
                virtualBody?.setTranslation(worldPosition, false);
                virtualBody?.setRotation(worldQuaternion, false);
            }
        }
    }
    createPhysics(record) {
        const mode = record.definition.physics ?? false;
        if (!mode || !this.physics)
            return;
        const geometry = record.physicsGeometry;
        if (!geometry) {
            throw new Error(`Simulator object '${record.id}' has no mesh geometry for physics.`);
        }
        record.object.getWorldPosition(worldPosition);
        record.object.getWorldQuaternion(worldQuaternion);
        const bodyDesc = this.createBodyDesc(mode)
            .setTranslation(worldPosition.x, worldPosition.y, worldPosition.z)
            .setRotation(worldQuaternion);
        const body = this.physics.world.createRigidBody(bodyDesc);
        const vertices = geometryVertices(geometry);
        let colliderDesc = this.physics.RAPIER.ColliderDesc.convexHull(vertices);
        if (!colliderDesc) {
            geometry.computeBoundingBox();
            const size = new THREE.Vector3();
            geometry.boundingBox.getSize(size).multiplyScalar(0.5);
            colliderDesc = this.physics.RAPIER.ColliderDesc.cuboid(Math.max(size.x, 0.001), Math.max(size.y, 0.001), Math.max(size.z, 0.001));
        }
        record.rigidBody = body;
        this.physics.world.createCollider(colliderDesc, body);
        geometry.dispose();
        record.physicsGeometry = undefined;
    }
    removePhysics(record) {
        if (this.physics && record.rigidBody) {
            this.physics.world.removeRigidBody(record.rigidBody);
            record.rigidBody = undefined;
        }
        record.physicsGeometry?.dispose();
        record.physicsGeometry = undefined;
    }
    createBodyDesc(mode) {
        return mode === 'dynamic'
            ? this.physics.RAPIER.RigidBodyDesc.dynamic().setCcdEnabled(true)
            : this.physics.RAPIER.RigidBodyDesc.fixed();
    }
    disposeRecord(record) {
        this.removePhysics(record);
        record.object.removeFromParent();
        if (record.ownsObject)
            disposeObjectTree(record.object);
    }
    dispose() {
        this.reset();
        this.onChanged = undefined;
        this.group = undefined;
        this.physics = undefined;
        this.renderer = undefined;
    }
}

const handPosition = new THREE.Vector3();
const handInputDelta = new THREE.Vector3();
const identityRotation = new THREE.Quaternion();
/** Physics world isolated to the simulated physical environment. */
class SimulatorPhysics {
    constructor(physics, handOptions) {
        this.handOptions = handOptions;
        this.hands = [];
        this.RAPIER = physics.RAPIER;
        this.world = new this.RAPIER.World(physics.options?.gravity ?? { x: 0, y: -9.81, z: 0 });
        this.world.timestep = physics.timestep;
    }
    constrainHand(index, position, enabled, handOrigin) {
        let hand = this.hands[index];
        if (!this.handOptions.enabled) {
            if (hand?.enabled) {
                hand.enabled = false;
                hand.body.setEnabled(false);
            }
            return;
        }
        if (!enabled) {
            if (hand?.enabled) {
                hand.enabled = false;
                hand.body.setEnabled(false);
            }
            return;
        }
        const tethered = this.clampHandToOrigin(position, handOrigin);
        if (!hand) {
            hand = this.createHand(position);
            this.hands[index] = hand;
            return;
        }
        if (!hand.enabled) {
            hand.enabled = true;
            hand.body.setTranslation(position, true);
            hand.body.setEnabled(true);
            return;
        }
        if (tethered) {
            hand.body.setTranslation(position, true);
            return;
        }
        const translation = hand.body.translation();
        handInputDelta.set(position.x - translation.x, position.y - translation.y, position.z - translation.z);
        if (handInputDelta.lengthSq() > 0) {
            hand.controller.computeColliderMovement(hand.collider, handInputDelta);
            const movement = hand.controller.computedMovement();
            handPosition.set(translation.x + movement.x, translation.y + movement.y, translation.z + movement.z);
            hand.body.setTranslation(handPosition, true);
        }
        else {
            handPosition.set(translation.x, translation.y, translation.z);
        }
        position.copy(handPosition);
    }
    createHand(position) {
        this.validateHandOptions();
        const body = this.world.createRigidBody(this.RAPIER.RigidBodyDesc.kinematicPositionBased().setTranslation(position.x, position.y, position.z));
        const collider = this.world.createCollider(this.RAPIER.ColliderDesc.ball(this.handOptions.radius)
            .setFriction(this.handOptions.friction)
            .setRestitution(this.handOptions.restitution), body);
        const controller = this.world.createCharacterController(this.handOptions.contactOffset);
        controller.setSlideEnabled(true);
        controller.setApplyImpulsesToDynamicBodies(true);
        controller.setCharacterMass(this.handOptions.mass);
        return { body, collider, controller, enabled: true };
    }
    clampHandToOrigin(position, origin) {
        if (!origin)
            return false;
        handInputDelta.copy(position).sub(origin);
        if (handInputDelta.lengthSq() === 0)
            return false;
        const hit = this.world.castShape(origin, identityRotation, handInputDelta, new this.RAPIER.Ball(this.handOptions.radius), this.handOptions.contactOffset, 1, false, this.RAPIER.QueryFilterFlags.ONLY_FIXED);
        if (!hit)
            return false;
        position.copy(origin).addScaledVector(handInputDelta, hit.time_of_impact);
        return true;
    }
    validateHandOptions() {
        if (this.handOptions.radius <= 0) {
            throw new RangeError('Simulator hand physics radius must be positive.');
        }
        if (this.handOptions.contactOffset <= 0 ||
            this.handOptions.contactOffset >= this.handOptions.radius) {
            throw new RangeError('Simulator hand physics contactOffset must be positive and smaller than radius.');
        }
        if (this.handOptions.mass <= 0) {
            throw new RangeError('Simulator hand physics mass must be positive.');
        }
    }
    step() {
        this.world.step();
    }
    dispose() {
        for (const hand of this.hands) {
            if (hand)
                this.world.removeCharacterController(hand.controller);
        }
        this.hands.length = 0;
        this.world.free();
    }
}

/** World-sensing adapters for the simulator environment. */
class SimulatorWorld {
    async init(options, world) {
        this.options = options;
        this.world = world;
        await world.initializedPromise;
    }
    async preparePlanes(manifest) {
        if (!this.options.world.planes.enabled)
            return undefined;
        if (!manifest.scenePlanesPath)
            return [];
        // Plane sidecars are frequently regenerated while authoring environments.
        const response = await fetch(manifest.scenePlanesPath, { cache: 'no-store' });
        if (!response.ok) {
            throw new Error(`Failed to load simulator planes at ${manifest.scenePlanesPath}: ${response.status} ${response.statusText}`);
        }
        const data = (await response.json());
        if (!Array.isArray(data.planes)) {
            throw new Error(`Invalid simulator planes at ${manifest.scenePlanesPath}: expected planes array.`);
        }
        const rootPosition = new THREE.Vector3().fromArray(manifest.position ?? [0, 0, 0]);
        const rootQuaternion = new THREE.Quaternion().fromArray(manifest.quaternion ?? [0, 0, 0, 1]);
        const rootScale = new THREE.Vector3().fromArray(manifest.scale ?? [1, 1, 1]);
        const matrix = new THREE.Matrix4().compose(rootPosition, rootQuaternion, rootScale);
        return data.planes.map((plane) => {
            const position = new THREE.Vector3(plane.position.x, plane.position.y, plane.position.z).applyMatrix4(matrix);
            const quaternion = rootQuaternion
                .clone()
                .multiply(new THREE.Quaternion().fromArray(plane.quaternion));
            return {
                type: plane.type,
                area: plane.area * Math.abs(rootScale.x * rootScale.z),
                position,
                quaternion,
                polygon: plane.polygon.map((point) => new THREE.Vector2(point.x * rootScale.x, point.y * rootScale.z)),
                label: plane.label,
            };
        });
    }
    commitPlanes(planes) {
        this.simulatorPlanes = planes;
        if (planes && this.world.planes) {
            this.world.planes.setSimulatorPlanes(planes);
        }
    }
    suspendSimulatorSensing() {
        this.world.planes?.clearSimulatorPlanes();
        this.world.meshes?.clearSimulatorMeshes();
    }
    restoreSimulatorPlanes() {
        if (this.simulatorPlanes) {
            this.world.planes?.setSimulatorPlanes(this.simulatorPlanes);
        }
    }
    commitMeshes(room, objects) {
        if (!this.world.meshes)
            return;
        const sources = [];
        if (room)
            sources.push(...this.createRoomMeshSources(room));
        for (const record of objects.getMeshRecords()) {
            const source = this.createMeshSource(record.object, 'other', record.id);
            if (source)
                sources.push(source);
        }
        const detectedMeshes = this.world.meshes.setSimulatorMeshes(sources);
        const objectMeshes = new Map(sources.flatMap((source, index) => source.simulatorObjectId
            ? [[source.simulatorObjectId, detectedMeshes[index]]]
            : []));
        objects.setDetectedMeshes(objectMeshes);
    }
    /** Preserves the original simulator behavior of exposing each room submesh. */
    createRoomMeshSources(root) {
        root.updateWorldMatrix(true, true);
        const sources = [];
        root.traverse((object) => {
            const mesh = object;
            if (!mesh.isMesh || !mesh.geometry?.attributes.position)
                return;
            const geometry = mesh.geometry.clone().applyMatrix4(mesh.matrixWorld);
            sources.push({
                vertices: geometryVertices(geometry),
                indices: geometryIndices(geometry),
                lastChangedTime: 0,
            });
            geometry.dispose();
        });
        return sources;
    }
    createMeshSource(object, semanticLabel, simulatorObjectId) {
        const geometry = mergeObjectGeometry(object);
        if (!geometry)
            return undefined;
        const position = new THREE.Vector3();
        const quaternion = new THREE.Quaternion();
        object.getWorldPosition(position);
        object.getWorldQuaternion(quaternion);
        const source = {
            vertices: geometryVertices(geometry),
            indices: geometryIndices(geometry),
            lastChangedTime: 0,
            semanticLabel,
            position,
            quaternion,
            simulatorObjectId,
        };
        geometry.dispose();
        return source;
    }
}

class Simulator extends Script {
    static { this.dependencies = {
        simulatorOptions: SimulatorOptions,
        input: Input,
        interaction: Interaction,
        timer: THREE.Timer,
        camera: THREE.Camera,
        renderer: THREE.WebGLRenderer,
        scene: THREE.Scene,
        registry: Registry,
        options: Options,
        depth: Depth,
        world: World,
    }; }
    constructor(renderMainScene) {
        super();
        this.renderMainScene = renderMainScene;
        this.editorIcon = 'simulation';
        this.simulatorScene = new SimulatorScene();
        this.simulatorWorld = new SimulatorWorld();
        this.navMesh = new SimulatorNavMesh();
        this.simulatorObjects = new SimulatorObjectsManager();
        this.objects = this.simulatorObjects;
        this.depth = new SimulatorDepth(this.simulatorScene);
        // Controller poses relative to the camera.
        this.simulatorControllerState = new SimulatorControllerState();
        this.hands = new SimulatorHands(this.simulatorControllerState, this.simulatorScene);
        this.simulatorUser = new SimulatorUser();
        this.userInterface = new SimulatorInterface();
        this.controls = new SimulatorControls(this.simulatorControllerState, this.hands, this.navMesh, this.setStereoRenderMode.bind(this), this.userInterface);
        this.renderDepthPass = false;
        this.renderMode = SimulatorRenderMode.DEFAULT;
        this.stereoCameras = [];
        this.initialized = false;
        this.renderSimulatorSceneToCanvasBound = this.renderSimulatorSceneToCanvas.bind(this);
        this.useSimulatorObjectDetection = false;
        this.add(this.simulatorUser);
    }
    get userMovementConstrained() {
        return this.navMesh.constrained;
    }
    moveUser(desiredCameraPosition) {
        this.navMesh.applyUserMovement(this.mainCamera, desiredCameraPosition);
    }
    findRandomUserPath() {
        return this.navMesh.findRandomPathFrom(this.mainCamera.position);
    }
    async init({ simulatorOptions, input, interaction, timer, camera, renderer, scene, registry, options, depth, world, }) {
        if (this.initialized)
            return;
        // Get optional dependencies from the registry.
        const deviceCamera = registry.get(XRDeviceCamera);
        this.deviceCamera = deviceCamera;
        const physics = registry.get(Physics);
        this.simulatorPhysics =
            physics && simulatorOptions.physics.enabled
                ? new SimulatorPhysics(physics, simulatorOptions.handPhysics)
                : undefined;
        this.options = simulatorOptions;
        this.renderer = renderer;
        this.mainCamera = camera;
        this.mainScene = scene;
        this.registry = registry;
        this.world = world;
        this.simulatorScene.add(this.navMesh.debugVisualization);
        this.navMesh.showDebugVisualizations(this.options.navMesh.showDebugVisualizations);
        camera.position.copy(this.options.initialCameraPosition);
        renderer.autoClearColor = false;
        await this.simulatorWorld.init(options, world);
        this.simulatorObjects.init(renderer, this.simulatorPhysics);
        this.environment = new SimulatorEnvironmentManager(simulatorOptions, renderer, this.simulatorScene, this.simulatorObjects, this.navMesh, this.simulatorWorld, this.simulatorPhysics, this.setVideoPath.bind(this));
        const initialEnvironment = this.options.environments[this.options.activeEnvironmentIndex];
        if (!initialEnvironment) {
            throw new Error(`Simulator environment index ${this.options.activeEnvironmentIndex} does not exist.`);
        }
        await this.environment.setEnvironment(initialEnvironment);
        await this.environment.resolveEnvironmentNames(this.options.environments);
        await this.userInterface.init(simulatorOptions, this.controls, this.hands, input, this.activateEnvironment.bind(this), !!this.simulatorPhysics);
        this.useSimulatorObjectDetection =
            options.world.objects.enabled && options.world.objects.simulatorOverride;
        if (this.useSimulatorObjectDetection && world.objects) {
            this.objectDetectionSource = new SimulatorObjectDetectionSource(camera, this.simulatorScene, this.objects);
            world.objects.setSimulatorSource(this.objectDetectionSource);
        }
        await this.hands.init({
            input,
            physics: this.simulatorPhysics,
            camera,
            simulatorOptions,
        });
        this.controls.init({
            camera,
            input,
            interaction,
            timer,
            renderer,
            simulatorOptions,
        });
        if (deviceCamera &&
            !this.simulatorCamera &&
            this.options.deviceCamera.enabled) {
            this.simulatorCamera = new SimulatorCamera(renderer);
            this.simulatorCamera.init();
            deviceCamera.registerSimulatorCamera(this.simulatorCamera);
        }
        deviceCamera?.init();
        if (options.depth.enabled) {
            this.renderDepthPass = true;
            this.depth.init(renderer, camera, depth);
        }
        scene.add(camera);
        if (this.options.stereo.enabled) {
            this.setupStereoCameras(camera);
        }
        this.virtualSceneRenderTarget = new THREE.WebGLRenderTarget(renderer.domElement.width, renderer.domElement.height, { stencilBuffer: options.stencil });
        const virtualSceneMaterial = new THREE.MeshBasicMaterial({
            map: this.virtualSceneRenderTarget.texture,
            transparent: true,
        });
        if (this.options.blendingMode === 'screen') {
            virtualSceneMaterial.blending = THREE.CustomBlending;
            virtualSceneMaterial.blendSrc = THREE.OneFactor;
            virtualSceneMaterial.blendDst = THREE.OneMinusSrcColorFactor;
            virtualSceneMaterial.blendEquation = THREE.AddEquation;
        }
        this.virtualSceneFullScreenQuad = new FullScreenQuad(virtualSceneMaterial);
        this.initialized = true;
    }
    async setEnvironment(nameOrPath, manifestPath) {
        await this.activateEnvironment(manifestPath
            ? { name: nameOrPath, manifestPath }
            : { manifestPath: nameOrPath });
    }
    async activateEnvironment(environment) {
        if (!this.initialized || !this.environment) {
            throw new Error('Simulator is not initialized.');
        }
        const index = this.options.environments.findIndex((candidate) => candidate.manifestPath === environment.manifestPath);
        if (index !== -1) {
            this.options.activeEnvironmentIndex = index;
        }
        await this.environment.setEnvironment(environment);
    }
    get activeEnvironment() {
        return this.environment?.activeEnvironment;
    }
    get activeEnvironmentManifest() {
        return this.environment?.manifest;
    }
    physicsStep() {
        this.simulatorPhysics?.step();
        this.simulatorObjects.physicsStep();
    }
    onXRSessionStarted() {
        if (this.useSimulatorObjectDetection) {
            this.world?.objects?.clear();
        }
        this.world?.objects?.setSimulatorSource(undefined);
        this.environment?.suspendSensing();
    }
    onXRSessionEnded() {
        if (this.useSimulatorObjectDetection) {
            this.world?.objects?.clear();
            this.world?.objects?.setSimulatorSource(this.objectDetectionSource);
        }
        this.environment?.resumeSensing();
    }
    dispose() {
        let firstError;
        const cleanups = [
            () => this.controls.dispose(),
            () => this.userInterface.dispose(),
            () => this.hands.dispose(),
            () => this.depth.dispose(),
            () => {
                const deviceCamera = this.deviceCamera;
                this.deviceCamera = undefined;
                deviceCamera?.registerSimulatorCamera(undefined);
            },
            () => {
                const simulatorCamera = this.simulatorCamera;
                this.simulatorCamera = undefined;
                simulatorCamera?.dispose();
            },
            () => this.world?.objects?.setSimulatorSource(undefined),
            () => {
                const environment = this.environment;
                this.environment = undefined;
                environment?.dispose();
            },
            () => {
                const simulatorPhysics = this.simulatorPhysics;
                this.simulatorPhysics = undefined;
                simulatorPhysics?.dispose();
            },
            () => this.setVideoPath(undefined),
            () => {
                const quad = this.virtualSceneFullScreenQuad;
                this.virtualSceneFullScreenQuad = undefined;
                quad?.material?.dispose();
                quad?.dispose();
            },
            () => {
                const target = this.virtualSceneRenderTarget;
                this.virtualSceneRenderTarget = undefined;
                target?.dispose();
            },
        ];
        for (const cleanup of cleanups) {
            try {
                cleanup();
            }
            catch (error) {
                firstError ??= error;
            }
        }
        this.effects = undefined;
        this.renderDepthPass = false;
        this.renderer = undefined;
        this.initialized = false;
        if (firstError !== undefined)
            throw firstError;
    }
    simulatorUpdate() {
        this.controls.update();
        this.hands.update();
        if (this.renderDepthPass) {
            this.depth.update();
        }
    }
    setStereoRenderMode(mode) {
        if (!this.options.stereo.enabled)
            return;
        this.renderMode = mode;
    }
    setupStereoCameras(camera) {
        const leftCamera = camera.clone();
        const rightCamera = camera.clone();
        leftCamera.layers.disableAll();
        leftCamera.layers.enable(0);
        leftCamera.layers.enable(1);
        rightCamera.layers.disableAll();
        rightCamera.layers.enable(0);
        rightCamera.layers.enable(2);
        leftCamera.position.set(-AVERAGE_IPD_METERS / 2, 0, 0);
        rightCamera.position.set(AVERAGE_IPD_METERS / 2, 0, 0);
        leftCamera.updateWorldMatrix(true, false);
        rightCamera.updateWorldMatrix(true, false);
        this.stereoCameras.length = 0;
        this.stereoCameras.push(leftCamera, rightCamera);
        camera.add(leftCamera, rightCamera);
        this.setStereoRenderMode(SimulatorRenderMode.STEREO_LEFT);
    }
    onBeforeSimulatorSceneRender() {
        this.simulatorCamera?.onBeforeSimulatorSceneRender(this.mainCamera, this.renderSimulatorSceneToCanvasBound);
    }
    onSimulatorSceneRendered() {
        this.simulatorCamera?.onSimulatorSceneRendered();
    }
    getRenderCamera() {
        return {
            [SimulatorRenderMode.DEFAULT]: this.mainCamera,
            [SimulatorRenderMode.STEREO_LEFT]: this.stereoCameras[0],
            [SimulatorRenderMode.STEREO_RIGHT]: this.stereoCameras[1],
        }[this.renderMode];
    }
    // Called by core when the simulator is running.
    renderScene() {
        if (!this.initialized || !this.renderer)
            return;
        if (!this.options.renderToRenderTexture)
            return;
        // Allocate a new render target if the resolution changes.
        if (this.virtualSceneRenderTarget.width != this.renderer.domElement.width ||
            this.virtualSceneRenderTarget.height != this.renderer.domElement.height) {
            const stencilEnabled = !!this.virtualSceneRenderTarget?.stencilBuffer;
            this.virtualSceneRenderTarget.dispose();
            this.virtualSceneRenderTarget = new THREE.WebGLRenderTarget(this.renderer.domElement.width, this.renderer.domElement.height, { stencilBuffer: stencilEnabled });
            this.virtualSceneFullScreenQuad.material.map = this.virtualSceneRenderTarget.texture;
        }
        this.sparkRenderer =
            this.sparkRenderer || this.registry.get(SparkRendererHolder)?.renderer;
        if (this.sparkRenderer) {
            this.sparkRenderer.encodeLinear = true;
        }
        this.renderer.setRenderTarget(this.virtualSceneRenderTarget);
        this.renderer.clear();
        this.renderMainScene(this.getRenderCamera());
    }
    // Renders the simulator scene onto the main canvas.
    // Then composites the virtual render with the simulator render.
    // Called by core after renderScene.
    renderSimulatorScene() {
        const renderer = this.renderer;
        if (!this.initialized || !renderer)
            return;
        this.onBeforeSimulatorSceneRender();
        this.renderSimulatorSceneToCanvas(this.getRenderCamera());
        this.onSimulatorSceneRendered();
        if (this.options.renderToRenderTexture) {
            this.virtualSceneFullScreenQuad.render(renderer);
        }
        else {
            // Temporary workaround since splats look faded when rendered to a render
            // texture.
            this.renderMainScene(this.getRenderCamera());
        }
    }
    renderSimulatorSceneToCanvas(camera) {
        const renderer = this.renderer;
        if (!renderer)
            return;
        if (this.sparkRenderer) {
            this.sparkRenderer.encodeLinear = false;
        }
        renderer.setRenderTarget(null);
        if (this.backgroundVideoQuad) {
            this.backgroundVideoQuad.render(renderer);
        }
        renderer.render(this.simulatorScene, camera);
        renderer.clearDepth();
    }
    setVideoPath(path) {
        this.videoElement?.pause();
        this.videoElement?.removeAttribute('src');
        this.videoElement?.load();
        this.videoElement = undefined;
        if (this.backgroundVideoQuad) {
            const material = this.backgroundVideoQuad
                .material;
            material.map?.dispose();
            material.dispose();
            this.backgroundVideoQuad.dispose();
        }
        this.backgroundVideoQuad = undefined;
        if (!path)
            return;
        const video = document.createElement('video');
        video.src = path;
        video.loop = true;
        video.muted = true;
        video.playsInline = true;
        video.play().catch((error) => {
            console.error(`Simulator: Failed to play video at ${path}`, error);
        });
        video.addEventListener('error', () => {
            console.error(`Simulator: Error loading video at ${path}`, video.error);
        });
        const texture = new THREE.VideoTexture(video);
        texture.colorSpace = THREE.SRGBColorSpace;
        this.videoElement = video;
        this.backgroundVideoQuad = new FullScreenQuad(new THREE.MeshBasicMaterial({ map: texture }));
    }
}

export { Simulator };
//# sourceMappingURL=Simulator.js.map
