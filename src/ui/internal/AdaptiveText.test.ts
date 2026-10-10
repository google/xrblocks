import {describe, expect, it, vi} from 'vitest';

import {AdaptiveText} from './AdaptiveText';

const {properties, unicodeProperties} = vi.hoisted(() => ({
  properties: vi.fn(),
  unicodeProperties: vi.fn(),
}));

vi.mock('@pmndrs/uikit', async () => {
  const THREE = await import('three');
  class Element extends THREE.Group {
    constructor(value: object) {
      super();
      properties(value);
    }
    resetProperties(value: object) {
      properties(value);
    }
    dispose() {
      this.removeFromParent();
    }
  }
  return {Container: Element, Image: Element, Text: Element};
});

vi.mock('./UnicodeText', async () => {
  const THREE = await import('three');
  class UnicodeText extends THREE.Group {
    constructor(value: object) {
      super();
      unicodeProperties(value);
    }
    setTextProperties(value: object) {
      unicodeProperties(value);
    }
    dispose() {
      this.removeFromParent();
    }
  }
  return {UnicodeText};
});

describe('AdaptiveText depth flags', () => {
  it('forwards depth flags to native text renderers', () => {
    properties.mockClear();
    const label = new AdaptiveText({
      text: 'Hello',
      depthTest: true,
      depthWrite: true,
    });
    const native = properties.mock.calls
      .map(([value]) => value)
      .filter((value) => 'text' in value);
    expect(native.length).toBeGreaterThan(0);
    expect(
      native.every(
        (value) => value.depthTest === true && value.depthWrite === true
      )
    ).toBe(true);
    label.dispose();
  });

  it('forwards depth flags to unicode text renderers', () => {
    unicodeProperties.mockClear();
    const label = new AdaptiveText({
      text: '\u4f60\u597d',
      depthTest: true,
      depthWrite: true,
    });
    expect(unicodeProperties).toHaveBeenCalled();
    const values = unicodeProperties.mock.calls.map(([value]) => value);
    expect(
      values.every(
        (value) => value.depthTest === true && value.depthWrite === true
      )
    ).toBe(true);
    label.dispose();
  });
});
