import {expect, it} from 'vitest';
import {SetSimulatorDayNightEvent} from '../../../events/SimulatorLightingEvents';
import {SimulatorSettingsPanel} from './SimulatorSettingsPanel';

it('clears the time slider and disables it when lighting is switched off', async () => {
  // Register the actual element; no substitute settings or lighting system.
  if (!customElements.get('xrblocks-simulator-settings'))
    customElements.define(
      'xrblocks-simulator-settings',
      SimulatorSettingsPanel
    );
  const panel = document.createElement(
    'xrblocks-simulator-settings'
  ) as SimulatorSettingsPanel;
  panel.dayNightAvailable = true;
  panel.dayNightEnabled = true;
  panel.timeOfDay = 0.7;
  document.body.append(panel);
  try {
    await panel.updateComplete;
    const slider = panel.shadowRoot!.querySelector(
      'input[type=range]'
    ) as HTMLInputElement;
    const toggle = [
      ...panel.shadowRoot!.querySelectorAll('input[type=checkbox]'),
    ].find((input) =>
      input.closest('label')?.textContent?.includes('Day / Night')
    ) as HTMLInputElement;
    const requests: boolean[] = [];
    panel.addEventListener(SetSimulatorDayNightEvent.type, (event) => {
      requests.push((event as SetSimulatorDayNightEvent).enabled);
    });
    toggle.checked = false;
    toggle.dispatchEvent(new Event('change'));
    await panel.updateComplete;
    expect(slider.value).toBe('0');
    expect(slider.disabled).toBe(true);
    expect(requests).toEqual([false]);
  } finally {
    panel.remove();
  }
});
