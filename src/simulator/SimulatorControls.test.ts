import {afterEach, describe, expect, it, vi} from 'vitest';

import {SimulatorControllerState} from './SimulatorControllerState';
import {SimulatorControls} from './SimulatorControls';
import {SimulatorHands} from './SimulatorHands';
import {SimulatorInterface} from './SimulatorInterface';
import {SimulatorNavMesh} from './scene/SimulatorNavMesh';

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

  it('prevents the default wheel action when the active mode handles it', () => {
    const controls = createControls();
    const canvas = document.createElement('canvas');
    controls.renderer = {domElement: canvas} as never;
    const wheelSpy = vi
      .spyOn(controls.simulatorModeControls, 'onWheel')
      .mockReturnValue(true);
    connectedControls.push(controls);
    controls.connect();

    const event = new WheelEvent('wheel', {
      deltaY: -100,
      cancelable: true,
    });
    canvas.dispatchEvent(event);

    expect(event.defaultPrevented).toBe(true);
    expect(wheelSpy).toHaveBeenCalledWith(event);
  });

  it('does not prevent the default wheel action when the active mode does not handle it', () => {
    const controls = createControls();
    const wheelSpy = vi
      .spyOn(controls.simulatorModeControls, 'onWheel')
      .mockReturnValue(false);
    const event = new WheelEvent('wheel', {
      deltaY: -100,
      cancelable: true,
    });

    controls.onWheel(event);

    expect(event.defaultPrevented).toBe(false);
    expect(wheelSpy).toHaveBeenCalledWith(event);
  });

  it('does not capture or forward wheel events while controls are disabled', () => {
    const controls = createControls();
    const wheelSpy = vi
      .spyOn(controls.simulatorModeControls, 'onWheel')
      .mockReturnValue(true);
    controls.enabled = false;
    const event = new WheelEvent('wheel', {
      deltaY: -100,
      cancelable: true,
    });

    controls.onWheel(event);

    expect(event.defaultPrevented).toBe(false);
    expect(wheelSpy).not.toHaveBeenCalled();
  });
});
