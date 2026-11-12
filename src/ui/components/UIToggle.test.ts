import {expect, it, vi} from 'vitest';
import {getSemanticControl} from '../../interaction/SemanticControl';
import {UIToggle} from './UIToggle';

it('reports user activation once per change and keeps programmatic changes silent', () => {
  const onChange = vi.fn();
  const toggle = new UIToggle({ariaLabel: 'Wi-Fi', onChange});
  const control = getSemanticControl(toggle)!;
  toggle.checked = true;
  expect(toggle.checked).toBe(true);
  expect(onChange).not.toHaveBeenCalled();
  control.activate();
  expect(toggle.checked).toBe(false);
  control.activate();
  expect(toggle.checked).toBe(true);
  expect(onChange.mock.calls).toEqual([[false], [true]]);
  toggle.disabled = true;
  expect(control.isDisabled()).toBe(true);
});
