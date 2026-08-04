import {afterEach, describe, expect, it, vi} from 'vitest';

import {SimulatorControllerState} from './SimulatorControllerState';
import {SimulatorControls} from './SimulatorControls';
import {SimulatorHands} from './SimulatorHands';
import {SimulatorInterface} from './SimulatorInterface';
import {SimulatorNavMesh} from './scene/SimulatorNavMesh';
import {Keycodes} from '../utils/Keycodes';

function createControls() {
  return new SimulatorControls(
    {} as SimulatorControllerState,
    {} as SimulatorHands,
    new SimulatorNavMesh(),
    vi.fn(),
    {} as SimulatorInterface
  );
}

describe('SimulatorControls wheel input', () => {
  const connectedControls: SimulatorControls[] = [];

  afterEach(() => {
    for (const controls of connectedControls) {
      document.removeEventListener('keyup', controls.onKeyUp);
      document.removeEventListener('keydown', controls.onKeyDown);
      window.removeEventListener('blur', controls.onBlur);
      document.removeEventListener('visibilitychange', controls.onBlur);
    }
    connectedControls.length = 0;
  });

  it('prevents browser wheel defaults only when the active mode handles them', () => {
    const controls = createControls();
    const canvas = document.createElement('canvas');
    controls.renderer = {domElement: canvas} as never;
    vi.spyOn(controls.simulatorModeControls, 'onWheel')
      .mockReturnValueOnce(true)
      .mockReturnValueOnce(false);
    connectedControls.push(controls);
    controls.connect();

    const handled = new WheelEvent('wheel', {
      deltaY: -100,
      cancelable: true,
    });
    canvas.dispatchEvent(handled);
    expect(handled.defaultPrevented).toBe(true);

    const rejected = new WheelEvent('wheel', {
      deltaY: -100,
      cancelable: true,
    });
    canvas.dispatchEvent(rejected);
    expect(rejected.defaultPrevented).toBe(false);
  });

  it('cancels pointer interactions and clears keys on disable, blur, and cancel', () => {
    const controls = createControls();
    const setPointerCapture = vi.fn();
    const releasePointerCapture = vi.fn();
    const hasPointerCapture = vi.fn().mockReturnValue(true);
    controls.renderer = {
      domElement: {
        setPointerCapture,
        releasePointerCapture,
        hasPointerCapture,
      },
    } as never;
    vi.spyOn(
      controls.simulatorModeControls,
      'onPointerDown'
    ).mockImplementation(() => {});
    const pointerUp = vi
      .spyOn(controls.simulatorModeControls, 'onPointerUp')
      .mockImplementation(() => {});

    controls.onPointerDown(pointerEvent('pointerdown', 1));
    controls.downKeys.add(Keycodes.W_CODE);
    controls.onBlur();
    expect(controls.pointerDown).toBe(false);
    expect(controls.downKeys.size).toBe(0);
    expect(pointerUp).toHaveBeenCalledOnce();
    expect(releasePointerCapture).toHaveBeenCalledWith(1);

    controls.onPointerDown(pointerEvent('pointerdown', 2));
    controls.onPointerCancel(pointerEvent('pointercancel', 2));
    expect(controls.pointerDown).toBe(false);
    expect(pointerUp).toHaveBeenCalledTimes(2);

    controls.onPointerDown(pointerEvent('pointerdown', 3));
    controls.downKeys.add(Keycodes.W_CODE);
    controls.setEnabled(false);
    expect(controls.pointerDown).toBe(false);
    expect(controls.downKeys.size).toBe(0);
    expect(pointerUp).toHaveBeenCalledTimes(3);
  });
});

function pointerEvent(type: string, pointerId: number): PointerEvent {
  return Object.assign(new MouseEvent(type), {pointerId}) as PointerEvent;
}
