import {Container} from '@pmndrs/uikit';
import * as THREE from 'three';

import {UIScrollView} from '../components/UIScrollView';
import {UITextInput} from '../components/UITextInput';
import {isUIElement} from '../UIElement';
import type {UITheme} from '../UITheme';
import type {
  EditableText,
  EditableTextFailure,
  EditableTextNavigationKey,
  EditableTextState,
} from './EditableText';
import {scrollbarHit} from './ScrollViewPresentation';
import {TextInputEditor} from './TextInputEditor';
import {
  DEFAULT_SCROLLBAR_WIDTH,
  DEFAULT_TEXT_LINE_HEIGHT,
} from './UIContentDefaults';

const CARET_BLINK_INTERVAL_SECONDS = 0.5;
const MEDIUM_FONT_WEIGHT = 500;
const TEXT_DEPTH_OFFSET = -1;

/** The native editor stays light; glyph rendering loads only for editable fields. */
export class TextFieldPresentation {
  private readonly row = new Container({
    width: '100%',
    flexGrow: 1,
    flexShrink: 1,
    flexBasis: 0,
    minHeight: 0,
    flexDirection: 'row',
    alignItems: 'stretch',
  });
  private readonly viewport = new Container({
    flexGrow: 1,
    flexBasis: 0,
    minWidth: 0,
    height: '100%',
    overflow: 'hidden',
  });
  private readonly scrollbar = new Container({
    width: DEFAULT_SCROLLBAR_WIDTH,
    height: '100%',
    flexShrink: 0,
    overflow: 'scroll',
    scrollbarWidth: DEFAULT_SCROLLBAR_WIDTH,
    pointerEvents: 'none',
  });
  private readonly spacer = new Container({
    width: DEFAULT_SCROLLBAR_WIDTH,
    height: 0,
    flexShrink: 0,
  });
  private readonly editor: TextInputEditor;
  private editable?: EditableText;
  private error?: Error;
  private theme?: UITheme;
  private available = true;
  private active = true;
  private disposed = false;
  private elapsed = 0;
  private selectionKey = '';
  private contentHeight = -1;

  constructor(
    private readonly field: UITextInput,
    private readonly shell: Container,
    private readonly changed: () => void
  ) {
    shell.add(this.row);
    this.row.add(this.viewport, this.scrollbar);
    this.scrollbar.add(this.spacer);
    this.scrollbar.setProperties({display: field.multiline ? 'flex' : 'none'});
    this.editor = new TextInputEditor(field, {
      caretAtPoint: (point) => this.editable?.caretAtPoint(point),
      isReady: () => this.editable?.isReady === true && this.hasLayout(),
      getError: () => this.error,
      reveal: () => this.revealField(),
      handleKeyDown: (event) => this.handleKeyDown(event),
      scroll: field.multiline
        ? {
            getOffset: () => this.editable?.offsetY ?? 0,
            getViewportHeight: () =>
              this.editable?.scroll.getViewportHeight() ?? 0,
            projectPoint: (point) => this.projectPoint(point),
            scrollBy: (delta) => this.editable?.scrollBy(delta) ?? false,
            scrollbarHit: (point) =>
              field.multiline ? scrollbarHit(this.scrollbar, point) : undefined,
          }
        : undefined,
    });
    void import('./EditableText')
      .then(({EditableText: Presentation}) => {
        if (this.disposed) return;
        this.editable = new Presentation(this.viewport, {
          onError: (failure) => this.reportFailure(failure),
          onLayout: () => {
            if (this.disposed) return;
            this.error = undefined;
            this.editor.sync(this.available);
            this.changed();
          },
        });
        this.update();
        this.changed();
      })
      .catch((cause: unknown) => {
        if (this.disposed) return;
        this.reportFailure({
          kind: 'layout-failed',
          message:
            'Editable text could not be initialized. Deploy the complete XR Blocks build directory.',
          cause,
        });
      });
  }

  commit(theme: UITheme): void {
    this.theme = theme;
    this.scrollbar.setProperties({scrollbarColor: theme.colors.outline});
    this.update();
  }

