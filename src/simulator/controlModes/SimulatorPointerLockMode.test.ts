import * as THREE from 'three';
import {describe, it, expect, vi, beforeEach, afterEach} from 'vitest';

import {Input} from '../../input/Input';
import {SimulatorControllerState} from '../SimulatorControllerState';
import {SimulatorHands} from '../SimulatorHands';
import {SimulatorNavMesh} from '../scene/SimulatorNavMesh';
import {SimulatorPointerLockMode} from './SimulatorPointerLockMode';

describe('SimulatorPointerLockMode', () => {
  let mode: SimulatorPointerLockMode;
  let mockState: SimulatorControllerState;
  let mockHands: SimulatorHands;
  let mockInput: Input;
  let mockNavMesh: SimulatorNavMesh;
  let mockDomElement: HTMLCanvasElement;

  afterEach(() => {
    Object.defineProperty(document, 'pointerLockElement', {
      value: null,
      configurable: true,
    });
    vi.restoreAllMocks();
  });

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

    mockNavMesh = {
      constrained: false,
      applyUserMovement: vi.fn(),
    } as unknown as SimulatorNavMesh;

    mockDomElement = {
      requestPointerLock: vi.fn(),
    } as unknown as HTMLCanvasElement;

    mode = new SimulatorPointerLockMode(
      mockState,
      new Set(),
      mockHands,
      mockNavMesh,
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

  it('activates and deactivates the pointer-lock controller lifecycle', () => {
    const addListenerSpy = vi.spyOn(document, 'addEventListener');
    const removeListenerSpy = vi.spyOn(document, 'removeEventListener');
    const exitLockSpy = vi.spyOn(document, 'exitPointerLock');

    mode.onModeActivated();

    expect(mockInput.enableController).toHaveBeenCalledWith(
      mode.pointerLockController
    );
    expect(mockHands.hideHands).toHaveBeenCalled();
    expect(addListenerSpy).toHaveBeenCalledWith(
      'pointerlockchange',
      expect.any(Function)
    );

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
  });

  it('requests lock and dispatches select start/end after locking', () => {
    Object.defineProperty(document, 'pointerLockElement', {
      value: null,
      configurable: true,
    });

    mode.onPointerDown(new MouseEvent('pointerdown'));
    expect(mockDomElement.requestPointerLock).toHaveBeenCalled();

    let selectStarts = 0;
    let selectEnds = 0;
    mode.pointerLockController.addEventListener('selectstart', () => {
      selectStarts += 1;
    });
    mode.pointerLockController.addEventListener('selectend', () => {
      selectEnds += 1;
    });
    Object.defineProperty(document, 'pointerLockElement', {
      value: mockDomElement,
      configurable: true,
    });
    mode.onModeActivated();
    document.dispatchEvent(new Event('pointerlockchange'));

    const clickEvent = new MouseEvent('pointerdown', {buttons: 1});
    mode.onPointerDown(clickEvent);

    expect(mode.pointerLockController.userData.selected).toBe(true);
    expect(selectStarts).toBe(1);

    mode.onPointerUp();

    expect(mode.pointerLockController.userData.selected).toBe(false);
    expect(selectEnds).toBe(1);

    mode.onModeDeactivated();
  });
});
