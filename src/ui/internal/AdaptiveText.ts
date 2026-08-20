import {
  Container,
  type ContainerProperties,
  Text,
  type TextProperties,
} from '@pmndrs/uikit';
import type * as THREE from 'three';

import {canRenderEmojiText, EmojiText} from './EmojiText';
import {UnicodeText, type UnicodeTextProperties} from './UnicodeText';

export interface AdaptiveTextProperties extends Record<string, unknown> {
  text: string;
  color?: THREE.ColorRepresentation;
  fontSize?: number;
  fontWeight?: number | 'normal' | 'medium' | 'bold';
  lineHeight?: number | `${number}px` | `${number}%`;
  textAlign?: 'left' | 'center' | 'right';
  verticalAlign?: 'top' | 'middle' | 'bottom';
  whiteSpace?: 'normal' | 'nowrap' | 'pre-line';
}

/** Stable layout node that selects native or canvas glyph rendering internally. */
export class AdaptiveText extends Container {
  private nativeText?: Text;
  private emojiText?: EmojiText;
  private unicodeText?: UnicodeText;
  private activeText?: Text | EmojiText | UnicodeText;

  constructor(properties: AdaptiveTextProperties) {
    super(containerProperties(properties));
    this.name = 'AdaptiveText';
    this.updateTextProperties(properties);
  }

  updateTextProperties(properties: AdaptiveTextProperties): void {
    this.resetProperties(containerProperties(properties));
    const next = canRenderEmojiText(properties.text)
      ? this.updateEmojiText(properties)
      : requiresUnicodeTextRenderer(properties.text)
        ? this.updateUnicodeText(properties)
        : this.updateNativeText(properties);
    if (next === this.activeText) return;
    this.activeText?.removeFromParent();
    this.add(next);
    this.activeText = next;
  }

  override dispose(): void {
    this.nativeText?.removeFromParent();
    this.emojiText?.removeFromParent();
    this.unicodeText?.removeFromParent();
    this.nativeText?.dispose();
    this.emojiText?.dispose();
    this.unicodeText?.dispose();
    this.nativeText = undefined;
    this.emojiText = undefined;
    this.unicodeText = undefined;
    this.activeText = undefined;
    super.dispose();
  }

  private updateNativeText(properties: AdaptiveTextProperties): Text {
    const textProperties = nativeTextProperties(properties);
    if (!this.nativeText) this.nativeText = new Text(textProperties);
    else this.nativeText.resetProperties(textProperties);
    return this.nativeText;
  }

  private updateEmojiText(properties: AdaptiveTextProperties): EmojiText {
    if (!this.emojiText) this.emojiText = new EmojiText(properties);
    else this.emojiText.updateTextProperties(properties);
    return this.emojiText;
  }

  private updateUnicodeText(properties: AdaptiveTextProperties): UnicodeText {
    const textProperties = unicodeTextProperties(properties);
    if (!this.unicodeText) this.unicodeText = new UnicodeText(textProperties);
    else this.unicodeText.setTextProperties(textProperties);
    return this.unicodeText;
  }
}

export function requiresUnicodeTextRenderer(value: string): boolean {
  return /[^\u0020-\u007e\n\r\t]/u.test(value);
}

function containerProperties(
  properties: AdaptiveTextProperties
): ContainerProperties {
  const {
    text: _text,
    color: _color,
    fontSize: _fontSize,
    fontWeight: _fontWeight,
    lineHeight: _lineHeight,
    textAlign: _textAlign,
    verticalAlign = 'middle',
    whiteSpace: _whiteSpace,
    textOverflow: _textOverflow,
    ...layoutProperties
  } = properties;
  return {
    ...layoutProperties,
    flexDirection: 'column',
    alignItems: 'stretch',
    justifyContent:
      verticalAlign === 'top'
        ? 'flex-start'
        : verticalAlign === 'bottom'
          ? 'flex-end'
          : 'center',
  } as ContainerProperties;
}

function nativeTextProperties(
  properties: AdaptiveTextProperties
): TextProperties {
  const shared = glyphProperties(properties);
  return {
    ...shared,
    whiteSpace:
      properties.whiteSpace === 'nowrap' ? 'normal' : properties.whiteSpace,
    wordBreak: properties.whiteSpace === 'nowrap' ? 'keep-all' : 'break-word',
  } as TextProperties;
}

function unicodeTextProperties(
  properties: AdaptiveTextProperties
): UnicodeTextProperties {
  return {
    ...glyphProperties(properties),
    whiteSpace: properties.whiteSpace,
  };
}

function glyphProperties(properties: AdaptiveTextProperties) {
  return {
    text: properties.text,
    color: properties.color,
    fontSize: properties.fontSize,
    fontWeight: properties.fontWeight,
    lineHeight: properties.lineHeight,
    textAlign: properties.textAlign,
    flexShrink: 0,
    pointerEvents: 'none' as const,
  };
}
