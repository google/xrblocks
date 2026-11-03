import {describe, expect, it, vi} from 'vitest';

import {getSemanticControl} from '../../interaction/SemanticControl';
import {getUIElementKind, getUIRevision} from '../UIElement';
import {createThemeSnapshot, grayGlassTheme} from '../UITheme';
import {UIToggle} from './UIToggle';

describe('UIToggle', () => {
  it('defaults to an enabled, unchecked switch with its accessible name', () => {
    const toggle = new UIToggle({ariaLabel: 'Wi-Fi'});

    expect(toggle.checked).toBe(false);
    expect(toggle.disabled).toBe(false);
    expect(toggle.ariaLabel).toBe('Wi-Fi');
    expect(toggle.onChange).toBeUndefined();
    expect(toggle.name).toBe('UIToggle');
    expect(getUIElementKind(toggle)).toBe('toggle');
    const initial = new UIToggle({
      ariaLabel: 'Airplane mode',
      checked: true,
      disabled: true,
    });
    expect(initial.checked).toBe(true);
    expect(initial.disabled).toBe(true);
  });

  it('requires ariaLabel and boolean checked and disabled options', () => {
    expect(() => new UIToggle({ariaLabel: ''})).toThrow(
      'UIToggle requires ariaLabel.'
    );
    expect(() => new UIToggle({} as never)).toThrow(
      'UIToggle requires ariaLabel.'
    );
    expect(
      () => new UIToggle({ariaLabel: 'Wi-Fi', checked: 'yes' as never})
    ).toThrow('UIToggle checked must be a boolean.');
    expect(
      () => new UIToggle({ariaLabel: 'Wi-Fi', disabled: 1 as never})
    ).toThrow('UIToggle disabled must be a boolean.');
  });

  it('applies programmatic checked and disabled changes without onChange', () => {
    const onChange = vi.fn();
    const toggle = new UIToggle({ariaLabel: 'Wi-Fi', onChange});
    const initial = getUIRevision(toggle);

    toggle.checked = true;
    expect(toggle.checked).toBe(true);
    expect(getUIRevision(toggle)).toBeGreaterThan(initial);
    const checkedRevision = getUIRevision(toggle);
    toggle.checked = true;
    expect(getUIRevision(toggle)).toBe(checkedRevision);
    expect(() => {
      toggle.checked = 'off' as never;
    }).toThrow('UIToggle checked must be a boolean.');
    expect(toggle.checked).toBe(true);

    toggle.disabled = true;
    expect(toggle.disabled).toBe(true);
    expect(getUIRevision(toggle)).toBeGreaterThan(checkedRevision);
    expect(() => {
      toggle.disabled = 0 as never;
    }).toThrow('UIToggle disabled must be a boolean.');
    expect(toggle.disabled).toBe(true);
    expect(onChange).not.toHaveBeenCalled();
  });

  it('registers a button semantic control whose disabled state follows the toggle', () => {
    const toggle = new UIToggle({ariaLabel: 'Wi-Fi'});
    const control = getSemanticControl(toggle)!;

    expect(control.kind).toBe('button');
    expect(control.isDisabled()).toBe(false);
    toggle.disabled = true;
    expect(control.isDisabled()).toBe(true);
    toggle.disabled = false;
    expect(control.isDisabled()).toBe(false);
  });

  it('flips on each activation and reports the new state once', () => {
    const toggle = new UIToggle({ariaLabel: 'Wi-Fi'});
    const onChange = vi.fn();
    toggle.onChange = onChange;
    const control = getSemanticControl(toggle)!;
    const initial = getUIRevision(toggle);

    control.activate();
    expect(toggle.checked).toBe(true);
    expect(getUIRevision(toggle)).toBeGreaterThan(initial);
    control.activate();
    expect(toggle.checked).toBe(false);
    expect(onChange.mock.calls).toEqual([[true], [false]]);
  });

  it('accepts a toggle theme style role', () => {
    const theme = createThemeSnapshot({
      ...grayGlassTheme,
      styles: {
        ...grayGlassTheme.styles,
        toggle: {width: 72, ':hover': {opacity: 0.9}},
      },
    });

    expect(theme.styles?.toggle?.width).toBe(72);
    expect(theme.styles?.toggle?.[':hover']?.opacity).toBe(0.9);
  });
});
