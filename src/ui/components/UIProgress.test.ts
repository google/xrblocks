import {describe, expect, it} from 'vitest';

import {getSemanticControl} from '../../interaction/SemanticControl';
import {getUIElementKind, getUIRevision} from '../UIElement';
import {createThemeSnapshot, grayGlassTheme} from '../UITheme';
import {UIProgress} from './UIProgress';

describe('UIProgress', () => {
  it('defaults to an empty 0 to 1 bar that is not a control', () => {
    const progress = new UIProgress({ariaLabel: 'Upload'});

    expect(progress.value).toBe(0);
    expect(progress.min).toBe(0);
    expect(progress.max).toBe(1);
    expect(progress.ariaLabel).toBe('Upload');
    expect(progress.name).toBe('UIProgress');
    expect(getUIElementKind(progress)).toBe('progress');
    expect(getSemanticControl(progress)).toBeUndefined();
    const files = new UIProgress({
      ariaLabel: 'Files',
      min: 10,
      max: 50,
      value: 30,
    });
    expect([files.min, files.max, files.value]).toEqual([10, 50, 30]);
  });

  it('requires ariaLabel and finite values with min below max', () => {
    expect(() => new UIProgress({ariaLabel: ''})).toThrow(
      'UIProgress requires ariaLabel.'
    );
    expect(() => new UIProgress({} as never)).toThrow(
      'UIProgress requires ariaLabel.'
    );
    for (const range of [
      {min: 1, max: 1},
      {min: 2, max: 1},
      {min: Number.NaN},
      {max: Number.POSITIVE_INFINITY},
    ]) {
      expect(() => new UIProgress({ariaLabel: 'Upload', ...range})).toThrow(
        'UIProgress requires finite values with min < max.'
      );
    }
    expect(
      () => new UIProgress({ariaLabel: 'Upload', value: Number.NaN})
    ).toThrow('UIProgress value must be finite.');
  });

  it('clamps value to its range and marks the UI dirty only on change', () => {
    expect(new UIProgress({ariaLabel: 'Upload', value: 2}).value).toBe(1);
    const progress = new UIProgress({ariaLabel: 'Upload', value: -1});
    expect(progress.value).toBe(0);
    const initial = getUIRevision(progress);

    progress.value = 0.25;
    expect(progress.value).toBe(0.25);
    const quarter = getUIRevision(progress);
    expect(quarter).toBeGreaterThan(initial);
    progress.value = 0.25;
    expect(getUIRevision(progress)).toBe(quarter);

    progress.value = 5;
    expect(progress.value).toBe(1);
    const full = getUIRevision(progress);
    expect(full).toBeGreaterThan(quarter);
    progress.value = 7;
    expect(getUIRevision(progress)).toBe(full);

    expect(() => {
      progress.value = Number.POSITIVE_INFINITY;
    }).toThrow('UIProgress value must be finite.');
    expect(progress.value).toBe(1);
    expect(getUIRevision(progress)).toBe(full);
  });

  it('accepts a progress theme style role', () => {
    const theme = createThemeSnapshot({
      ...grayGlassTheme,
      styles: {...grayGlassTheme.styles, progress: {height: 16}},
    });

    expect(theme.styles?.progress?.height).toBe(16);
  });
});
