import type * as THREE from 'three';

import type {
  SemanticControlInput,
  SemanticScrollState,
} from '../../interaction/SemanticControl';
import {
  bindTextInput,
  normalizeTextInputValue,
  type TextInputBinding,
  type TextInputHost,
  type UITextInput,
  type UITextInputKeyModifiers,
  type UITextInputSelection,
  type UITextInputSelectionDirection,
} from '../components/UITextInput';

const IME_COMPOSITION_KEY_CODE = 229;

/** Geometry supplied by the rendering backend that owns caret layout. */
export interface TextInputPresentation {
  /** Returns a UTF-16 caret offset for a world point, if it maps to text. */
  caretAtPoint(worldPoint: THREE.Vector3): number | undefined;
  isReady(): boolean;
  getError?(): Error | undefined;
  reveal?(): void;
  scroll?: SemanticScrollState;
  /** Returns whether the backend consumed a key, e.g. wrapped-line motion. */
  handleKeyDown?(event: KeyboardEvent): boolean;
}

const editors = new Set<TextInputEditor>();
let focusedEditor: TextInputEditor | undefined;

/**
 * Owns the hidden native element that performs real text editing.
 *
 * The native control stays authoritative for physical keyboards, IME, and
 * clipboard. This class only mirrors its results into the retained field and
 * exposes the narrow operations a virtual keyboard or automation needs.
 */
export class TextInputEditor {
  readonly element: HTMLInputElement | HTMLTextAreaElement;
  private readonly host: TextInputHost;
  private readonly listeners: Array<[string, EventListener]> = [];
  private available = true;
  private disposed = false;
  private composing = false;
  private nativeKeyboardSuppressed = false;
  private anchor?: number;

  constructor(
    private readonly field: UITextInput,
    private readonly presentation: TextInputPresentation
  ) {
    this.element = createEditingElement(field);
    this.host = bindTextInput(field, this.createBinding());
    document.body.appendChild(this.element);
    this.listen('input', () => this.host.notifyInput(this.element.value));
    this.listen('compositionstart', () => (this.composing = true));
    this.listen('compositionend', () => {
      this.composing = false;
      this.host.notifyInput(this.element.value);
    });
    this.listen('keydown', (event) =>
      this.handleKeyDown(event as KeyboardEvent)
    );
    this.listen('focus', () => {
      setFocusedEditor(this);
      this.host.notifyFocus();
      this.presentation.reveal?.();
    });
    this.listen('blur', () => {
      if (focusedEditor === this) setFocusedEditor(undefined);
      this.anchor = undefined;
      this.host.notifyBlur();
    });
    editors.add(this);
    this.sync(true);
  }

  /**
   * Applies retained field state to the native control.
   *
   * Pass false for hidden or unmounted fields, which also releases focus.
   * Clipping alone is not an unmounted state.
   */
  sync(available = true): void {
    if (this.disposed) return;
    this.available = available;
    const element = this.element;
    if (!available) {
      this.releaseFocus();
      element.disabled = true;
      return;
    }
    const field = this.field;
    if (field.disabled) this.releaseFocus();
    element.disabled = field.disabled;
    element.tabIndex = this.presentation.isReady() ? 0 : -1;
    element.readOnly = field.readOnly;
    this.syncKeyboardPolicy();
    element.placeholder = field.placeholder;
    element.setAttribute('aria-label', field.ariaLabel);
    if (field.maxLength === undefined) element.removeAttribute('maxlength');
    else element.maxLength = field.maxLength;
    if (element.value !== field.value) element.value = field.value;
  }

  dispose(): void {
    if (this.disposed) return;
    this.releaseFocus();
    for (const [type, listener] of this.listeners) {
      this.element.removeEventListener(type, listener);
    }
    this.listeners.length = 0;
    this.element.remove();
    this.disposed = true;
    this.available = false;
    editors.delete(this);
    if (focusedEditor === this) setFocusedEditor(undefined);
    this.host.unbind();
  }

  /** Blurs the focused field unless the pointer target preserves its focus. */
  static handlePointerTarget(target?: THREE.Object3D): void {
    const editor = focusedEditor;
    if (!editor) return;
    if (target && preservesFocus(editor.field, target)) return;
    editor.element.blur();
  }

