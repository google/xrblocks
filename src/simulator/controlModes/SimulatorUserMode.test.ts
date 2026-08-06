import * as THREE from 'three';
import {beforeEach, describe, expect, it, vi} from 'vitest';

import {Input} from '../../input/Input';
import {MouseController} from '../../input/MouseController';
import {Interaction} from '../../interaction/Interaction';
import {SimulatorControllerState} from '../SimulatorControllerState';
import {SimulatorHands} from '../SimulatorHands';
import {SimulatorNavMesh} from '../scene/SimulatorNavMesh';
import {SimulatorUserMode} from './SimulatorUserMode';

describe('SimulatorUserMode wheel scaling', () => {
  let canvas: HTMLCanvasElement;
  let input: Input;
  let interaction: Interaction;
  let mode: SimulatorUserMode;
  let mouseController: MouseController;
  let queueScaleIntent: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    canvas = document.createElement('canvas');
    mouseController = {
      updateMousePositionFromEvent: vi.fn(),
      userData: {connected: true},
    } as unknown as MouseController;
    input = {
      gamepadController: {init: vi.fn()},
      mouseController,
    } as unknown as Input;
    queueScaleIntent = vi.fn().mockReturnValue(true);
    interaction = {queueScaleIntent} as unknown as Interaction;
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

  it('routes wheel scaling through Interaction', () => {
    const event = new WheelEvent('wheel', {deltaY: -100});

    expect(mode.onWheel(event)).toBe(true);

    expect(queueScaleIntent).toHaveBeenCalledWith(
      mouseController,
      expect.any(Number)
    );
    expect(queueScaleIntent.mock.calls[0][1]).toBeGreaterThan(1);
  });

  it('returns false when Interaction rejects the intent', () => {
    queueScaleIntent.mockReturnValue(false);

    expect(mode.onWheel(new WheelEvent('wheel', {deltaY: 100}))).toBe(false);
  });
});
