import * as THREE from 'three';
import { getObjectTargetPoint, User, World } from 'xrblocks';
import { DEFAULT_EMBODIED_CONTROL_OPTIONS } from './EmbodiedControlTypes.js';
import { runTimedMotion } from './EmbodiedControlTiming.js';

const vector = new THREE.Vector3();
const targetCameraPosition = new THREE.Vector3();
const euler = new THREE.Euler();
const quaternion = new THREE.Quaternion();
function requirePositiveFinite(value, name) {
    if (!Number.isFinite(value) || value <= 0) {
        throw new RangeError(`${name} must be a finite number greater than zero.`);
    }
    return value;
}
function mergeOptions(options) {
    const tickMs = options.tickMs ?? DEFAULT_EMBODIED_CONTROL_OPTIONS.tickMs;
    return {
        tickMs: requirePositiveFinite(tickMs, 'tickMs'),
        applyHandRotationConstraints: options.applyHandRotationConstraints ??
            DEFAULT_EMBODIED_CONTROL_OPTIONS.applyHandRotationConstraints,
        realTime: options.realTime ?? DEFAULT_EMBODIED_CONTROL_OPTIONS.realTime,
    };
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
    async runTimedMotion(requestedDurationMs, applyTick) {
        return runTimedMotion({
            requestedDurationMs: requirePositiveFinite(requestedDurationMs, 'durationMs'),
            tickMs: this.options.tickMs,
            realTime: this.options.realTime,
            applyTick,
        });
    }
    applyControl(control) {
        if (this.activeStep) {
            throw new EmbodiedControlBusyError();
        }
        this.validateControl(control);
        this.applyControlFraction(control, 1, this.dependencies.camera.quaternion.clone());
    }
    async step(step) {
        if (this.activeStep) {
            throw new EmbodiedControlBusyError();
        }
        const control = step.control ?? {};
        this.validateControl(control);
        this.activeStep = true;
        try {
            const durationMs = step.durationMs ?? this.options.tickMs;
            const initialCameraQuaternion = this.dependencies.camera.quaternion.clone();
            await this.runTimedMotion(durationMs, (_elapsed, currentTick, total) => {
                this.applyControlFraction(control, currentTick / total, initialCameraQuaternion);
                this.dependencies.core.stepFrame(currentTick);
            });
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
            this.dependencies.simulator.moveUser(vector);
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
        if (control.selectStart) {
            this.applyHandSelect(handIndex, true);
            return;
        }
        if (control.selectEnd) {
            this.applyHandSelect(handIndex, false);
            return;
        }
        if (control.pose) {
            this.applyHandPose(handIndex, control.pose);
        }
        if (control.rotations) {
            this.applyHandRotations(handIndex, control.rotations);
        }
    }
    applyHandPose(handIndex, pose) {
        const { hands } = this.dependencies.simulator;
        if (handIndex === 0) {
            hands.setLeftHandLerpPose(pose);
        }
        else {
            hands.setRightHandLerpPose(pose);
        }
    }
    applyHandSelect(handIndex, selected) {
        const { hands } = this.dependencies.simulator;
        if (handIndex === 0) {
            hands.setLeftHandPinching(selected);
        }
        else {
            hands.setRightHandPinching(selected);
        }
    }
    applyHandRotations(handIndex, rotations) {
        const { hands } = this.dependencies.simulator;
        const mergedRotations = handIndex === 0
            ? { ...hands.leftHandTargetRotations, ...rotations }
            : { ...hands.rightHandTargetRotations, ...rotations };
        if (handIndex === 0) {
            hands.setLeftHandRotations(mergedRotations, this.options.applyHandRotationConstraints);
        }
        else {
            hands.setRightHandRotations(mergedRotations, this.options.applyHandRotationConstraints);
        }
    }
    validateControl(control) {
        for (const hand of [control.leftHand, control.rightHand]) {
            if (!hand)
                continue;
            if (hand?.selectStart && hand.selectEnd) {
                throw new Error('A hand control cannot contain both selectStart and selectEnd.');
            }
            if (hand.pose && hand.rotations) {
                throw new Error('A hand control cannot contain both pose and rotations.');
            }
            if ((hand.selectStart || hand.selectEnd) &&
                (hand.pose || hand.rotations)) {
                throw new Error('A hand control cannot combine selection with pose or rotations.');
            }
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
    getTargetWorldPosition(target, out, from) {
        if (target instanceof THREE.Vector3) {
            out.copy(target);
        }
        else if (Array.isArray(target)) {
            out.fromArray(target);
        }
        else if (target instanceof THREE.Object3D) {
            if (from)
                getObjectTargetPoint(target, from, out, 'closest');
            else
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
            this.dependencies.simulator.moveUser(targetCameraPosition);
            if (snapToGround &&
                !this.dependencies.simulator.userMovementConstrained &&
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
            if (velocity === undefined) {
                camera.lookAt(targetWorldPos);
                core.stepFrame(this.options.tickMs);
                return;
            }
            requirePositiveFinite(velocity, 'velocity');
            const Q_s = camera.quaternion.clone();
            camera.lookAt(targetWorldPos);
            const Q_t = camera.quaternion.clone();
            camera.quaternion.copy(Q_s);
            const angle = Q_s.angleTo(Q_t);
            if (angle === 0) {
                core.stepFrame(this.options.tickMs);
                return;
            }
            const durationMs = (angle / velocity) * 1000;
            await this.runTimedMotion(durationMs, (elapsed, currentTick, total) => {
                const u = elapsed / total;
                camera.quaternion.slerpQuaternions(Q_s, Q_t, u);
                core.stepFrame(currentTick);
            });
        });
    }
    async pointTo(handIndex, target, options = {}) {
        return this.executeAction(async () => {
            const { velocity } = options;
            const { camera, simulator, core } = this.dependencies;
            const controllerPos = simulator.simulatorControllerState.localControllerPositions[handIndex];
            const controllerWorldPos = controllerPos
                .clone()
                .applyMatrix4(camera.matrixWorld);
            const targetWorldPos = new THREE.Vector3();
            this.getTargetWorldPosition(target, targetWorldPos, controllerWorldPos);
            const targetCamSpace = targetWorldPos
                .clone()
                .applyMatrix4(camera.matrixWorldInverse);
            const up = new THREE.Vector3(0, 1, 0);
            const matrix = new THREE.Matrix4().lookAt(controllerPos, targetCamSpace, up);
            const targetQuat = new THREE.Quaternion().setFromRotationMatrix(matrix);
            if (velocity === undefined) {
                simulator.simulatorControllerState.localControllerOrientations[handIndex].copy(targetQuat);
                core.stepFrame(this.options.tickMs);
                return;
            }
            requirePositiveFinite(velocity, 'velocity');
            const startQuat = simulator.simulatorControllerState.localControllerOrientations[handIndex].clone();
            const angle = startQuat.angleTo(targetQuat);
            if (angle === 0) {
                core.stepFrame(this.options.tickMs);
                return;
            }
            const durationMs = (angle / velocity) * 1000;
            await this.runTimedMotion(durationMs, (elapsed, currentTick, total) => {
                const u = elapsed / total;
                simulator.simulatorControllerState.localControllerOrientations[handIndex].slerpQuaternions(startQuat, targetQuat, u);
                core.stepFrame(currentTick);
            });
        });
    }
    async reachTo(handIndex, target, options = {}) {
        return this.executeAction(async () => {
            const { velocity } = options;
            const { camera, simulator, core } = this.dependencies;
            const targetWorldPos = new THREE.Vector3();
            const fingertip = core.input.hands[handIndex]?.joints?.['index-finger-tip'];
            const controller = handIndex === 0
                ? simulator.hands.leftController
                : simulator.hands.rightController;
            const targetSource = new THREE.Vector3();
            (fingertip ?? controller).getWorldPosition(targetSource);
            this.getTargetWorldPosition(target, targetWorldPos, targetSource);
            offsetTargetByIndexFingertip(handIndex, targetWorldPos, simulator, core.input.hands);
            const targetCamSpace = targetWorldPos
                .clone()
                .applyMatrix4(camera.matrixWorldInverse);
            if (velocity === undefined) {
                simulator.simulatorControllerState.localControllerPositions[handIndex].copy(targetCamSpace);
                core.stepFrame(this.options.tickMs);
                return;
            }
            requirePositiveFinite(velocity, 'velocity');
            const startPos = simulator.simulatorControllerState.localControllerPositions[handIndex].clone();
            const distance = startPos.distanceTo(targetCamSpace);
            if (distance === 0) {
                core.stepFrame(this.options.tickMs);
                return;
            }
            const durationMs = (distance / velocity) * 1000;
            await this.runTimedMotion(durationMs, (elapsed, currentTick, total) => {
                const u = elapsed / total;
                simulator.simulatorControllerState.localControllerPositions[handIndex].lerpVectors(startPos, targetCamSpace, u);
                core.stepFrame(currentTick);
            });
        });
    }
    async click(handIndex = 1, options = {}) {
        const { durationMs = 200 } = options;
        requirePositiveFinite(durationMs, 'durationMs');
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
function offsetTargetByIndexFingertip(handIndex, targetWorldPosition, simulator, hands) {
    const controller = handIndex === 0
        ? simulator.hands.leftController
        : simulator.hands.rightController;
    const fingertip = hands[handIndex]?.joints?.['index-finger-tip'];
    if (!controller || !fingertip)
        return;
    const controllerPosition = new THREE.Vector3();
    const fingertipPosition = new THREE.Vector3();
    controller.getWorldPosition(controllerPosition);
    fingertip.getWorldPosition(fingertipPosition);
    targetWorldPosition.sub(fingertipPosition.sub(controllerPosition));
}

export { EmbodiedControlBusyError, EmbodiedControlExecutor };
