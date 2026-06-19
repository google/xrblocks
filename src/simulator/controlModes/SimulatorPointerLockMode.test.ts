import * as THREE from 'three';
import {describe, it, expect, vi, beforeEach} from 'vitest';

import {Input} from '../../input/Input';
import {SimulatorControllerState} from '../SimulatorControllerState';
import {SimulatorHands} from '../SimulatorHands';
import {SimulatorPointerLockMode} from './SimulatorPointerLockMode';

describe('SimulatorPointerLockMode', () => {
  let mode: SimulatorPointerLockMode;
  let mockState: SimulatorControllerState;
  let mockHands: SimulatorHands;
  let mockInput: Input;
  let mockDomElement: HTMLCanvasElement;
  beforeEach(() => {
    document.exitPointerLock = vi.fn();
    mockState = {} as unknown as SimulatorControllerState;
    mockHands = {
      showHands: vi.fn(),
      hideHands: vi.fn(),
    } as unknown as SimulatorHands;

    mockInput = {
      controllers: [
        {userData: {id: 0, connected: false}},
        {userData: {id: 1, connected: false}},
      ],
      enableController: vi.fn(),
      disableController: vi.fn(),
      gamepadController: {
        init: vi.fn(),
      },
      dispatchEvent: vi.fn(),
    } as unknown as Input;

    mockDomElement = {
      requestPointerLock: vi.fn(),
    } as unknown as HTMLCanvasElement;

    mode = new SimulatorPointerLockMode(
      mockState,
      new Set(),
      mockHands,
      vi.fn(),
      vi.fn(),
      vi.fn()
    );

    mode.init({
      camera: new THREE.Camera(),
      input: mockInput,
      timer: new THREE.Timer(),
      domElement: mockDomElement,
    });
  });

  it('activates by enabling the pointer lock controller, hiding hands, and registering document listener', () => {
    const addListenerSpy = vi.spyOn(document, 'addEventListener');

    mode.onModeActivated();

    expect(mockInput.enableController).toHaveBeenCalledWith(
      mode.pointerLockController
    );
    expect(mockHands.hideHands).toHaveBeenCalled();
    expect(addListenerSpy).toHaveBeenCalledWith(
      'pointerlockchange',
      expect.any(Function)
    );
  });

  it('deactivates by disabling the controller, exiting lock, and removing listener', () => {
    const removeListenerSpy = vi.spyOn(document, 'removeEventListener');
    const exitLockSpy = vi.spyOn(document, 'exitPointerLock');

    // Pretend we are locked so exit is called
    Object.defineProperty(document, 'pointerLockElement', {
      value: mockDomElement,
      configurable: true,
    });

    mode.onModeDeactivated();

    expect(mockInput.disableController).toHaveBeenCalledWith(
      mode.pointerLockController
    );
    expect(exitLockSpy).toHaveBeenCalled();
    expect(removeListenerSpy).toHaveBeenCalledWith(
      'pointerlockchange',
      expect.any(Function)
    );

    // Cleanup mock
    Object.defineProperty(document, 'pointerLockElement', {
      value: null,
      configurable: true,
    });
  });

  it('requests pointer lock on pointer down when not already locked', () => {
    Object.defineProperty(document, 'pointerLockElement', {
      value: null,
      configurable: true,
    });

    mode.onPointerDown(new MouseEvent('pointerdown'));

    expect(mockDomElement.requestPointerLock).toHaveBeenCalled();
  });

  it('triggers selectstart on left click when locked', () => {
    Object.defineProperty(document, 'pointerLockElement', {
      value: mockDomElement,
      configurable: true,
    });
    // Manually trigger the listener
    mode.onModeActivated();
    document.dispatchEvent(new Event('pointerlockchange'));

    const selectStartSpy = vi.spyOn(
      mode.pointerLockController,
      'callSelectStart'
    );

    const clickEvent = new MouseEvent('pointerdown', {buttons: 1});
    mode.onPointerDown(clickEvent);

    expect(mode.pointerLockController.userData.selected).toBe(true);
    expect(selectStartSpy).toHaveBeenCalled();

    // Reset lock property
    Object.defineProperty(document, 'pointerLockElement', {
      value: null,
      configurable: true,
    });
  });

  it('triggers selectend on pointer up if selected', () => {
    mode.pointerLockController.userData.selected = true;
    const selectEndSpy = vi.spyOn(mode.pointerLockController, 'callSelectEnd');

    mode.onPointerUp();

    expect(mode.pointerLockController.userData.selected).toBe(false);
    expect(selectEndSpy).toHaveBeenCalled();
  });

  it('rotates camera on pointer move when locked', () => {
    Object.defineProperty(document, 'pointerLockElement', {
      value: mockDomElement,
      configurable: true,
    });
    // Manually trigger the listener
    mode.onModeActivated();
    document.dispatchEvent(new Event('pointerlockchange'));

    const rotateSpy = vi.spyOn(mode, 'rotateOnPointerMove');

    const moveEvent = new MouseEvent('pointermove');
    mode.onPointerMove(moveEvent);

    expect(rotateSpy).toHaveBeenCalledWith(moveEvent, mode.camera.quaternion);

    // Reset lock property
    Object.defineProperty(document, 'pointerLockElement', {
      value: null,
      configurable: true,
    });
  });
});