  update(deltaSeconds = 0): void {
    if (this.disposed) return;
    this.available = this.active && this.publiclyVisible();
    this.editor.sync(this.available);
    const editable = this.editable;
    if (!editable || !this.theme || !this.hasLayout()) return;
    const selection = this.field.selection;
    const key = `${this.field.focused}|${selection?.start}|${selection?.end}|${this.field.value.length}`;
    if (key !== this.selectionKey) {
      this.selectionKey = key;
      this.elapsed = 0;
    } else {
      this.elapsed += Math.max(0, deltaSeconds);
    }
    const properties = this.shell.properties.peek();
    const fontSize =
      typeof properties.fontSize === 'number'
        ? properties.fontSize
        : Number.parseFloat(properties.fontSize);
    const size = this.viewport.size.peek()!;
    const lineHeight = lineHeightRatio(properties.lineHeight, fontSize);
    this.editor.element.style.width = `${size[0]}px`;
    this.editor.element.style.height = `${size[1]}px`;
    this.editor.element.style.fontSize = `${fontSize}px`;
    this.editor.element.style.lineHeight = String(lineHeight);
    const fontWeight = properties.fontWeight;
    const color = properties.color;
    const state: EditableTextState = {
      text: this.field.value,
      placeholder: this.field.placeholder,
      multiline: this.field.multiline,
      focused: this.field.focused,
      caretVisible:
        Math.floor(this.elapsed / CARET_BLINK_INTERVAL_SECONDS) % 2 === 0,
      selectionStart: selection?.start,
      selectionEnd: selection?.end,
      selectionDirection: selection?.direction,
      fontSize,
      lineHeight,
      fontWeight:
        fontWeight === 'medium'
          ? MEDIUM_FONT_WEIGHT
          : typeof fontWeight === 'number' || fontWeight === 'bold'
            ? fontWeight
            : 'normal',
      textAlign:
        properties.textAlign === 'center' || properties.textAlign === 'right'
          ? properties.textAlign
          : 'left',
      color:
        typeof color === 'string' ||
        typeof color === 'number' ||
        color instanceof THREE.Color
          ? color
          : this.field.disabled
            ? this.theme.colors.disabledText
            : this.theme.colors.text,
      placeholderColor: this.theme.colors.secondaryText,
      caretColor: this.theme.colors.primary,
      selectionColor: this.theme.colors.primary,
      opacity:
        typeof properties.opacity === 'string'
          ? Number.parseFloat(properties.opacity) / 100
          : properties.opacity,
      depthTest: properties.depthTest,
      depthOffset: TEXT_DEPTH_OFFSET,
      renderOrder: this.shell.renderOrder,
    };
    editable.afterLayout();
    editable.update(state);
    this.editor.sync(this.available);
    if (this.contentHeight !== editable.scrollHeight) {
      this.contentHeight = editable.scrollHeight;
      this.spacer.setProperties({height: this.contentHeight});
    }
    this.scrollbar.scrollVelocity.set(0, 0);
    if (this.scrollbar.scrollPosition.peek()[1] !== editable.offsetY) {
      this.scrollbar.scrollPosition.value = [0, editable.offsetY];
    }
  }

  setActive(active: boolean): void {
    this.active = active;
    if (!active) {
      this.available = false;
      this.editor.sync(false);
    }
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.editor.dispose();
    this.editable?.dispose();
    for (const node of [this.spacer, this.scrollbar, this.viewport, this.row]) {
      node.removeFromParent();
      node.dispose();
    }
  }

  private hasLayout(): boolean {
    const size = this.viewport.size.peek();
    return Boolean(size && size[0] > 0 && size[1] > 0);
  }

  private projectPoint(point: THREE.Vector3): THREE.Vector2 | undefined {
    const size = this.viewport.size.peek();
    if (!size || !this.hasLayout()) return undefined;
    const local = this.viewport.worldToLocal(point.clone());
    return new THREE.Vector2(
      (local.x + 0.5) * size[0],
      (0.5 - local.y) * size[1]
    );
  }

  private publiclyVisible(): boolean {
    let object: THREE.Object3D | null = this.field;
    while (object) {
      if (
        !object.visible ||
        (isUIElement(object) && object.style.display === 'none')
      )
        return false;
      object = object.parent;
    }
    return this.field.parent !== null;
  }

  private revealField(): void {
    let parent = this.field.parent;
    while (parent) {
      if (parent instanceof UIScrollView && parent.ready)
        parent.reveal(this.field);
      parent = parent.parent;
    }
  }

  private handleKeyDown(event: KeyboardEvent): boolean {
    if (
      event.ctrlKey ||
      event.metaKey ||
      event.altKey ||
      !isNavigationKey(event.key)
    )
      return false;
    this.update();
    const next = this.editable?.navigate(event.key, {extend: event.shiftKey});
    if (!next) return false;
    event.preventDefault();
    this.field.setSelectionRange(next.start, next.end, next.direction);
    this.update();
    return true;
  }

  private reportFailure(failure: EditableTextFailure): void {
    this.error = new Error(failure.message, {cause: failure.cause});
    console.error('XR Blocks editable text:', this.error);
    this.changed();
  }
}

function isNavigationKey(key: string): key is EditableTextNavigationKey {
  return (
    key === 'ArrowUp' || key === 'ArrowDown' || key === 'Home' || key === 'End'
  );
}

function lineHeightRatio(value: number | string, fontSize: number): number {
  if (typeof value === 'number') return value;
  if (value.endsWith('%')) return Number.parseFloat(value) / 100;
  if (value.endsWith('px')) return Number.parseFloat(value) / fontSize;
  return DEFAULT_TEXT_LINE_HEIGHT;
}
