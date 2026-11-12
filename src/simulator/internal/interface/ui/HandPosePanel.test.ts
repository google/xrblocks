import './HandPosePanel';
import {expect, it} from 'vitest';
import {controlFixture} from '../../../SimulatorControls.test-fixture';
import type {HandPosePanel} from './HandPosePanel';

it('shows and hides the pose controls with the simulator hands', async () => {
  const f = controlFixture();
  const panel = document.createElement(
    'xrblocks-simulator-hand-pose-panel'
  ) as HandPosePanel;
  document.body.append(panel);
  try {
    f.hands.setHandPosePanelElement(panel);
    f.hands.showHands();
    await panel.updateComplete;
    expect(panel.shadowRoot?.querySelector('button')).not.toBeNull();
    f.hands.hideHands();
    await panel.updateComplete;
    expect(panel.shadowRoot?.querySelector('button')).toBeNull();
  } finally {
    panel.remove();
    f.dispose();
  }
});
