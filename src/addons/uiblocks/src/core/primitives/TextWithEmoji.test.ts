import {describe, it, expect} from 'vitest';
import {TextWithEmoji} from './TextWithEmoji';
import {Text, Image, Container} from '@pmndrs/uikit';

describe('TextWithEmoji Primitives', () => {
  it('should parse plain text and spaces correctly', () => {
    const parent = new Container();
    const textWithEmoji = new TextWithEmoji({
      text: 'Hello World',
      fontSize: 16,
    });
    parent.add(textWithEmoji);

    // Should have: Text('Hello'), Text('World')
    expect(textWithEmoji.children).toHaveLength(2);
    expect(textWithEmoji.children[0]).toBeInstanceOf(Text);
    expect(textWithEmoji.children[1]).toBeInstanceOf(Text);

    const text1 = textWithEmoji.children[0] as Text;
    expect(text1.properties.value.text).toBe('Hello');
    expect(text1.properties.value.marginRight).toBe(16 * 0.26);
  });

  it('should parse and render emojis correctly', () => {
    const parent = new Container();
    const textWithEmoji = new TextWithEmoji({
      text: 'Hello 🚀 World',
      fontSize: 16,
    });
    parent.add(textWithEmoji);

    // Should have: Text('Hello'), Image(emoji), Text('World')
    expect(textWithEmoji.children).toHaveLength(3);
    expect(textWithEmoji.children[0]).toBeInstanceOf(Text);
    expect(textWithEmoji.children[1]).toBeInstanceOf(Image);
    expect(textWithEmoji.children[2]).toBeInstanceOf(Text);

    const text1 = textWithEmoji.children[0] as Text;
    const emoji = textWithEmoji.children[1] as Image;

    expect(text1.properties.value.text).toBe('Hello');
    expect(text1.properties.value.marginRight).toBe(16 * 0.26); // 1 space = fontSize * 0.26
    expect(emoji.properties.value.marginRight).toBe(16 * 0.26); // 1 space = fontSize * 0.26
  });

  it('should handle single newline correctly', () => {
    const parent = new Container();
    const textWithEmoji = new TextWithEmoji({
      text: 'Hello\nWorld',
      fontSize: 16,
    });
    parent.add(textWithEmoji);

    expect(textWithEmoji.children).toHaveLength(3);
    expect(textWithEmoji.children[0]).toBeInstanceOf(Text);
    expect(textWithEmoji.children[1]).toBeInstanceOf(Container);
    expect(textWithEmoji.children[2]).toBeInstanceOf(Text);

    const newlineContainer = textWithEmoji.children[1] as Container;
    expect(newlineContainer.properties.value.width).toBe('100%');
    expect(newlineContainer.properties.value.height).toBe(0);
  });

  it('should handle double newlines correctly', () => {
    const parent = new Container();
    const textWithEmoji = new TextWithEmoji({
      text: 'Hello\n\nWorld',
      fontSize: 16,
    });
    parent.add(textWithEmoji);

    expect(textWithEmoji.children).toHaveLength(4);
    expect(textWithEmoji.children[0]).toBeInstanceOf(Text);
    expect(textWithEmoji.children[1]).toBeInstanceOf(Container);
    expect(textWithEmoji.children[2]).toBeInstanceOf(Container);
    expect(textWithEmoji.children[3]).toBeInstanceOf(Text);

    const newline1 = textWithEmoji.children[1] as Container;
    const newline2 = textWithEmoji.children[2] as Container;

    expect(newline1.properties.value.width).toBe('100%');
    expect(newline1.properties.value.height).toBe(0);

    expect(newline2.properties.value.width).toBe('100%');
    expect(newline2.properties.value.height).toBe(16); // matches fontSize 16
  });

  it('should handle leading newline correctly', () => {
    const parent = new Container();
    const textWithEmoji = new TextWithEmoji({
      text: '\nHello',
      fontSize: 16,
    });
    parent.add(textWithEmoji);

    expect(textWithEmoji.children).toHaveLength(2);
    expect(textWithEmoji.children[0]).toBeInstanceOf(Container);
    expect(textWithEmoji.children[1]).toBeInstanceOf(Text);

    const newline = textWithEmoji.children[0] as Container;
    expect(newline.properties.value.width).toBe('100%');
    expect(newline.properties.value.height).toBe(16); // matches fontSize 16
  });

  it('should preserve explicit spaces after a newline', () => {
    const parent = new Container();
    const textWithEmoji = new TextWithEmoji({
      text: 'Hello\n World',
      fontSize: 16,
    });
    parent.add(textWithEmoji);

    // Should have: Text('Hello'), Container(newline), Container(space), Text('World')
    expect(textWithEmoji.children).toHaveLength(4);
    expect(textWithEmoji.children[0]).toBeInstanceOf(Text);
    expect(textWithEmoji.children[1]).toBeInstanceOf(Container);
    expect(textWithEmoji.children[2]).toBeInstanceOf(Container);
    expect(textWithEmoji.children[3]).toBeInstanceOf(Text);

    const space = textWithEmoji.children[2] as Container;
    expect(space.properties.value.width).toBe(16 * 0.26);
  });
});