  /**
   * Suppresses the browser's default canvas blur while a field is focused.
   *
   * Propagation is untouched, and unrelated DOM controls keep their default
   * behavior because only events targeting the canvas are prevented.
   */
  static guardCanvas(canvas: HTMLElement): () => void {
    const guard = (event: Event) => {
      if (!focusedEditor) return;
      if (event.target !== canvas) return;
      event.preventDefault();
    };
    canvas.addEventListener('pointerdown', guard);
    canvas.addEventListener('mousedown', guard);
    let removed = false;
    return () => {
      if (removed) return;
      removed = true;
      canvas.removeEventListener('pointerdown', guard);
      canvas.removeEventListener('mousedown', guard);
    };
  }

  private listen(type: string, listener: EventListener): void {
    this.element.addEventListener(type, listener);
    this.listeners.push([type, listener]);
  }

  private createBinding(): TextInputBinding {
    return {
      isReady: () => this.isReady(),
      getError: () => this.presentation.getError?.(),
      applyValue: (value) => {
        if (this.element.value === value) return;
        const selection = this.getSelection();
        this.element.value = value;
        if (selection) {
          this.setSelectionRange(
            selection.start,
            selection.end,
            selection.direction
          );
        }
      },
      applyOptions: () => this.sync(this.available),
      getSelection: () => this.getSelection(),
      setSelectionRange: (start, end, direction) =>
        this.setSelectionRange(start, end, direction),
      focus: () => this.focusElement(),
      blur: () => this.element.blur(),
      insertText: (text) => void this.replaceSelection(text),
      pressKey: (key, modifiers) => this.pressKey(key, modifiers),
      begin: (input) => this.beginPointer(input),
      update: (input) => this.updatePointer(input),
      complete: () => (this.anchor = undefined),
      cancel: () => (this.anchor = undefined),
      getScroll: () => this.presentation.scroll,
    };
  }

  private isReady(): boolean {
    return !this.disposed && this.available && this.presentation.isReady();
  }

  private canFocus(): boolean {
    return this.isReady() && !this.field.disabled;
  }

  private syncKeyboardPolicy(): void {
    const suppressed = this.field.nativeKeyboardSuppressed;
    if (suppressed === this.nativeKeyboardSuppressed) return;
    this.nativeKeyboardSuppressed = suppressed;
    if (!suppressed) {
      this.element.removeAttribute('inputmode');
      this.element.removeAttribute('virtualkeyboardpolicy');
      return;
    }
    this.element.inputMode = 'none';
    this.element.setAttribute('virtualkeyboardpolicy', 'manual');
    if (document.activeElement !== this.element) return;
    const keyboard =
      'virtualKeyboard' in navigator ? navigator.virtualKeyboard : undefined;
    if (
      keyboard &&
      typeof keyboard === 'object' &&
      'hide' in keyboard &&
      typeof keyboard.hide === 'function'
    ) {
      keyboard.hide();
    }
  }

  private releaseFocus(): void {
    if (focusedEditor === this || document.activeElement === this.element) {
      this.element.blur();
    }
  }

  private getSelection(): UITextInputSelection | undefined {
    const {selectionStart, selectionEnd, selectionDirection} = this.element;
    if (selectionStart == null || selectionEnd == null) return undefined;
    return {
      start: selectionStart,
      end: selectionEnd,
      direction: (selectionDirection ??
        'none') as UITextInputSelectionDirection,
    };
  }

  private setSelectionRange(
    start: number,
    end: number,
    direction: UITextInputSelectionDirection
  ): void {
    this.element.setSelectionRange(
      Math.max(0, start),
      Math.max(0, end),
      direction
    );
  }

  private handleKeyDown(event: KeyboardEvent): void {
    const composing =
      this.composing ||
      event.isComposing ||
      event.keyCode === IME_COMPOSITION_KEY_CODE;
    if (composing) return;
    if (this.presentation.handleKeyDown?.(event)) return;
    if (event.key === 'Escape' && !composing) {
      event.preventDefault();
      this.element.blur();
      return;
    }
    if (event.key !== 'Enter' || composing) return;
    if (!this.field.multiline) {
      event.preventDefault();
      this.host.notifySubmit();
      return;
    }
    if (event.ctrlKey || event.metaKey) {
      event.preventDefault();
      this.host.notifySubmit();
    }
  }

