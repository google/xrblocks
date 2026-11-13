import './HandPosePanel';
import {expect, it} from 'vitest';
import * as THREE from 'three';
import {Input} from '../../../../input/Input';
import {SimulatorHands} from '../../../SimulatorHands';
import {SimulatorControllerState} from '../../../SimulatorControllerState';
import type {HandPosePanel} from './HandPosePanel';

it('shows and hides the pose controls with the simulator hands', async () => {
  const input = new Input();
  const hands = new SimulatorHands(
    new SimulatorControllerState(),
    new THREE.Scene()
  );
  hands.input = input;
  const panel = document.createElement(
    'xrblocks-simulator-hand-pose-panel'
  ) as HandPosePanel;
  document.body.append(panel);
  try {
    hands.setHandPosePanelElement(panel);
    hands.showHands();
    await panel.updateComplete;
    expect(panel.shadowRoot?.querySelector('button')).not.toBeNull();
    hands.hideHands();
    await panel.updateComplete;
    expect(panel.shadowRoot?.querySelector('button')).toBeNull();
  } finally {
    panel.remove();
    input.dispose();
  }
});
