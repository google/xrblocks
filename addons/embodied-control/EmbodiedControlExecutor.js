import * as THREE from 'three';
import { User, World } from 'xrblocks';
import { DEFAULT_EMBODIED_CONTROL_OPTIONS } from './EmbodiedControlTypes.js';

const vector = new THREE.Vector3();
const targetCameraPosition = new THREE.Vector3();
const euler = new THREE.Euler();
const quaternion = new THREE.Quaternion();
function mergeOptions(options) {
    return {
        tickMs: options.tickMs ?? DEFAULT_EMBODIED_CONTROL_OPTIONS.tickMs,
        applyHandRotationConstraints: options.applyHandRotationConstraints ??
            DEFAULT_EMBODIED_CONTROL_OPTIONS.applyHandRotationConstraints,
        realTime: options.realTime ?? DEFAULT_EMBODIED_CONTROL_OPTIONS.realTime,
    };
}
function nextAnimationFrame() {
    return new Promise((resolve) => {
        if (typeof requestAnimationFrame === 'function') {
            requestAnimationFrame(() => resolve());
        }
        else {
            setTimeout(resolve, 0);
        }
    });
}
class EmbodiedControlBusyError extends Error {
    constructor() {
        super('EmbodiedControl already has an active step.');
        this.name = 'EmbodiedControlBusyError';
    }
}
class EmbodiedControlExecutor {
    constructor(dependencies, options = {}) {
        this.dependencies = dependencies;
        this.activeStep = false;
        this.options = mergeOptions(options);
    }
    configure(options) {
        this.options = mergeOptions({
            ...this.options,
            ...options,
        });
    }
    get busy() {
        return this.activeStep;
    }
    applyControl(control) {
        if (this.activeStep) {
            throw new EmbodiedControlBusyError();
        }
        this.applyControlFraction(control, 1, this.dependencies.camera.quaternion.clone());
    }
    async step(step) {
        if (this.activeStep) {
            throw new EmbodiedControlBusyError();
        }
        this.activeStep = true;
        try {
            const tickMs = this.options.tickMs;
            const durationMs = step.durationMs ?? tickMs;
            const stepCount = Math.max(1, Math.ceil(durationMs / tickMs));
            let elapsedMs = 0;
            const initialCameraQuaternion = this.dependencies.camera.quaternion.clone();
            for (let i = 0; i < stepCount; i++) {
                const remainingMs = Math.max(0, durationMs - elapsedMs);
                const currentTickMs = i === stepCount - 1
                    ? remainingMs || tickMs
                    : Math.min(tickMs, remainingMs);
                const fraction = durationMs > 0 ? currentTickMs / durationMs : 1;
                this.applyControlFraction(step.control || {}, fraction, initialCameraQuaternion);
                this.dependencies.core.stepFrame(currentTickMs);
                elapsedMs += currentTickMs;
                if (this.options.realTime && i < stepCount - 1) {
                    await nextAnimationFrame();
                }
            }
        }
        finally {
            this.activeStep = false;
        }
    }
    applyControlFraction(control, fraction, initialCameraQuaternion) {
        this.applyInstantHandControls(control.leftHand, 0);
        this.applyInstantHandControls(control.rightHand, 1);
        this.applyLocomotion(control.locomotion, fraction, initialCameraQuaternion);
        this.applyHandMotion(control.leftHand, 0, fraction);
        this.applyHandMotion(control.rightHand, 1, fraction);
    }
    applyLocomotion(control, fraction, initialCameraQuaternion) {
        if (!control)
            return;
        const { camera } = this.dependencies;
        if (control.move) {
            vector
                .fromArray(control.move)
                .multiplyScalar(fraction)
                .applyQuaternion(initialCameraQuaternion);
            vector.add(camera.position);
            this.dependencies.simulator.navMesh.applyUserMovement(camera, vector);
        }
        if (control.rotate) {
            euler.set(THREE.MathUtils.degToRad(control.rotate[0]) * fraction, THREE.MathUtils.degToRad(control.rotate[1]) * fraction, THREE.MathUtils.degToRad(control.rotate[2]) * fraction, 'YXZ');
            quaternion.setFromEuler(euler);
            camera.quaternion.multiply(quaternion);
        }
    }
    applyHandMotion(control, handIndex, fraction) {
        if (!control)
            return;
        const controllerState = this.dependencies.simulator.simulatorControllerState;
        if (control.move) {
            vector.fromArray(control.move).multiplyScalar(fraction);
            controllerState.localControllerPositions[handIndex].add(vector);
        }
        if (control.rotate) {
            euler.set(THREE.MathUtils.degToRad(control.rotate[0]) * fraction, THREE.MathUtils.degToRad(control.rotate[1]) * fraction, THREE.MathUtils.degToRad(control.rotate[2]) * fraction, 'YXZ');
            quaternion.setFromEuler(euler);
            controllerState.localControllerOrientations[handIndex].multiply(quaternion);
        }
    }
    applyInstantHandControls(control, handIndex) {
        if (!control)
            return;
        const { simulator } = this.dependencies;
        if (control.visible !== undefined) {
            const controller = handIndex === 0
                ? simulator.hands.leftController
                : simulator.hands.rightController;
            controller.visible = control.visible;
        }
        if (control.rotations) {
            this.applyHandRotations(handIndex, control.rotations);
        }
        if (control.selectStart) {
            this.applyHandSelect(handIndex, true);
        }
        else if (control.selectEnd) {
            this.applyHandSelect(handIndex, false);
        }
    }
    applyHandSelect(handIndex, selected) {
        const { simulator } = this.dependencies;
        if (handIndex === 0) {
            simulator.hands.setLeftHandPinching(selected);
        }
        else {
            simulator.hands.setRightHandPinching(selected);
        }
    }
    applyHandRotations(handIndex, rotations) {
        const { simulator } = this.dependencies;
        const mergedRotations = handIndex === 0
            ? { ...simulator.hands.leftHandTargetRotations, ...rotations }
            : { ...simulator.hands.rightHandTargetRotations, ...rotations };
        if (handIndex === 0) {
            simulator.hands.setLeftHandRotations(mergedRotations, this.options.applyHandRotationConstraints);
        }
        else {
            simulator.hands.setRightHandRotations(mergedRotations, this.options.applyHandRotationConstraints);
        }
    }
    async executeAction(actionFn) {
        if (this.activeStep) {
            throw new EmbodiedControlBusyError();
        }
        this.activeStep = true;
        try {
            await actionFn();
        }
        finally {
            this.activeStep = false;
        }
    }
    getTargetWorldPosition(target, out) {
        if (target instanceof THREE.Vector3) {
            out.copy(target);
        }
        else if (Array.isArray(target)) {
            out.fromArray(target);
        }
        else if (target instanceof THREE.Object3D) {
            target.getWorldPosition(out);
        }
    }
    async teleportTo(target, options = {}) {
        return this.executeAction(async () => {
            const { distance = 1.5, faceTarget = true, snapToGround = false } = options;
            const { camera, core } = this.dependencies;
            const user = core.registry.get(User);
            const world = core.registry.get(World);
            const targetWorldPos = new THREE.Vector3();
            this.getTargetWorldPosition(target, targetWorldPos);
            targetCameraPosition.copy(targetWorldPos);
            if (target instanceof THREE.Object3D) {
                const forward = new THREE.Vector3(0, 0, 1).applyQuaternion(target.quaternion);
                targetCameraPosition.addScaledVector(forward, distance);
            }
            this.dependencies.simulator.navMesh.applyUserMovement(camera, targetCameraPosition);
            if (snapToGround &&
                !this.dependencies.simulator.navMesh.constrained &&
                world?.planes &&
                user) {
                const horizontalPlanes = world.planes.get().filter((p) => {
                    const orientation = (p.orientation || '').toLowerCase();
                    const label = (p.label || '').toLowerCase();
                    return (orientation === 'horizontal' ||
                        label === 'floor' ||
                        label === 'horizontal');
                });
                if (horizontalPlanes.length > 0) {
                    const raycaster = new THREE.Raycaster();
                    raycaster.set(new THREE.Vector3(camera.position.x, camera.position.y + 10, camera.position.z), new THREE.Vector3(0, -1, 0));
                    const hits = raycaster.intersectObjects(horizontalPlanes);
                    if (hits.length > 0) {
                        camera.position.y = hits[0].point.y + user.height;
                    }
                }
            }
            if (faceTarget && target instanceof THREE.Object3D) {
                camera.lookAt(targetWorldPos);
            }
            core.stepFrame(this.options.tickMs);
        });
    }
    async lookAtTarget(target, options = {}) {
        return this.executeAction(async () => {
            const { velocity } = options;
            const { camera, core } = this.dependencies;
            const targetWorldPos = new THREE.Vector3();
            this.getTargetWorldPosition(target, targetWorldPos);
            if (velocity === undefined || velocity <= 0) {
                camera.lookAt(targetWorldPos);
                core.stepFrame(this.options.tickMs);
                return;
            }
            const Q_s = camera.quaternion.clone();
            camera.lookAt(targetWorldPos);
            const Q_t = camera.quaternion.clone();
            camera.quaternion.copy(Q_s);
            const angle = Q_s.angleTo(Q_t);
            const durationMs = (angle / velocity) * 1000;
            let elapsedMs = 0;
            const tickMs = this.options.tickMs;
            const stepCount = Math.max(1, Math.ceil(durationMs / tickMs));
            for (let i = 0; i < stepCount; i++) {
                const remainingMs = Math.max(0, durationMs - elapsedMs);
                const currentTickMs = i === stepCount - 1
                    ? remainingMs || tickMs
                    : Math.min(tickMs, remainingMs);
                elapsedMs += currentTickMs;
                const u = durationMs > 0 ? elapsedMs / durationMs : 1;
                camera.quaternion.slerpQuaternions(Q_s, Q_t, u);
                core.stepFrame(currentTickMs);
                if (this.options.realTime && i < stepCount - 1) {
                    await nextAnimationFrame();
                }
            }
        });
    }
    async pointTo(handIndex, target, options = {}) {
        return this.executeAction(async () => {
            const { velocity } = options;
            const { camera, simulator, core } = this.dependencies;
            const targetWorldPos = new THREE.Vector3();
            this.getTargetWorldPosition(target, targetWorldPos);
            const targetCamSpace = targetWorldPos
                .clone()
                .applyMatrix4(camera.matrixWorldInverse);
            const controllerPos = simulator.simulatorControllerState.localControllerPositions[handIndex];
            const up = new THREE.Vector3(0, 1, 0);
            const matrix = new THREE.Matrix4().lookAt(controllerPos, targetCamSpace, up);
            const targetQuat = new THREE.Quaternion().setFromRotationMatrix(matrix);
            if (velocity === undefined || velocity <= 0) {
                simulator.simulatorControllerState.localControllerOrientations[handIndex].copy(targetQuat);
                core.stepFrame(this.options.tickMs);
                return;
            }
            const startQuat = simulator.simulatorControllerState.localControllerOrientations[handIndex].clone();
            const angle = startQuat.angleTo(targetQuat);
            const durationMs = (angle / velocity) * 1000;
            let elapsedMs = 0;
            const tickMs = this.options.tickMs;
            const stepCount = Math.max(1, Math.ceil(durationMs / tickMs));
            for (let i = 0; i < stepCount; i++) {
                const remainingMs = Math.max(0, durationMs - elapsedMs);
                const currentTickMs = i === stepCount - 1
                    ? remainingMs || tickMs
                    : Math.min(tickMs, remainingMs);
                elapsedMs += currentTickMs;
                const u = durationMs > 0 ? elapsedMs / durationMs : 1;
                simulator.simulatorControllerState.localControllerOrientations[handIndex].slerpQuaternions(startQuat, targetQuat, u);
                core.stepFrame(currentTickMs);
                if (this.options.realTime && i < stepCount - 1) {
                    await nextAnimationFrame();
                }
            }
        });
    }
    async reachTo(handIndex, target, options = {}) {
        return this.executeAction(async () => {
            const { velocity } = options;
            const { camera, simulator, core } = this.dependencies;
            const targetWorldPos = new THREE.Vector3();
            this.getTargetWorldPosition(target, targetWorldPos);
            const targetCamSpace = targetWorldPos
                .clone()
                .applyMatrix4(camera.matrixWorldInverse);
            if (velocity === undefined || velocity <= 0) {
                simulator.simulatorControllerState.localControllerPositions[handIndex].copy(targetCamSpace);
                core.stepFrame(this.options.tickMs);
                return;
            }
            const startPos = simulator.simulatorControllerState.localControllerPositions[handIndex].clone();
            const distance = startPos.distanceTo(targetCamSpace);
            const durationMs = (distance / velocity) * 1000;
            let elapsedMs = 0;
            const tickMs = this.options.tickMs;
            const stepCount = Math.max(1, Math.ceil(durationMs / tickMs));
            for (let i = 0; i < stepCount; i++) {
                const remainingMs = Math.max(0, durationMs - elapsedMs);
                const currentTickMs = i === stepCount - 1
                    ? remainingMs || tickMs
                    : Math.min(tickMs, remainingMs);
                elapsedMs += currentTickMs;
                const u = durationMs > 0 ? elapsedMs / durationMs : 1;
                simulator.simulatorControllerState.localControllerPositions[handIndex].lerpVectors(startPos, targetCamSpace, u);
                core.stepFrame(currentTickMs);
                if (this.options.realTime && i < stepCount - 1) {
                    await nextAnimationFrame();
                }
            }
        });
    }
    async click(handIndex = 1, options = {}) {
        const { durationMs = 200 } = options;
        const { simulator } = this.dependencies;
        // Change the lerp speed to allow the hand to pinch and open all the way.
        const originalLerpSpeed = simulator.hands.lerpSpeed;
        simulator.hands.lerpSpeed = 0.3;
        try {
            const pressControl = handIndex === 0
                ? { leftHand: { selectStart: true } }
                : { rightHand: { selectStart: true } };
            await this.step({
                control: pressControl,
                durationMs,
            });
            const releaseControl = handIndex === 0
                ? { leftHand: { selectEnd: true } }
                : { rightHand: { selectEnd: true } };
            await this.step({
                control: releaseControl,
                durationMs,
            });
        }
        finally {
            simulator.hands.lerpSpeed = originalLerpSpeed;
        }
    }
}

export { EmbodiedControlBusyError, EmbodiedControlExecutor };
