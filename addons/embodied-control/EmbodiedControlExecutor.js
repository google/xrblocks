import * as THREE from 'three';
import { DEFAULT_EMBODIED_CONTROL_OPTIONS } from './EmbodiedControlTypes.js';

const vector = new THREE.Vector3();
const euler = new THREE.Euler();
const quaternion = new THREE.Quaternion();
function mergeOptions(options) {
    return {
        tickMs: options.tickMs ?? DEFAULT_EMBODIED_CONTROL_OPTIONS.tickMs,
        defaultDurationMs: options.defaultDurationMs ??
            DEFAULT_EMBODIED_CONTROL_OPTIONS.defaultDurationMs,
        includeScreenshot: options.includeScreenshot ??
            DEFAULT_EMBODIED_CONTROL_OPTIONS.includeScreenshot,
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
            const durationMs = step.durationMs ?? this.options.defaultDurationMs;
            const tickMs = this.options.tickMs;
            const stepCount = Math.max(1, Math.ceil(durationMs / tickMs));
            let elapsedMs = 0;
            const initialCameraQuaternion = this.dependencies.camera.quaternion.clone();
            let screenshotPromise;
            for (let i = 0; i < stepCount; i++) {
                const remainingMs = Math.max(0, durationMs - elapsedMs);
                const currentTickMs = i === stepCount - 1
                    ? remainingMs || tickMs
                    : Math.min(tickMs, remainingMs);
                const fraction = durationMs > 0 ? currentTickMs / durationMs : 1;
                this.applyControlFraction(step.control, fraction, initialCameraQuaternion);
                if (this.options.includeScreenshot && i === stepCount - 1) {
                    screenshotPromise =
                        this.dependencies.screenshotSynthesizer.getScreenshot();
                }
                this.dependencies.core.stepFrame(currentTickMs);
                elapsedMs += currentTickMs;
                if (this.options.realTime && i < stepCount - 1) {
                    await nextAnimationFrame();
                }
            }
            const observation = await this.createObservation(screenshotPromise);
            return {
                id: step.id,
                elapsedMs,
                observation,
            };
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
            camera.position.add(vector);
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
    async createObservation(screenshotPromise) {
        const screenshot = await screenshotPromise;
        return {
            screenshot,
            state: {
                camera: {
                    position: this.dependencies.camera.position.toArray(),
                    quaternion: this.dependencies.camera.quaternion.toArray(),
                },
                leftHand: this.createHandObservation(0),
                rightHand: this.createHandObservation(1),
            },
        };
    }
    createHandObservation(handIndex) {
        const { input, simulator } = this.dependencies;
        const controllerState = simulator.simulatorControllerState;
        const controller = input.controllers[handIndex];
        const hand = handIndex === 0
            ? simulator.hands.leftController
            : simulator.hands.rightController;
        const rotations = handIndex === 0
            ? simulator.hands.leftHandTargetRotations
            : simulator.hands.rightHandTargetRotations;
        return {
            position: controllerState.localControllerPositions[handIndex].toArray(),
            quaternion: controllerState.localControllerOrientations[handIndex].toArray(),
            selected: !!controller?.userData.selected,
            squeezing: !!controller?.userData.squeezing,
            visible: hand.visible,
            rotations: { ...rotations },
        };
    }
}

export { EmbodiedControlBusyError, EmbodiedControlExecutor };
