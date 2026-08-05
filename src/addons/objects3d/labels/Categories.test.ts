import {describe, it, expect} from 'vitest';

import {
  categorize,
  isFlatLabel,
  isSurfaceLabel,
  isTinyFlatLabel,
  FLAT_LABEL_RE,
  LIGHT_LABEL_RE,
  SMALL_LABEL_RE,
  SURFACE_LABEL_RE,
  TINY_FLAT_LABEL_RE,
} from './Categories';

describe('FLAT_LABEL_RE', () => {
  it('matches flat wall-mounted items', () => {
    expect(FLAT_LABEL_RE.test('painting')).toBe(true);
    expect(FLAT_LABEL_RE.test('TV')).toBe(true);
    expect(FLAT_LABEL_RE.test('mirror')).toBe(true);
    expect(FLAT_LABEL_RE.test('monitor')).toBe(true);
    expect(FLAT_LABEL_RE.test('window')).toBe(true);
  });

  it('does not match non-flat items', () => {
    expect(FLAT_LABEL_RE.test('sofa')).toBe(false);
    expect(FLAT_LABEL_RE.test('cup')).toBe(false);
  });
});

describe('LIGHT_LABEL_RE', () => {
  it('matches light fixtures', () => {
    expect(LIGHT_LABEL_RE.test('lamp')).toBe(true);
    expect(LIGHT_LABEL_RE.test('chandelier')).toBe(true);
    expect(LIGHT_LABEL_RE.test('pendant')).toBe(true);
    expect(LIGHT_LABEL_RE.test('lightbulb')).toBe(true);
  });
});

describe('SMALL_LABEL_RE', () => {
  it('matches small tabletop items', () => {
    expect(SMALL_LABEL_RE.test('cup')).toBe(true);
    expect(SMALL_LABEL_RE.test('remote')).toBe(true);
    expect(SMALL_LABEL_RE.test('book')).toBe(true);
    expect(SMALL_LABEL_RE.test('phone')).toBe(true);
  });
});

describe('SURFACE_LABEL_RE', () => {
  it('matches architectural surfaces', () => {
    expect(SURFACE_LABEL_RE.test('wall')).toBe(true);
    expect(SURFACE_LABEL_RE.test('floor')).toBe(true);
    expect(SURFACE_LABEL_RE.test('ceiling')).toBe(true);
    expect(SURFACE_LABEL_RE.test('ground')).toBe(true);
  });

  it('does not match object labels', () => {
    expect(SURFACE_LABEL_RE.test('sofa')).toBe(false);
    expect(SURFACE_LABEL_RE.test('lamp')).toBe(false);
  });
});

describe('TINY_FLAT_LABEL_RE', () => {
  it('matches tiny wall items', () => {
    expect(TINY_FLAT_LABEL_RE.test('switch')).toBe(true);
    expect(TINY_FLAT_LABEL_RE.test('outlet')).toBe(true);
    expect(TINY_FLAT_LABEL_RE.test('thermostat')).toBe(true);
  });
});

describe('isSurfaceLabel', () => {
  it('returns true for plain surface labels', () => {
    expect(isSurfaceLabel('wall')).toBe(true);
    expect(isSurfaceLabel('floor')).toBe(true);
    expect(isSurfaceLabel('ceiling')).toBe(true);
  });

  it('returns false for recognised object categories even if label contains surface word', () => {
    // "wall-mounted lamp" — LIGHT wins over SURFACE
    expect(isSurfaceLabel('wall-mounted lamp')).toBe(false);
    // "TV" is flat — FLAT wins over any surface match
    expect(isSurfaceLabel('TV')).toBe(false);
    // "cup" is small
    expect(isSurfaceLabel('cup')).toBe(false);
  });

  it('returns false for null / undefined', () => {
    expect(isSurfaceLabel(null)).toBe(false);
    expect(isSurfaceLabel(undefined)).toBe(false);
    expect(isSurfaceLabel('')).toBe(false);
  });
});

describe('isFlatLabel', () => {
  it('returns true for flat items', () => {
    expect(isFlatLabel('painting')).toBe(true);
    expect(isFlatLabel('TV')).toBe(true);
  });

  it('returns false for non-flat items', () => {
    expect(isFlatLabel('sofa')).toBe(false);
    expect(isFlatLabel(null)).toBe(false);
  });
});

describe('isTinyFlatLabel', () => {
  it('matches tiny flat items', () => {
    expect(isTinyFlatLabel('switch')).toBe(true);
    expect(isTinyFlatLabel('outlet')).toBe(true);
  });

  it('returns false for others', () => {
    expect(isTinyFlatLabel('sofa')).toBe(false);
    expect(isTinyFlatLabel(null)).toBe(false);
  });
});

describe('categorize', () => {
  it('returns flat for flat items', () => {
    expect(categorize('painting')).toBe('flat');
    expect(categorize('TV')).toBe('flat');
    expect(categorize('mirror')).toBe('flat');
  });

  it('returns light for light fixtures', () => {
    expect(categorize('lamp')).toBe('light');
    expect(categorize('chandelier')).toBe('light');
  });

  it('returns small for small items', () => {
    expect(categorize('cup')).toBe('small');
    expect(categorize('book')).toBe('small');
    expect(categorize('remote')).toBe('small');
  });

  it('returns furniture for everything else', () => {
    expect(categorize('sofa')).toBe('furniture');
    expect(categorize('table')).toBe('furniture');
    expect(categorize('chair')).toBe('furniture');
  });

  it('returns furniture for null / empty', () => {
    expect(categorize(null)).toBe('furniture');
    expect(categorize(undefined)).toBe('furniture');
    expect(categorize('')).toBe('furniture');
  });

  it('flat takes priority over surface words in the label', () => {
    // "wall art" — FLAT_LABEL_RE matches "art"
    expect(categorize('wall art')).toBe('flat');
  });
});
