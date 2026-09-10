import * as THREE from 'three';
import {beforeEach, describe, expect, it, vi} from 'vitest';

import {GamepadController} from '../../input/GamepadController';
import {Input} from '../../input/Input';
import {Keycodes} from '../../utils/Keycodes';
import {SimulatorControllerState} from '../SimulatorControllerState';
import {SimulatorHands} from '../SimulatorHands';
import {SimulatorOptions} from '../SimulatorOptions';
import {SimulatorNavMesh} from '../internal/navmesh/SimulatorNavMesh';
import {SimulatorControllerMode} from './SimulatorControllerMode';

describe('SimulatorControllerMode', () => {
  let camera: THREE.Camera;
  let controllerState: SimulatorControllerState;
  let downKeys: Set<Keycodes>;
  let hands: SimulatorHands;
  let input: Input;
  let mode: SimulatorControllerMode;
  let navMesh: SimulatorNavMesh;
  let simulatorOptions: SimulatorOptions;
  let timer: THREE.Timer;

  beforeEach(() => {
    camera = new THREE.Camera();
    camera.position.set(0, 1.5, 0);
    camera.quaternion.identity();

    controllerState = new SimulatorControllerState();
    controllerState.currentControllerIndex = 0;
    controllerState.localControllerPositions[0].set(0.2, -0.2, -0.5);
    controllerState.localControllerPositions[1].set(-0.2, -0.2, -0.5);
    controllerState.localControllerOrientations[0].identity();
    controllerState.localControllerOrientations[1].identity();

    downKeys = new Set<Keycodes>();

    hands = {
      showHands: vi.fn(),
      hideHands: vi.fn(),
      toggleHandedness: vi.fn(),
      setLeftHandPinching: vi.fn(),
      setRightHandPinching: vi.fn(),
      leftController: new THREE.Object3D(),
      rightController: new THREE.Object3D(),
    } as unknown as SimulatorHands;

    const gamepadController = {
      init: vi.fn(),
      update: vi.fn(),
      userData: {connected: false},
      menuActive: false,
    } as unknown as GamepadController;

    input = {
      controllers: [
        new THREE.Object3D() as THREE.XRTargetRaySpace,
        new THREE.Object3D() as THREE.XRTargetRaySpace,
      ],
      gamepadController,
      dispatchEvent: vi.fn(),
    } as unknown as Input;

    navMesh = new SimulatorNavMesh();
    simulatorOptions = new SimulatorOptions();

    timer = {
      getDelta: vi.fn().mockReturnValue(1.0),
    } as unknown as THREE.Timer;

    mode = new SimulatorControllerMode(
      controllerState,
      downKeys,
      hands,
      navMesh,
      vi.fn(),
      vi.fn()
    );

    mode.init({
      camera,
      input,
      timer,
      simulatorOptions,
    });
  });

  describe('Left Shift + WASD movement', () => {
    it('moves camera and does not move hand when Left Shift + W is pressed without modeToggle conflict', () => {
      downKeys.add(Keycodes.LEFT_SHIFT_CODE);
      downKeys.add(Keycodes.W_CODE);

      const initialHandPos =
        controllerState.localControllerPositions[0].clone();
      const initialCameraZ = camera.position.z;

      mode.update();

      // Camera should have moved forward (-Z in yaw relative movement)
      expect(camera.position.z).toBeLessThan(initialCameraZ);
      // Hand local position relative to camera should not change
      expect(controllerState.localControllerPositions[0]).toEqual(
        initialHandPos
      );
    });

    it('moves hand and does not move camera when Left Shift + W conflicts with modeToggle', () => {
      simulatorOptions.modeToggle.enabled = true;
      simulatorOptions.modeToggle.toggleKey = Keycodes.LEFT_SHIFT_CODE;

      downKeys.add(Keycodes.LEFT_SHIFT_CODE);
      downKeys.add(Keycodes.W_CODE);

      const initialCameraZ = camera.position.z;
      const initialHandZ = controllerState.localControllerPositions[0].z;

      mode.update();

      // Camera should not move because Left Shift is reserved for modeToggle
      expect(camera.position.z).toBe(initialCameraZ);
      // Hand should move forward (-Z)
      expect(controllerState.localControllerPositions[0].z).toBeLessThan(
        initialHandZ
      );
    });

    it('moves hand and does not move camera when W is pressed without Left Shift', () => {
      downKeys.add(Keycodes.W_CODE);

      const initialCameraZ = camera.position.z;
      const initialHandZ = controllerState.localControllerPositions[0].z;

      mode.update();

      expect(camera.position.z).toBe(initialCameraZ);
      expect(controllerState.localControllerPositions[0].z).toBeLessThan(
        initialHandZ
      );
    });
  });

  describe('Mouse pointer controls', () => {
    it('rotates camera on right mouse button drag (buttons & 2)', () => {
      const initialCameraRot = camera.quaternion.clone();
      const initialHandRot =
        controllerState.localControllerOrientations[0].clone();

      const event = new MouseEvent('pointermove', {
        movementX: 10,
        movementY: 5,
      });
      Object.defineProperty(event, 'buttons', {value: 2});

      mode.onPointerMove(event);

      expect(camera.quaternion.equals(initialCameraRot)).toBe(false);
      expect(
        controllerState.localControllerOrientations[0].equals(initialHandRot)
      ).toBe(true);
    });

    it('rotates active hand orientation on left mouse button drag (buttons & 1)', () => {
      const initialCameraRot = camera.quaternion.clone();
      const initialHandRot =
        controllerState.localControllerOrientations[0].clone();

      const event = new MouseEvent('pointermove', {
        movementX: 10,
        movementY: 5,
      });
      Object.defineProperty(event, 'buttons', {value: 1});

      mode.onPointerMove(event);

      expect(camera.quaternion.equals(initialCameraRot)).toBe(true);
      expect(
        controllerState.localControllerOrientations[0].equals(initialHandRot)
      ).toBe(false);
    });
  });

  describe('Key actions', () => {
    it('toggles active hand on T key', () => {
      const event = new KeyboardEvent('keydown', {code: Keycodes.T_CODE});
      mode.onKeyDown(event);
      expect(hands.toggleHandedness).toHaveBeenCalled();
    });

    it('toggles pinch on Space key', () => {
      const event = new KeyboardEvent('keydown', {code: Keycodes.SPACE_CODE});
      mode.onKeyDown(event);
      expect(hands.setLeftHandPinching).toHaveBeenCalledWith(true);
    });
  });
});
