import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';

import {SimulatorControls} from '../../../SimulatorControls';
import {SimulatorHands} from '../../../SimulatorHands';
import {SimulatorInterface} from '../../../SimulatorInterface';
import {SimulatorMode, SimulatorOptions} from '../../../SimulatorOptions';
import {
  getOverlayInstructionsForMode,
  SimulatorOverlayInstructions,
} from './SimulatorOverlayInstructions';

describe('SimulatorOverlayInstructions', () => {
  afterEach(() => {
    document.body.replaceChildren();
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it('returns adapted instruction rows for each SimulatorMode', () => {
    const userRows = getOverlayInstructionsForMode(SimulatorMode.USER);
    expect(userRows[0][0]).toEqual({
      keys: ['W', 'A', 'S', 'D'],
      label: 'Move',
    });
    expect(userRows[1]).toEqual([
      {keys: ['Right Click'], label: 'Drag to look around'},
      {keys: ['Left Click'], label: 'Select'},
    ]);

    const poseRows = getOverlayInstructionsForMode(SimulatorMode.POSE);
    expect(poseRows).toEqual([
      [{keys: ['W', 'A', 'S', 'D'], label: 'Move'}],
      [{keys: ['Mouse'], label: 'Click and drag to look around'}],
    ]);

    const pointerLockRows = getOverlayInstructionsForMode(
      SimulatorMode.POINTER_LOCK
    );
    expect(pointerLockRows).toEqual([
      [{keys: ['W', 'A', 'S', 'D'], label: 'Move'}],
      [
        {
          keys: ['Mouse'],
          label: 'Click the screen, then move the mouse to look around',
        },
      ],
    ]);

    const controllerRows = getOverlayInstructionsForMode(
      SimulatorMode.CONTROLLER
    );
    expect(controllerRows).toHaveLength(3);
    expect(controllerRows[0][0]).toEqual({
      keys: ['W', 'A', 'S', 'D'],
      label: 'Move hand',
    });
    expect(controllerRows[2]).toEqual([
      {keys: ['Space'], label: 'Pinch'},
      {keys: ['T'], label: 'Switch hand'},
    ]);

    const editorRows = getOverlayInstructionsForMode(SimulatorMode.EDITOR);
    expect(editorRows).toEqual(userRows);
  });

  it('renders keycaps and labels into shadow DOM and updates when simulatorMode changes', async () => {
    const element = document.createElement(
      'xrblocks-simulator-overlay-instructions'
    ) as SimulatorOverlayInstructions;
    element.simulatorMode = SimulatorMode.POINTER_LOCK;
    document.body.appendChild(element);
    await element.updateComplete;

    const keys = Array.from(
      element.shadowRoot?.querySelectorAll('.key') ?? []
    ).map((el) => el.textContent);
    const labels = Array.from(
      element.shadowRoot?.querySelectorAll('.label') ?? []
    ).map((el) => el.textContent);

    expect(keys).toEqual(['W', 'A', 'S', 'D', 'Mouse']);
    expect(labels).toEqual([
      'Move',
      'Click the screen, then move the mouse to look around',
    ]);

    element.simulatorMode = SimulatorMode.CONTROLLER;
    await element.updateComplete;

    const controllerLabels = Array.from(
      element.shadowRoot?.querySelectorAll('.label') ?? []
    ).map((el) => el.textContent);
    expect(controllerLabels).toContain('Move hand');
    expect(controllerLabels).toContain('Pinch');
  });

  describe('SimulatorInterface timer lifecycle', () => {
    let simulatorInterface: SimulatorInterface;
    let simulatorOptions: SimulatorOptions;
    let controls: SimulatorControls;
    let hands: SimulatorHands;

    beforeEach(async () => {
      vi.useFakeTimers();
      simulatorInterface = new SimulatorInterface(() => Promise.resolve());
      simulatorOptions = new SimulatorOptions();
      simulatorOptions.simulatorSettingsPanel.enabled = false;
      simulatorOptions.handPosePanel.enabled = false;
      controls = {
        simulatorMode: SimulatorMode.USER,
        setSimulatorSettingsPanelElement: vi.fn(),
      } as unknown as SimulatorControls;
      hands = {
        setHandPosePanelElement: vi.fn(),
      } as unknown as SimulatorHands;
      await simulatorInterface.init(simulatorOptions, controls, hands);
    });

    it('fades in 5 seconds after initialization finishes when there is no interaction, and fades out immediately when interaction starts', () => {
      const overlay = document.querySelector(
        'xrblocks-simulator-overlay-instructions'
      ) as SimulatorOverlayInstructions | null;
      expect(overlay).not.toBeNull();
      expect(overlay?.visible).toBe(false);

      simulatorInterface.startOverlayInstructionsTimer(
        simulatorOptions,
        SimulatorMode.USER
      );

      vi.advanceTimersByTime(4999);
      expect(overlay?.visible).toBe(false);

      vi.advanceTimersByTime(1);
      expect(overlay?.visible).toBe(true);

      // User starts interacting -> fades out immediately.
      simulatorInterface.notifyUserInteraction();
      expect(overlay?.visible).toBe(false);

      // Removed from DOM after transition completes.
      vi.advanceTimersByTime(500);
      expect(
        document.querySelector('xrblocks-simulator-overlay-instructions')
      ).toBeNull();
    });

    it('never fades in if the user interacts within the first 5 seconds', () => {
      const overlay = document.querySelector(
        'xrblocks-simulator-overlay-instructions'
      ) as SimulatorOverlayInstructions | null;
      expect(overlay).not.toBeNull();

      simulatorInterface.startOverlayInstructionsTimer(
        simulatorOptions,
        SimulatorMode.USER
      );

      vi.advanceTimersByTime(2000);
      simulatorInterface.notifyUserInteraction();
      expect(overlay?.visible).toBe(false);
      expect(
        document.querySelector('xrblocks-simulator-overlay-instructions')
      ).toBeNull();

      vi.advanceTimersByTime(5000);
      expect(overlay?.visible).toBe(false);
    });

    it('updates the overlay mode when setSimulatorMode is called', () => {
      const overlay = document.querySelector(
        'xrblocks-simulator-overlay-instructions'
      ) as SimulatorOverlayInstructions | null;
      expect(overlay?.simulatorMode).toBe(SimulatorMode.USER);

      simulatorInterface.setSimulatorMode(SimulatorMode.POSE);
      expect(overlay?.simulatorMode).toBe(SimulatorMode.POSE);
    });

    it('clears timers and removes the overlay on dispose', () => {
      simulatorInterface.startOverlayInstructionsTimer(
        simulatorOptions,
        SimulatorMode.USER
      );
      simulatorInterface.dispose();

      vi.advanceTimersByTime(10000);
      expect(
        document.querySelector('xrblocks-simulator-overlay-instructions')
      ).toBeNull();
    });
  });
});
