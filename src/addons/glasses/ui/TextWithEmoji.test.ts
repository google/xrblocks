import {Container, Image, Text} from '@pmndrs/uikit';
import {describe, expect, it} from 'vitest';

import {TextWithEmoji} from './TextWithEmoji';

describe('TextWithEmoji', () => {
  it('renders words and emoji as separate UIKit elements', () => {
    const parent = new Container();
    const text = new TextWithEmoji({text: 'Hello 🚀 world', fontSize: 16});
    parent.add(text);

    expect(text.children).toHaveLength(3);
    expect(text.children[0]).toBeInstanceOf(Text);
    expect(text.children[1]).toBeInstanceOf(Image);
    expect(text.children[2]).toBeInstanceOf(Text);
    expect((text.children[0] as Text).properties.value.marginRight).toBe(
      16 * 0.26
    );
    expect((text.children[1] as Image).properties.value.marginRight).toBe(
      16 * 0.26
    );
  });

  it('preserves explicit line breaks', () => {
    const parent = new Container();
    const text = new TextWithEmoji({text: 'First\n\nSecond', fontSize: 16});
    parent.add(text);

    expect(text.children).toHaveLength(4);
    expect(text.children[1]).toBeInstanceOf(Container);
    expect((text.children[1] as Container).properties.value.height).toBe(0);
    expect((text.children[2] as Container).properties.value.height).toBe(16);
  });
});
