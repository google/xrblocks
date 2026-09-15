import * as THREE from 'three';
import {beforeEach, describe, expect, it, vi} from 'vitest';

import {Input} from '../../input/Input';
import {MouseController} from '../../input/MouseController';
import {Interaction} from '../../interaction/Interaction';
import {SimulatorControllerState} from '../SimulatorControllerState';
import {SimulatorHands} from '../SimulatorHands';
import {SimulatorNavMesh} from '../internal/navmesh/SimulatorNavMesh';
import {SimulatorUserMode} from './SimulatorUserMode';

describe('SimulatorUserMode wheel routing', () => {
  let canvas: HTMLCanvasElement;
  let input: Input;
  let interaction: Interaction;
  let mode: SimulatorUserMode;
  let mouseController: MouseController;
  let queueWheelIntent: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    canvas = document.createElement('canvas');
    mouseController = {
      updateMousePositionFromEvent: vi.fn(),
      callSelectStart: vi.fn(),
      userData: {connected: true},
    } as unknown as MouseController;
    input = {
      gamepadController: {init: vi.fn()},
      mouseController,
    } as unknown as Input;
    queueWheelIntent = vi.fn().mockReturnValue(true);
    interaction = {queueWheelIntent} as unknown as Interaction;
    mode = new SimulatorUserMode(
      {} as SimulatorControllerState,
      new Set(),
      {} as SimulatorHands,
      new SimulatorNavMesh(),
      vi.fn(),
      vi.fn()
    );
    mode.init({
      camera: new THREE.Camera(),
      input,
      interaction,
      timer: new THREE.Timer(),
      domElement: canvas,
    });
  });

  it('routes normalized wheel input through Interaction before deciding scroll or scale', () => {
    const event = new WheelEvent('wheel', {deltaY: -100});

    expect(mode.onWheel(event)).toBe(true);

    expect(queueWheelIntent).toHaveBeenCalledWith(mouseController, -100);
  });

  it('returns false when Interaction rejects the intent', () => {
    queueWheelIntent.mockReturnValue(false);

    expect(mode.onWheel(new WheelEvent('wheel', {deltaY: 100}))).toBe(false);
  });

  it('refreshes the pointer before a press that has no preceding move event', () => {
    const event = new MouseEvent('pointerdown', {
      buttons: 1,
      clientX: 120,
      clientY: 240,
    });
    mode.onPointerDown(event);
    expect(mouseController.updateMousePositionFromEvent).toHaveBeenCalledWith(
      event
    );
    expect(
      vi.mocked(mouseController.updateMousePositionFromEvent).mock
        .invocationCallOrder[0]
    ).toBeLessThan(
      vi.mocked(mouseController.callSelectStart).mock.invocationCallOrder[0]
    );
  });
});
