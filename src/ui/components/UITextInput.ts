import type * as THREE from 'three';

import {
  registerSemanticControl,
  type SemanticControlInput,
  type SemanticScrollState,
} from '../../interaction/SemanticControl';
import {UIElement, type UIElementOptions} from '../UIElement';

const DEFAULT_SINGLE_LINE_HEIGHT = 56;
const DEFAULT_MULTILINE_HEIGHT = 120;

export type UITextInputSelectionDirection = 'forward' | 'backward' | 'none';

export interface UITextInputSelection {
  readonly start: number;
  readonly end: number;
  readonly direction: UITextInputSelectionDirection;
}

export interface UITextInputKeyModifiers {
  shiftKey?: boolean;
  ctrlKey?: boolean;
  metaKey?: boolean;
}

export interface UITextInputOptions extends UIElementOptions {
  ariaLabel: string;
  value?: string;
  placeholder?: string;
  /** Fixed at construction because the native editing element cannot change. */
  multiline?: boolean;
  disabled?: boolean;
  readOnly?: boolean;
  maxLength?: number;
  onInput?: (value: string) => void;
  onChange?: (value: string) => void;
  onSubmit?: (value: string) => void;
  onFocus?: () => void;
  onBlur?: () => void;
}

/**
 * Editing operations implemented by the native backend.
 *
 * This is an internal seam between the retained field and its hidden native
 * element. It is deliberately not part of the public SDK surface.
 */
export interface TextInputBinding {
  isReady(): boolean;
  getError?(): Error | undefined;
  applyValue(value: string): void;
  applyOptions(): void;
  getSelection(): UITextInputSelection | undefined;
  setSelectionRange(
    start: number,
    end: number,
    direction: UITextInputSelectionDirection
  ): void;
  focus(): void;
  blur(): void;
  insertText(text: string): void;
  pressKey(key: string, modifiers?: UITextInputKeyModifiers): boolean;
  begin?(input: SemanticControlInput): void;
  update?(input: SemanticControlInput): void;
  complete?(): void;
  cancel?(): void;
  getScroll?(): SemanticScrollState | undefined;
}

/** Callbacks a bound backend uses to report authoritative native edits. */
export interface TextInputHost {
  readonly field: UITextInput;
  notifyInput(value: string): void;
  notifyFocus(): void;
  notifyBlur(): void;
  notifySubmit(): void;
  unbind(): void;
}

interface TextInputInternals {
  notifyInput(value: string): void;
  notifyFocus(): void;
  notifyBlur(): void;
  notifySubmit(): void;
}

interface TextInputState {
  binding?: TextInputBinding;
  internals: TextInputInternals;
  baseline: string;
  focused: boolean;
  nativeKeyboardRequests: Set<object>;
}

const states = new WeakMap<UITextInput, TextInputState>();

/** A single-line or multiline text field backed by native browser editing. */
export class UITextInput<
  TEventMap extends THREE.Object3DEventMap = THREE.Object3DEventMap,