  private pressKey(
    key: string,
    modifiers: UITextInputKeyModifiers = {}
  ): boolean {
    if (!this.isReady() || this.field.disabled || this.composing) return false;
    switch (key) {
      case 'Tab':
        return this.navigate(modifiers.shiftKey === true);
      case 'Enter':
        if (
          !this.field.multiline ||
          modifiers.ctrlKey === true ||
          modifiers.metaKey === true
        ) {
          this.host.notifySubmit();
          return true;
        }
        return this.replaceSelection('\n');
      case 'Backspace':
        return this.deleteAtCaret('backward');
      case 'Delete':
        return this.deleteAtCaret('forward');
      case 'Escape':
        this.element.blur();
        return true;
      default:
        if (countGraphemes(key) !== 1) return false;
        return this.replaceSelection(key);
    }
  }

  private navigate(backward: boolean): boolean {
    const eligible = [...editors].filter((editor) => editor.canFocus());
    const index = eligible.indexOf(this);
    if (index < 0) return false;
    const next = eligible[backward ? index - 1 : index + 1];
    if (!next) {
      this.element.blur();
      return true;
    }
    next.focusElement();
    return true;
  }

  private beginPointer(input: SemanticControlInput): void {
    if (!this.canFocus()) return;
    const index = this.presentation.caretAtPoint(input.point);
    this.anchor = index;
    this.focusElement();
    if (index !== undefined) this.setSelectionRange(index, index, 'none');
  }

  private updatePointer(input: SemanticControlInput): void {
    if (this.anchor === undefined || !this.isReady()) return;
    const index = this.presentation.caretAtPoint(input.point);
    if (index === undefined) return;
    const anchor = this.anchor;
    this.setSelectionRange(
      Math.min(anchor, index),
      Math.max(anchor, index),
      anchor <= index ? 'forward' : 'backward'
    );
  }

  private deleteAtCaret(direction: 'backward' | 'forward'): boolean {
    const value = this.element.value;
    const selection = this.getSelection() ?? {
      start: value.length,
      end: value.length,
      direction: 'none' as const,
    };
    if (selection.start !== selection.end) return this.replaceSelection('');
    const containing = containingGrapheme(value, selection.start);
    if (containing)
      return this.replaceRange(containing.start, containing.end, '');
    if (direction === 'backward') {
      if (selection.start === 0) return false;
      const start = graphemeBoundaryBefore(value, selection.start);
      return this.replaceRange(start, selection.end, '');
    }
    if (selection.end >= value.length) return false;
    const end = graphemeBoundaryAfter(value, selection.end);
    return this.replaceRange(selection.start, end, '');
  }

  private replaceSelection(text: string): boolean {
    const value = this.element.value;
    const selection = this.getSelection();
    const start = selection?.start ?? value.length;
    const end = selection?.end ?? value.length;
    return this.replaceRange(start, end, text);
  }

  private replaceRange(start: number, end: number, text: string): boolean {
    if (
      !this.isReady() ||
      this.field.disabled ||
      this.field.readOnly ||
      this.composing
    ) {
      return false;
    }
    const element = this.element;
    const value = element.value;
    const from = Math.min(Math.max(0, start), value.length);
    const to = Math.min(Math.max(from, end), value.length);
    const insertion = clampInsertion(
      normalizeTextInputValue(text, this.field.multiline),
      value.length - (to - from),
      this.field.maxLength
    );
    const next = value.slice(0, from) + insertion + value.slice(to);
    if (next === value) return false;
    element.value = next;
    const caret = from + insertion.length;
    element.setSelectionRange(caret, caret, 'none');
    this.host.notifyInput(element.value);
    return true;
  }

  private focusElement(): void {
    this.element.focus();
    if (document.activeElement !== this.element) {
      throw new Error('The browser did not focus the text field.');
    }
  }
}

function setFocusedEditor(editor: TextInputEditor | undefined): void {
  focusedEditor = editor;
}

