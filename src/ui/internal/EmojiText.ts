import {Container, type ContainerProperties, Image, Text} from '@pmndrs/uikit';

import type {AdaptiveTextProperties} from './AdaptiveText';

const EMOJI_SEQUENCE_SOURCE = String.raw`(?:\p{Regional_Indicator}{2}|[#*0-9]\uFE0F?\u20E3|(?:\p{Emoji_Presentation}|\p{Emoji}\uFE0F)(?:\p{Emoji_Modifier})?(?:\u200D(?:\p{Emoji_Presentation}|\p{Emoji}\uFE0F)(?:\p{Emoji_Modifier})?)*)`;
const EMOJI_SEQUENCE_REGEX = new RegExp(EMOJI_SEQUENCE_SOURCE, 'u');
const EMOJI_SEQUENCE_GLOBAL_REGEX = new RegExp(EMOJI_SEQUENCE_SOURCE, 'gu');
const TEXT_SEGMENT_REGEX = new RegExp(
  `${EMOJI_SEQUENCE_SOURCE}|\\n|[ \\t\\r]+|[a-zA-Z0-9]+|[^a-zA-Z0-9\\s]`,
  'gu'
);

type Segment = {
  type: 'space' | 'newline' | 'emoji' | 'word';
  text: string;
  blankLine?: boolean;
  trailingSpaceWidth?: number;
};

/** Renders ASCII text as sharp UIKit glyphs and emoji as inline images. */
export class EmojiText extends Container {
  constructor(properties: AdaptiveTextProperties) {
    super(emojiContainerProperties(properties));
    this.name = 'EmojiText';
    this.updateTextProperties(properties);
  }

  updateTextProperties(properties: AdaptiveTextProperties): void {
    this.resetProperties(emojiContainerProperties(properties));
    for (const child of [...this.children]) {
      if (
        child instanceof Container ||
        child instanceof Image ||
        child instanceof Text
      ) {
        child.dispose();
      }
    }

    const fontSize = properties.fontSize ?? 16;
    const emojiSize = fontSize * 1.05;
    for (const segment of parseSegments(properties.text, fontSize)) {
      if (segment.type === 'space') {
        this.add(
          new Container({
            width: fontSize * 0.26 * segment.text.length,
            height: fontSize,
          })
        );
      } else if (segment.type === 'newline') {
        this.add(
          new Container({
            width: '100%',
            height: segment.blankLine ? fontSize : 0,
          })
        );
      } else if (segment.type === 'emoji') {
        this.add(
          new Image({
            src: emojiUrl(segment.text),
            width: emojiSize,
            height: emojiSize,
            keepAspectRatio: true,
            transformTranslateY: -emojiSize * 0.08,
            marginRight: segment.trailingSpaceWidth,
            pointerEvents: 'none',
          })
        );
      } else {
        this.add(
          new Text({
            text: segment.text,
            fontSize,
            lineHeight: properties.lineHeight,
            color: properties.color,
            fontWeight: properties.fontWeight,
            whiteSpace: 'pre',
            marginRight: segment.trailingSpaceWidth,
            pointerEvents: 'none',
          })
        );
      }
    }
  }
}

export function canRenderEmojiText(value: string): boolean {
  if (!EMOJI_SEQUENCE_REGEX.test(value)) return false;
  const textWithoutEmoji = value.replace(EMOJI_SEQUENCE_GLOBAL_REGEX, '');
  return !/[^\u0020-\u007e\n\r\t]/u.test(textWithoutEmoji);
}

function emojiContainerProperties(
  properties: AdaptiveTextProperties
): ContainerProperties {
  return {
    flexDirection: 'row',
    flexWrap: properties.whiteSpace === 'nowrap' ? 'nowrap' : 'wrap',
    alignItems: 'center',
    justifyContent:
      properties.textAlign === 'center'
        ? 'center'
        : properties.textAlign === 'right'
          ? 'flex-end'
          : 'flex-start',
    color: properties.color,
    fontSize: properties.fontSize,
    fontWeight: properties.fontWeight,
    lineHeight: properties.lineHeight,
    flexShrink: 0,
    pointerEvents: 'none',
  } as ContainerProperties;
}

function parseSegments(text: string, fontSize: number): Segment[] {
  const rawSegments =
    text.replace(/\r\n/gu, '\n').match(TEXT_SEGMENT_REGEX) ?? [];
  const segments: Segment[] = [];

  for (let index = 0; index < rawSegments.length; index++) {
    const value = rawSegments[index];
    if (value === '\n') {
      segments.push({
        type: 'newline',
        text: value,
        blankLine: index === 0 || rawSegments[index - 1] === '\n',
      });
    } else if (/^[ \t\r]+$/u.test(value)) {
      const previous = segments[segments.length - 1];
      if (previous?.type === 'word' || previous?.type === 'emoji') {
        previous.trailingSpaceWidth = fontSize * 0.26 * value.length;
      } else {
        segments.push({type: 'space', text: value});
      }
    } else if (EMOJI_SEQUENCE_REGEX.test(value)) {
      segments.push({type: 'emoji', text: value});
    } else {
      segments.push({type: 'word', text: value.replace(/\uFE0F/gu, '')});
    }
  }

  return segments;
}

function emojiUrl(emoji: string): string {
  let hex = Array.from(emoji)
    .map((character) => character.codePointAt(0)!.toString(16))
    .join('-');
  if (!hex.includes('200d') && hex.endsWith('-fe0f')) {
    hex = hex.slice(0, -5);
  }
  return `https://cdnjs.cloudflare.com/ajax/libs/twemoji/14.0.2/72x72/${hex}.png`;
}