> extends UIElement<TEventMap> {
  name = 'UITextInput';
  readonly ariaLabel: string;
  readonly multiline: boolean;
  onInput?: (value: string) => void;
  onChange?: (value: string) => void;
  onSubmit?: (value: string) => void;
  onFocus?: () => void;
  onBlur?: () => void;

  private _value: string;
  private _placeholder: string;
  private _disabled: boolean;
  private _readOnly: boolean;
  private _maxLength?: number;

  constructor({
    ariaLabel,
    value = '',
    placeholder = '',
    multiline = false,
    disabled = false,
    readOnly = false,
    maxLength,
    onInput,
    onChange,
    onSubmit,
    onFocus,
    onBlur,
    style,
    ...options
  }: UITextInputOptions) {
    if (!ariaLabel) throw new Error('UITextInput requires ariaLabel.');
    validateText(value, 'value');
    validateText(placeholder, 'placeholder');
    validateFlag(multiline, 'multiline');
    validateFlag(disabled, 'disabled');
    validateFlag(readOnly, 'readOnly');
    validateMaxLength(maxLength);
    super('input', {
      ...options,
      style: {
        width: '100%',
        minHeight: multiline
          ? DEFAULT_MULTILINE_HEIGHT
          : DEFAULT_SINGLE_LINE_HEIGHT,
        ...style,
      },
    });
    this.ariaLabel = ariaLabel;
    this.multiline = multiline;
    this._value = normalizeTextInputValue(value, multiline);
    this._placeholder = placeholder;
    this._disabled = disabled;
    this._readOnly = readOnly;
    this._maxLength = maxLength;
    this.onInput = onInput;
    this.onChange = onChange;
    this.onSubmit = onSubmit;
    this.onFocus = onFocus;
    this.onBlur = onBlur;
    states.set(this, {
      baseline: this._value,
      focused: false,
      nativeKeyboardRequests: new Set(),
      internals: {
        notifyInput: (next) => this.handleNativeInput(next),
        notifyFocus: () => this.handleNativeFocus(),
        notifyBlur: () => this.handleNativeBlur(),
        notifySubmit: () => this.onSubmit?.(this._value),
      },
    });
    const scrollOwner = states.get(this)!;

    registerSemanticControl(this, {
      kind: 'input',
      isDisabled: () => this._disabled || !this.ready,
      activate: () => {
        if (this.ready && !this._disabled) this.binding!.focus();
      },
      begin: (input) => this.binding?.begin?.(input),
      update: (input) => this.binding?.update?.(input),
      complete: () => this.binding?.complete?.(),
      cancel: () => this.binding?.cancel?.(),
      get scroll(): SemanticScrollState | undefined {
        return scrollOwner.binding?.getScroll?.();
      },
    });
  }

  /** Whether a mounted backend can currently accept editing operations. */
  get ready(): boolean {
    return this.binding?.isReady() ?? false;
  }

  /** A module or text-rendering failure reported by the mounted backend. */
  get error(): Error | undefined {
    return this.binding?.getError?.();
  }

  get focused(): boolean {
    return states.get(this)!.focused;
  }

  /** Whether a custom keyboard currently owns software-keyboard suppression. */
  get nativeKeyboardSuppressed(): boolean {
    return states.get(this)!.nativeKeyboardRequests.size > 0;
  }

  /**
   * Requests that the browser's software keyboard stay hidden while a custom
   * keyboard is active. Call the returned function to release this request.
   * Native text editing remains enabled; support depends on the browser.
   */
  suppressNativeKeyboard(): () => void {
    const state = states.get(this)!;
    const token = {};
    const wasSuppressed = state.nativeKeyboardRequests.size > 0;
    state.nativeKeyboardRequests.add(token);
    if (!wasSuppressed) state.binding?.applyOptions();
    return () => {
      if (!state.nativeKeyboardRequests.delete(token)) return;
      if (state.nativeKeyboardRequests.size === 0)
        state.binding?.applyOptions();
    };
  }

  get value(): string {
    return this._value;
  }

  /** Programmatic assignment never emits onInput and rebases onChange. */
  set value(value: string) {
    validateText(value, 'value');
    value = normalizeTextInputValue(value, this.multiline);
    const changed = value !== this._value;
    const state = states.get(this)!;
    this._value = value;
    state.baseline = value;
    state.binding?.applyValue(value);
    if (changed) this.markUIContentDirty();
  }

  get placeholder(): string {
    return this._placeholder;
  }

  set placeholder(value: string) {
    validateText(value, 'placeholder');
    if (value === this._placeholder) return;
    this._placeholder = value;
    this.binding?.applyOptions();
    this.markUIContentDirty();
  }

  get disabled(): boolean {
    return this._disabled;
  }

  set disabled(value: boolean) {
    validateFlag(value, 'disabled');
    if (value === this._disabled) return;
    this._disabled = value;
    this.binding?.applyOptions();
    this.markUIDirty();
  }

  get readOnly(): boolean {
    return this._readOnly;
  }

  set readOnly(value: boolean) {
    validateFlag(value, 'readOnly');
    if (value === this._readOnly) return;
    this._readOnly = value;
    this.binding?.applyOptions();
    this.markUIDirty();
  }

  get maxLength(): number | undefined {
    return this._maxLength;
  }

  set maxLength(value: number | undefined) {
    validateMaxLength(value);
    if (value === this._maxLength) return;
    this._maxLength = value;
    this.binding?.applyOptions();
  }

  get selectionStart(): number | undefined {
    return this.binding?.getSelection()?.start;
  }

  get selectionEnd(): number | undefined {
    return this.binding?.getSelection()?.end;
  }

  get selectionDirection(): UITextInputSelectionDirection | undefined {
    return this.binding?.getSelection()?.direction;
  }

  /** UTF-16 code unit offsets, matching browser text field indexing. */
  get selection(): UITextInputSelection | undefined {
    return this.binding?.getSelection();
  }

  setSelectionRange(
    start: number,
    end: number,
    direction: UITextInputSelectionDirection = 'none'
  ): void {
    if (!Number.isInteger(start) || !Number.isInteger(end)) {
      throw new Error('UITextInput selection offsets must be integers.');
    }
    if (!['forward', 'backward', 'none'].includes(direction)) {
      throw new Error(
        'UITextInput selection direction must be forward, backward, or none.'
      );
    }
    this.requireBinding('setSelectionRange').setSelectionRange(
      Math.max(0, start),
      Math.max(0, end),
      direction
    );
  }

  focus(): void {
    const binding = this.requireBinding('focus');
    if (this._disabled) return;
    binding.focus();
  }

  blur(): void {
    this.binding?.blur();
  }

  /** Replaces the current selection, honoring maxLength like typed input. */
  insertText(text: string): void {
    validateText(text, 'insertText');
    const binding = this.requireBinding('insertText');
    if (this._disabled || this._readOnly) return;
    binding.insertText(text);
  }

  /**
   * Applies one KeyboardEvent.key name from a virtual keyboard or automation.
   *
   * Returns whether the key was applied. Physical keyboards and IME go through
   * the native element instead of this narrow path.
   */
  pressKey(key: string, modifiers?: UITextInputKeyModifiers): boolean {
    if (typeof key !== 'string' || key.length === 0) {
      throw new Error('UITextInput.pressKey requires a key name.');
    }
    if (!this.ready || this._disabled) return false;
    return this.binding!.pressKey(key, modifiers);
  }

  private get binding(): TextInputBinding | undefined {
    return states.get(this)!.binding;
  }

  private handleNativeInput(value: string): void {
    value = normalizeTextInputValue(value, this.multiline);
    if (value === this._value) return;
    this._value = value;
    this.markUIContentDirty();
    this.onInput?.(value);
  }

  private handleNativeFocus(): void {
    const state = states.get(this)!;
    if (state.focused) return;
    state.focused = true;
    state.baseline = this._value;
    this.markUIDirty();
    this.onFocus?.();
  }

  private handleNativeBlur(): void {
    const state = states.get(this)!;
    if (!state.focused) return;
    state.focused = false;
    this.markUIDirty();
    const edited = this._value !== state.baseline;
    state.baseline = this._value;
    try {
      if (edited) this.onChange?.(this._value);
    } finally {
      this.onBlur?.();
    }
  }

  private requireBinding(operation: string): TextInputBinding {
    const binding = this.binding;
    if (!binding || !binding.isReady()) {
      throw new Error(
        `UITextInput.${operation} requires a mounted, ready text field.`
      );
    }
    return binding;
  }
}

