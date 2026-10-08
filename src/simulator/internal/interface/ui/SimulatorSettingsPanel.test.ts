// @vitest-environment jsdom

import {describe, expect, it} from 'vitest';

import {SetSimulatorDayNightEvent} from '../../../events/SimulatorLightingEvents.js';
import {SimulatorSettingsPanel} from './SimulatorSettingsPanel.js';

async function mount() {
  if (!customElements.get('xrblocks-simulator-settings')) {
    customElements.define(
      'xrblocks-simulator-settings',
      SimulatorSettingsPanel
    );
  }
  const panel = document.createElement(
    'xrblocks-simulator-settings'
  ) as SimulatorSettingsPanel;
  panel.dayNightAvailable = true;
  panel.dayNightEnabled = true;
  panel.timeOfDay = 0.7;
  document.body.appendChild(panel);
  await panel.updateComplete;
  return panel;
}

function dayNightCheckbox(panel: SimulatorSettingsPanel) {
  return [...panel.shadowRoot!.querySelectorAll('input[type=checkbox]')].find(
    (input) => input.closest('label')?.textContent?.includes('Day / Night')
  ) as HTMLInputElement;
}

describe('SimulatorSettingsPanel day/night controls', () => {
  it('resets the time of day when day/night lighting is unchecked', async () => {
    const panel = await mount();
    const slider = panel.shadowRoot!.querySelector(
      'input[type=range]'
    ) as HTMLInputElement;
    expect(slider.value).toBe('0.7');
    expect(slider.disabled).toBe(false);

    const events: boolean[] = [];
    panel.addEventListener(SetSimulatorDayNightEvent.type, (event) => {
      events.push((event as SetSimulatorDayNightEvent).enabled);
    });
    const checkbox = dayNightCheckbox(panel);
    checkbox.checked = false;
    checkbox.dispatchEvent(new Event('change'));
    await panel.updateComplete;

    // Disabling drops the cycle and the next enable starts at day; the
    // slider must not show a stale time of day when the toggle comes back.
    expect(panel.timeOfDay).toBe(0);
    expect(slider.value).toBe('0');
    expect(panel.dayNightEnabled).toBe(false);
    expect(slider.disabled).toBe(true);
    expect(events).toEqual([false]);
  });
});
