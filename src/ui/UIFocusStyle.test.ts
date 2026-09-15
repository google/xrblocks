import {describe, expect, it} from 'vitest';
import {UIPanel} from './components/UIPanel';
import {createThemeSnapshot, grayGlassTheme} from './UITheme';

describe('Editable UI theme roles', () => {
  it('retains and validates focus styles with the existing style contract', () => {
    const panel = new UIPanel({style: {':focus': {borderColor: '#ffffff'}}});
    panel.style[':focus']!.borderWidth = 2;
    expect(panel.style[':focus']).toEqual({
      borderColor: '#ffffff',
      borderWidth: 2,
    });
    expect(
      () =>
        new UIPanel({
          style: {':focus': {gap: 20} as never},
        })
    ).toThrow(/Unknown|cannot change/);
  });

  it('accepts input and scroll theme roles without changing existing presets', () => {
    const theme = createThemeSnapshot({
      ...grayGlassTheme,
      styles: {
        ...grayGlassTheme.styles,
        input: {borderWidth: 1, ':focus': {borderColor: '#ffffff'}},
        scroll: {padding: 8},
      },
    });
    expect(theme.styles?.input?.[':focus']?.borderColor).toBe('#ffffff');
    expect(theme.styles?.scroll?.padding).toBe(8);
  });
});
