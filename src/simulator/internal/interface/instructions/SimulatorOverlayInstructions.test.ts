import {expect, it, vi} from 'vitest';
import {controlFixture} from '../../../SimulatorControls.test-fixture';
import {SimulatorControls} from '../../../SimulatorControls';
import {SimulatorMode} from '../../../SimulatorOptions';
import './SimulatorOverlayInstructions';

it('removes owned interface nodes and cancels pending overlay work on dispose', async () => {
  const f = controlFixture();
  const controls = new SimulatorControls(
    f.state,
    f.hands,
    f.navMesh,
    () => {},
    f.ui
  );
  f.simulatorOptions.handPosePanel.enabled = false;
  try {
    await f.ui.init(f.simulatorOptions, controls, f.hands);
    vi.useFakeTimers();
    const overlay = document.querySelector(
      'xrblocks-simulator-overlay-instructions'
    )!;
    expect(overlay).not.toBeNull();
    f.ui.startOverlayInstructionsTimer(f.simulatorOptions, SimulatorMode.USER);
    f.ui.dispose();
    vi.runAllTimers();
    expect(overlay.isConnected).toBe(false);
    expect(
      document.querySelector('xrblocks-simulator-overlay-instructions')
    ).toBeNull();
    expect(vi.getTimerCount()).toBe(0);
  } finally {
    controls.dispose();
    f.dispose();
    vi.useRealTimers();
  }
});