/** Uses the same line-ending rules as native input and textarea values. */
export function normalizeTextInputValue(
  value: string,
  multiline: boolean
): string {
  return multiline
    ? value.replace(/\r\n?/g, '\n')
    : value.replace(/[\r\n]/g, '');
}

/** Attaches one native editing backend and returns its reporting callbacks. */
export function bindTextInput(
  field: UITextInput,
  binding: TextInputBinding
): TextInputHost {
  const state = states.get(field)!;
  if (state.binding && state.binding !== binding) {
    throw new Error('UITextInput already has a native editing backend.');
  }
  state.binding = binding;
  const internals = state.internals;
  return {
    field,
    notifyInput: (value: string) => internals.notifyInput(value),
    notifyFocus: () => internals.notifyFocus(),
    notifyBlur: () => internals.notifyBlur(),
    notifySubmit: () => internals.notifySubmit(),
    unbind: () => {
      if (state.binding !== binding) return;
      state.binding = undefined;
      internals.notifyBlur();
    },
  };
}

function validateText(value: unknown, property: string): void {
  if (typeof value !== 'string') {
    throw new Error(`UITextInput ${property} must be a string.`);
  }
}

function validateFlag(value: unknown, property: string): void {
  if (typeof value !== 'boolean') {
    throw new Error(`UITextInput ${property} must be a boolean.`);
  }
}

function validateMaxLength(value: number | undefined): void {
  if (value === undefined) return;
  if (!Number.isInteger(value) || value < 0) {
    throw new Error(
      'UITextInput maxLength must be a nonnegative integer or undefined.'
    );
  }
}
