import {effect} from '@preact/signals-core';
import {Image, type ImageProperties} from '@pmndrs/uikit';
import * as THREE from 'three';

type TextAlign = 'left' | 'center' | 'right';
type WhiteSpace = 'normal' | 'nowrap';
type TextOverflow = 'clip' | 'ellipsis';

export interface UnicodeTextProperties extends Record<string, unknown> {
  text: string;
  color?: THREE.ColorRepresentation;
  fontSize?: number;
  fontWeight?: number | 'normal' | 'medium' | 'bold';
  lineHeight?: number | `${number}px` | `${number}%`;
  textAlign?: TextAlign;
  whiteSpace?: WhiteSpace;
  textOverflow?: TextOverflow;
}

interface TextMetricsStyle {
  color: string;
  font: string;
  lineHeight: number;
  textAlign: TextAlign;
  whiteSpace: WhiteSpace;
  textOverflow: TextOverflow;
}

interface TextLayout {
  lines: string[];
  width: number;
  height: number;
}

const MAX_CANVAS_DIMENSION = 4096;
const MEASURE_MODE_UNDEFINED = 0;
const MEASURE_MODE_EXACTLY = 1;
const SYSTEM_FONT =
  'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
const graphemeSegmenter = new Intl.Segmenter(undefined, {
  granularity: 'grapheme',
});

/** Canvas-backed text used when UIkit's fixed glyph atlas cannot render text. */
export class UnicodeText extends Image {
  private readonly canvas: HTMLCanvasElement;
  private readonly context: CanvasRenderingContext2D;
  private readonly canvasTexture: THREE.CanvasTexture;
  private textProperties: UnicodeTextProperties;
  private readonly stopSizeEffect: () => void;

  constructor(properties: UnicodeTextProperties) {
    const canvas = document.createElement('canvas');
    canvas.width = 1;
    canvas.height = 1;
    const context = canvas.getContext('2d');
    if (!context) {
      throw new Error('Canvas 2D is required to render Unicode UI text.');
    }
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.minFilter = THREE.LinearFilter;
    texture.magFilter = THREE.LinearFilter;
    super(imageProperties(properties, texture));
    this.canvas = canvas;
    this.context = context;
    this.canvasTexture = texture;
    this.textProperties = properties;
    this.configureLayout();
    this.stopSizeEffect = effect(() => {
      const size = this.size.value;
      if (size) this.draw(size[0], size[1]);
    });
  }

  setTextProperties(properties: UnicodeTextProperties): void {
    this.textProperties = properties;
    this.resetProperties(imageProperties(properties, this.canvasTexture));
    this.configureLayout();
    const size = this.size.peek();
    if (size) this.draw(size[0], size[1]);
  }

  override dispose(): void {
    this.stopSizeEffect();
    this.canvasTexture.dispose();
    super.dispose();
  }

  private configureLayout(): void {
    const style = metricsStyle(this.textProperties);
    applyFont(this.context, style);
    const measure = (width: number, widthMode: number) => {
      const availableWidth =
        widthMode === MEASURE_MODE_UNDEFINED ? Number.POSITIVE_INFINITY : width;
      const layout = layoutText(
        this.context,
        this.textProperties.text,
        style,
        availableWidth
      );
      return {
        width: widthMode === MEASURE_MODE_EXACTLY ? width : layout.width,
        height: layout.height,
      };
    };
    const minimum = layoutText(
      this.context,
      widestCharacter(this.context, this.textProperties.text),
      {...style, whiteSpace: 'nowrap'},
      Number.POSITIVE_INFINITY
    );
    this.node.setCustomLayouting({
      minWidth: minimum.width,
      minHeight: style.lineHeight,
      measure,
    });
  }

  private draw(width: number, height: number): void {
    if (!(width > 0) || !(height > 0)) return;
    const scale = Math.max(
      Number.EPSILON,
      Math.min(
        window.devicePixelRatio || 1,
        MAX_CANVAS_DIMENSION / width,
        MAX_CANVAS_DIMENSION / height
      )
    );
    const pixelWidth = Math.max(1, Math.ceil(width * scale));
    const pixelHeight = Math.max(1, Math.ceil(height * scale));
    if (
      this.canvas.width !== pixelWidth ||
      this.canvas.height !== pixelHeight
    ) {
      this.canvas.width = pixelWidth;
      this.canvas.height = pixelHeight;
    }
    this.context.setTransform(1, 0, 0, 1, 0, 0);
    this.context.clearRect(0, 0, pixelWidth, pixelHeight);
    this.context.setTransform(scale, 0, 0, scale, 0, 0);
    const style = metricsStyle(this.textProperties);
    applyFont(this.context, style);
    this.context.fillStyle = style.color;
    this.context.textAlign = style.textAlign;
    this.context.textBaseline = 'top';
    const layout = layoutText(
      this.context,
      this.textProperties.text,
      style,
      width
    );
    const lines = fitLines(
      this.context,
      layout.lines,
      width,
      Math.max(1, Math.floor(height / style.lineHeight)),
      style.textOverflow
    );
    const x =
      style.textAlign === 'center'
        ? width / 2
        : style.textAlign === 'right'
          ? width
          : 0;
    for (let index = 0; index < lines.length; index++) {
      this.context.fillText(lines[index], x, index * style.lineHeight);
    }
    this.canvasTexture.needsUpdate = true;
    this.root.peek().requestRender?.();
  }
}

