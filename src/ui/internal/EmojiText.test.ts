import {describe, expect, it, vi} from 'vitest';
import {EmojiText} from './EmojiText';

const {properties} = vi.hoisted(() => ({properties: vi.fn()}));
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

describe('emoji microphone labels', () => {
  it('uses UIKit no-wrap rather than CSS nowrap for the flex container', () => {
    properties.mockClear();
    const label = new EmojiText({
      text: 'Alice \u{1f399}\ufe0f',
      whiteSpace: 'nowrap',
    });
    const layouts = properties.mock.calls
      .map(([value]) => value)
      .filter((value) => 'flexWrap' in value);
    expect(layouts.length).toBeGreaterThan(0);
    expect(layouts.every((value) => value.flexWrap === 'no-wrap')).toBe(true);
    label.dispose();
  });
});
