import {beforeEach, describe, expect, it, vi} from 'vitest';

import {SimulatorMode} from '../../../SimulatorOptions';
import {SimulatorInstructions} from './SimulatorInstructions';
import {SimulatorInstructionsCard} from './SimulatorInstructionsCard';

describe('SimulatorInstructions', () => {
  let instructions: SimulatorInstructions;

  beforeEach(() => {
    instructions = new SimulatorInstructions();
  });

  it('provides a single UserInstructions step when simulatorMode is USER', () => {
    instructions.simulatorMode = SimulatorMode.USER;
    const steps = instructions.getSteps();

    expect(steps).toHaveLength(1);
    expect(steps[0].strings.join('')).toContain(
      'xrblocks-simulator-user-instructions'
    );
  });

  it('provides a single NavigationInstructions step when simulatorMode is POSE', () => {
    instructions.simulatorMode = SimulatorMode.POSE;
    const steps = instructions.getSteps();

    expect(steps).toHaveLength(1);
    expect(steps[0].strings.join('')).toContain(
      'xrblocks-simulator-navigation-instructions'
    );
  });

  it('provides a single HandsInstructions step when simulatorMode is CONTROLLER', () => {
    instructions.simulatorMode = SimulatorMode.CONTROLLER;
    const steps = instructions.getSteps();

    expect(steps).toHaveLength(1);
    expect(steps[0].strings.join('')).toContain(
      'xrblocks-simulator-hands-instructions'
    );
  });

  it('falls back to UserInstructions step for EDITOR and POINTER_LOCK modes', () => {
    instructions.simulatorMode = SimulatorMode.EDITOR;
    expect(instructions.getSteps()[0].strings.join('')).toContain(
      'xrblocks-simulator-user-instructions'
    );

    instructions.simulatorMode = SimulatorMode.POINTER_LOCK;
    expect(instructions.getSteps()[0].strings.join('')).toContain(
      'xrblocks-simulator-user-instructions'
    );
  });

  it('returns all default 3 steps when simulatorMode is undefined', () => {
    instructions.simulatorMode = undefined;
    const steps = instructions.getSteps();

    expect(steps).toHaveLength(3);
    expect(steps[0].strings.join('')).toContain(
      'xrblocks-simulator-user-instructions'
    );
    expect(steps[1].strings.join('')).toContain(
      'xrblocks-simulator-navigation-instructions'
    );
    expect(steps[2].strings.join('')).toContain(
      'xrblocks-simulator-hands-instructions'
    );
  });

  it('closes immediately on continueButtonClicked when viewing a single mode instruction without custom instructions', () => {
    instructions.simulatorMode = SimulatorMode.CONTROLLER;
    const closeSpy = vi.spyOn(instructions, 'closeInstructions');

    instructions.continueButtonClicked();

    expect(closeSpy).toHaveBeenCalledOnce();
  });

  it('advances to custom instructions before closing when custom instructions exist', () => {
    instructions.simulatorMode = SimulatorMode.CONTROLLER;
    instructions.customInstructions = [
      {header: 'Custom Step', description: 'Custom text'},
    ];
    const closeSpy = vi.spyOn(instructions, 'closeInstructions');

    expect(instructions.step).toBe(0);

    instructions.continueButtonClicked();
    expect(instructions.step).toBe(1);
    expect(closeSpy).not.toHaveBeenCalled();

    instructions.continueButtonClicked();
    expect(closeSpy).toHaveBeenCalledOnce();
  });

  it('cycles through all 3 default steps when simulatorMode is undefined before closing', () => {
    instructions.simulatorMode = undefined;
    const closeSpy = vi.spyOn(instructions, 'closeInstructions');

    instructions.continueButtonClicked();
    expect(instructions.step).toBe(1);
    expect(closeSpy).not.toHaveBeenCalled();

    instructions.continueButtonClicked();
    expect(instructions.step).toBe(2);
    expect(closeSpy).not.toHaveBeenCalled();

    instructions.continueButtonClicked();
    expect(closeSpy).toHaveBeenCalledOnce();
  });
});

describe('SimulatorInstructionsCard', () => {
  it('defaults continueButtonText to Continue and allows customizing', () => {
    const card = new SimulatorInstructionsCard();
    expect(card.continueButtonText).toBe('Continue');

    card.continueButtonText = 'Close';
    expect(card.continueButtonText).toBe('Close');
  });
});