function imageProperties(
  properties: UnicodeTextProperties,
  texture: THREE.CanvasTexture
): ImageProperties {
  const {
    text: _text,
    color: _color,
    fontSize: _fontSize,
    fontWeight: _fontWeight,
    lineHeight: _lineHeight,
    textAlign: _textAlign,
    whiteSpace: _whiteSpace,
    textOverflow: _textOverflow,
    ...layoutProperties
  } = properties;
  return {
    ...layoutProperties,
    src: texture,
    keepAspectRatio: false,
    objectFit: 'fill',
  } as ImageProperties;
}

function metricsStyle(properties: UnicodeTextProperties): TextMetricsStyle {
  const fontSize = properties.fontSize ?? 16;
  return {
    color: cssColor(properties.color ?? '#ffffff'),
    font: `${fontWeight(properties.fontWeight)} ${fontSize}px ${SYSTEM_FONT}`,
    lineHeight: resolveLineHeight(properties.lineHeight, fontSize),
    textAlign: properties.textAlign ?? 'left',
    whiteSpace: properties.whiteSpace ?? 'normal',
    textOverflow: properties.textOverflow ?? 'clip',
  };
}

function applyFont(
  context: CanvasRenderingContext2D,
  style: TextMetricsStyle
): void {
  context.font = style.font;
}

function fontWeight(value: UnicodeTextProperties['fontWeight']): number {
  if (typeof value === 'number') return value;
  if (value === 'bold') return 700;
  if (value === 'medium') return 500;
  return 400;
}

function resolveLineHeight(
  value: UnicodeTextProperties['lineHeight'],
  fontSize: number
): number {
  if (typeof value === 'number') return value * fontSize;
  if (typeof value === 'string' && value.endsWith('px')) {
    return Number.parseFloat(value);
  }
  if (typeof value === 'string' && value.endsWith('%')) {
    return (Number.parseFloat(value) / 100) * fontSize;
  }
  return fontSize * 1.2;
}

function cssColor(color: THREE.ColorRepresentation): string {
  if (typeof color === 'string') return color;
  return `#${new THREE.Color(color).getHexString()}`;
}

function layoutText(
  context: CanvasRenderingContext2D,
  text: string,
  style: TextMetricsStyle,
  availableWidth: number
): TextLayout {
  const lines =
    style.whiteSpace === 'nowrap'
      ? [text.replace(/\s+/gu, ' ').trim()]
      : text
          .split(/\r?\n/u)
          .flatMap((line) => wrapLine(context, line, availableWidth));
  const width = lines.reduce(
    (maximum, line) => Math.max(maximum, context.measureText(line).width),
    0
  );
  return {
    lines: lines.length > 0 ? lines : [''],
    width,
    height: Math.max(1, lines.length) * style.lineHeight,
  };
}

function wrapLine(
  context: CanvasRenderingContext2D,
  text: string,
  availableWidth: number
): string[] {
  if (!Number.isFinite(availableWidth) || text.length === 0) return [text];
  const lines: string[] = [];
  let current = '';
  for (const token of text.split(/(\s+)/u)) {
    if (!token) continue;
    const normalized = /^\s+$/u.test(token) ? ' ' : token;
    const candidate = current
      ? `${current}${normalized}`
      : normalized.trimStart();
    if (context.measureText(candidate).width <= availableWidth) {
      current = candidate;
      continue;
    }
    if (current.trimEnd()) lines.push(current.trimEnd());
    current = '';
    if (context.measureText(normalized).width <= availableWidth) {
      current = normalized.trimStart();
      continue;
    }
    for (const character of graphemes(normalized)) {
      const next = `${current}${character}`;
      if (current && context.measureText(next).width > availableWidth) {
        lines.push(current);
        current = character;
      } else {
        current = next;
      }
    }
  }
  if (current || lines.length === 0) lines.push(current.trimEnd());
  return lines;
}

function fitLines(
  context: CanvasRenderingContext2D,
  lines: string[],
  width: number,
  maximumLines: number,
  overflow: TextOverflow
): string[] {
  if (lines.length <= maximumLines) return lines;
  const visible = lines.slice(0, maximumLines);
  if (overflow !== 'ellipsis') return visible;
  const suffix = '…';
  let finalLine = visible[visible.length - 1];
  while (
    finalLine &&
    context.measureText(`${finalLine}${suffix}`).width > width
  ) {
    finalLine = graphemes(finalLine).slice(0, -1).join('');
  }
  visible[visible.length - 1] = `${finalLine}${suffix}`;
  return visible;
}

function widestCharacter(
  context: CanvasRenderingContext2D,
  text: string
): string {
  let widest = '';
  let maximumWidth = 0;
  for (const character of graphemes(text)) {
    const width = context.measureText(character).width;
    if (!/\s/u.test(character) && width > maximumWidth) {
      widest = character;
      maximumWidth = width;
    }
  }
  return widest || ' ';
}

function graphemes(text: string): string[] {
  return Array.from(graphemeSegmenter.segment(text), ({segment}) => segment);
}
