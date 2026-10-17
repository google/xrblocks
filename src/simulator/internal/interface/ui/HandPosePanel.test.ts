import './HandPosePanel';
import * as THREE from 'three';
import {afterEach, describe, expect, it} from 'vitest';

import {SimulatorControllerState} from '../../../SimulatorControllerState';
import {SimulatorHands} from '../../../SimulatorHands';
import type {HandPosePanel} from './HandPosePanel';

describe('HandPosePanel', () => {
  afterEach(() => {
    document.body.replaceChildren();
  });

  it('defaults to hidden until simulator hands are shown', async () => {
    const panel = document.createElement(
      'xrblocks-simulator-hand-pose-panel'
    ) as HandPosePanel;
    document.body.appendChild(panel);
    await panel.updateComplete;

    expect(panel.visible).toBe(false);
    expect(panel.shadowRoot?.querySelector('.hand-pose-panel')).toBeNull();

    const hands = new SimulatorHands(
      new SimulatorControllerState(),
      new THREE.Scene()
    );
    hands.input = {hands: []} as never;
    hands.setHandPosePanelElement(panel);
    await panel.updateComplete;

    expect(panel.visible).toBe(false);
    expect(panel.shadowRoot?.querySelector('.hand-pose-panel')).toBeNull();

    hands.showHands();
    await panel.updateComplete;

    expect(panel.visible).toBe(true);
    expect(panel.shadowRoot?.querySelector('.hand-pose-panel')).not.toBeNull();

    hands.hideHands();
    await panel.updateComplete;

    expect(panel.visible).toBe(false);
    expect(panel.shadowRoot?.querySelector('.hand-pose-panel')).toBeNull();
  });
});
