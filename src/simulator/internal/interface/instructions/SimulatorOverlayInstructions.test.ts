import {expect, it, vi} from 'vitest';
import * as THREE from 'three';
import {SimulatorControllerState} from '../../../SimulatorControllerState';
import {SimulatorHands} from '../../../SimulatorHands';
import {SimulatorInterface} from '../../../SimulatorInterface';
import {SimulatorNavMesh} from '../../navmesh/SimulatorNavMesh';
import {SimulatorControls} from '../../../SimulatorControls';
import {SimulatorMode, SimulatorOptions} from '../../../SimulatorOptions';
import './SimulatorOverlayInstructions';

it('removes owned interface nodes and cancels pending overlay work on dispose', async () => {
  const state = new SimulatorControllerState();
  const hands = new SimulatorHands(state, new THREE.Scene());
  const ui = new SimulatorInterface();
  const options = new SimulatorOptions();
  const controls = new SimulatorControls(
    state,
    hands,
    new SimulatorNavMesh(),
    () => {},
    ui
  );
  options.handPosePanel.enabled = false;
  try {
    await ui.init(options, controls, hands);
    vi.useFakeTimers();
    const overlay = document.querySelector(
      'xrblocks-simulator-overlay-instructions'
    )!;
    expect(overlay).not.toBeNull();
    ui.startOverlayInstructionsTimer(options, SimulatorMode.USER);
    ui.dispose();
    vi.runAllTimers();
    expect(overlay.isConnected).toBe(false);
    expect(
      document.querySelector('xrblocks-simulator-overlay-instructions')
    ).toBeNull();
    expect(vi.getTimerCount()).toBe(0);
  } finally {
    controls.dispose();
    ui.dispose();
    vi.useRealTimers();
  }
});