function createEditingElement(
  field: UITextInput
): HTMLInputElement | HTMLTextAreaElement {
  const element = field.multiline
    ? document.createElement('textarea')
    : document.createElement('input');
  if (element instanceof HTMLInputElement) element.type = 'text';
  element.spellcheck = false;
  element.setAttribute('autocomplete', 'off');
  element.setAttribute('autocorrect', 'off');
  element.setAttribute('autocapitalize', 'off');
  element.setAttribute('aria-label', field.ariaLabel);
  const style = element.style;
  style.setProperty('position', 'fixed');
  style.setProperty('left', '0');
  style.setProperty('top', '0');
  style.setProperty('width', '1px');
  style.setProperty('height', '1px');
  style.setProperty('padding', '0');
  style.setProperty('border', '0');
  style.setProperty('outline', 'none');
  style.setProperty('opacity', '0');
  style.setProperty('z-index', '-1');
  style.setProperty('pointer-events', 'none');
  style.setProperty('caret-color', 'transparent');
  return element;
}

function preservesFocus(field: UITextInput, target: THREE.Object3D): boolean {
  let node: THREE.Object3D | null = target;
  while (node) {
    if (node === field) return true;
    if (node.xb?.preserveTextFocus) return true;
    node = node.parent;
  }
  return false;
}

function clampInsertion(
  text: string,
  retainedLength: number,
  maxLength: number | undefined
): string {
  if (maxLength === undefined) return text;
  const remaining = maxLength - retainedLength;
  if (remaining <= 0) return '';
  if (text.length <= remaining) return text;
  return truncateToGrapheme(text, remaining);
}

let graphemeSegmenter: Intl.Segmenter | null | undefined;

function getGraphemeSegmenter(): Intl.Segmenter | null {
  if (graphemeSegmenter === undefined) {
    graphemeSegmenter =
      typeof Intl !== 'undefined' && typeof Intl.Segmenter === 'function'
        ? new Intl.Segmenter(undefined, {granularity: 'grapheme'})
        : null;
  }
  return graphemeSegmenter;
}

function countGraphemes(value: string): number {
  const segmenter = getGraphemeSegmenter();
  if (!segmenter) return [...value].length;
  let count = 0;
  for (const _segment of segmenter.segment(value)) count++;
  return count;
}

function containingGrapheme(
  value: string,
  index: number
): {start: number; end: number} | undefined {
  const segmenter = getGraphemeSegmenter();
  if (!segmenter) return undefined;
  for (const {index: start, segment} of segmenter.segment(value)) {
    const end = start + segment.length;
    if (start < index && index < end) return {start, end};
    if (start >= index) break;
  }
  return undefined;
}

/** Returns the cluster-safe offset preceding a UTF-16 caret position. */
function graphemeBoundaryBefore(value: string, index: number): number {
  if (index <= 0) return 0;
  const segmenter = getGraphemeSegmenter();
  if (!segmenter) return codePointBoundaryBefore(value, index);
  let boundary = 0;
  for (const {index: start} of segmenter.segment(value)) {
    if (start >= index) break;
    boundary = start;
  }
  return boundary;
}

/** Returns the cluster-safe offset following a UTF-16 caret position. */
function graphemeBoundaryAfter(value: string, index: number): number {
  if (index >= value.length) return value.length;
  const segmenter = getGraphemeSegmenter();
  if (!segmenter) return codePointBoundaryAfter(value, index);
  for (const {index: start, segment} of segmenter.segment(value)) {
    const end = start + segment.length;
    if (end > index) return end;
  }
  return value.length;
}

function codePointBoundaryBefore(value: string, index: number): number {
  const code = value.charCodeAt(index - 1);
  const isTrailSurrogate = code >= 0xdc00 && code <= 0xdfff;
  return Math.max(0, index - (isTrailSurrogate && index >= 2 ? 2 : 1));
}

function codePointBoundaryAfter(value: string, index: number): number {
  const code = value.charCodeAt(index);
  const isLeadSurrogate = code >= 0xd800 && code <= 0xdbff;
  return Math.min(value.length, index + (isLeadSurrogate ? 2 : 1));
}

function truncateToGrapheme(value: string, limit: number): string {
  const boundary = graphemeBoundaryBefore(value, limit + 1);
  return value.slice(0, Math.min(boundary, limit));
}
