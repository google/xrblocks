import * as THREE from 'three';
import * as xb from 'xrblocks';

type CharacterKey = {
  kind: 'character';
  key: string;
  shifted?: string;
  width?: number;
};

type ActionKey = {
  kind: 'action';
  key: 'Backspace' | 'CapsLock' | 'Enter' | 'Shift' | 'Tab' | ' ';
  icon: string;
  width?: number;
};

type KeyDefinition = CharacterKey | ActionKey;

export interface KeyboardOptions extends Omit<xb.UIPanelOptions, 'children'> {
  value?: string;
  /** Binds every key to one text field instead of the standalone buffer. */
  input?: xb.UITextInput;
  /** Initial visibility. Omit to preserve the supplied visible/display options. */
  open?: boolean;
  onValueChange?: (value: string) => void;
  onSubmit?: (value: string) => void;
}

const KEYBOARD_COLOR = '#1a1a1b';
const CHARACTER_KEY_COLOR = '#333334';
const ACTION_KEY_COLOR = '#3e4a59';
const ACCENT_KEY_COLOR = '#449eb9';
const HOVER_KEY_COLOR = '#566170';
const TEXT_COLOR = '#ffffff';

const KEY_HEIGHT = 64;
const KEY_GAP = 8;
const ROW_GAP = 10;

const character = (
  key: string,
  shifted?: string,
  width?: number
): CharacterKey => ({kind: 'character', key, shifted, width});

const action = (
  key: ActionKey['key'],
  icon: string,
  width?: number
): ActionKey => ({kind: 'action', key, icon, width});

const KEY_LAYOUT: KeyDefinition[][] = [
  [
    character('`', '~'),
    character('1', '!'),
    character('2', '@'),
    character('3', '#'),
    character('4', '$'),
    character('5', '%'),
    character('6', '^'),
    character('7', '&'),
    character('8', '*'),
    character('9', '('),
    character('0', ')'),
    character('-', '_'),
    character('=', '+'),
    action('Backspace', 'backspace', 2),
  ],
  [
    action('Tab', 'keyboard_tab', 1.5),
    ...'qwertyuiop'.split('').map((key) => character(key)),
    character('[', '{'),
    character(']', '}'),
    character('\\', '|'),
  ],
  [
    action('CapsLock', 'keyboard_capslock', 1.8),
    ...'asdfghjkl'.split('').map((key) => character(key)),
    character(';', ':'),
    character("'", '"'),
    action('Enter', 'keyboard_return', 2.2),
  ],
  [
    action('Shift', 'shift', 2.3),
    ...'zxcvbnm'.split('').map((key) => character(key)),
    character(',', '<'),
    character('.', '>'),
    character('/', '?'),
    action('Shift', 'shift', 2.3),
  ],
  [action(' ', 'space_bar', 8)],
];

const CHARACTER_KEYS = new Map(
  KEY_LAYOUT.flat()
    .filter((key): key is CharacterKey => key.kind === 'character')
    .map((key) => [key.key, key])
);

/**
 * An embeddable QWERTY keyboard for UI Blocks cards.
 *
 * The parent card owns world placement and lifecycle. The keyboard owns text
 * input state, modifier state, layout, and key interaction feedback.
 */
export class Keyboard<
  TEventMap extends THREE.Object3DEventMap = THREE.Object3DEventMap,
> extends xb.UIPanel<TEventMap> {
  public onValueChange?: (value: string) => void;
  public onSubmit?: (value: string) => void;

  private _value: string;
  private _input?: xb.UITextInput;
  private suppressedInput?: xb.UITextInput;
  private releaseNativeKeyboard?: () => void;
  private disposed = false;
  private shiftActive = false;
  private capsLockActive = false;
  private characterButtons: Array<{
    definition: CharacterKey;
    button: xb.UIButton;
  }> = [];
  private actionButtons = new Map<string, xb.UIButton[]>();

  constructor({
    value = '',
    input,
    open,
    onValueChange,
    onSubmit,
    style,
    ...options
  }: KeyboardOptions = {}) {
    if (open !== undefined && typeof open !== 'boolean') {
      throw new Error('Keyboard open must be a boolean.');
    }
    super({
      ...options,
      style: {
        width: '100%',
        height: 372,
        flexDirection: 'column',
        gap: ROW_GAP,
        padding: 14,
        backgroundColor: KEYBOARD_COLOR,
        borderRadius: 18,
        borderWidth: 1,
        borderColor: '#4a4a4d',
        borderAlign: 'inside',
        dropShadowColor: '#000000',
        dropShadowBlur: 18,
        dropShadowSpread: 1,
        ...style,
      },
    });

    this.name = 'Keyboard';
    this._value = value;
    this.onValueChange = onValueChange;
    this.onSubmit = onSubmit;
    this.addEventListener('added', this.syncNativeKeyboard);
    this.addEventListener('removed', this.syncNativeKeyboard);
    if (open !== undefined) this.open = open;
    this.input = input;

    for (const row of KEY_LAYOUT) {
      this.add(this.createRow(row));
    }
  }

  /** The bound field, or undefined while the keyboard owns its own buffer. */
  get input(): xb.UITextInput | undefined {
    return this._input;
  }

  set input(field: xb.UITextInput | undefined) {
    if (field === this._input) return;
    if (!field && this._input) this._value = this._input.value;
    this._input = field;
    this.xb = {...this.xb, preserveTextFocus: field !== undefined};
    this.syncNativeKeyboard();
  }

  get open(): boolean {
    return this.visible && this.style.display !== 'none';
  }

  /** Shows or hides the panel and immediately updates native-keyboard ownership. */
  set open(value: boolean) {
    if (typeof value !== 'boolean')
      throw new Error('Keyboard open must be a boolean.');
    this.visible = value;
    this.style.display = value ? 'flex' : 'none';
    this.syncNativeKeyboard();
  }

  override update(time?: number, frame?: XRFrame): void {
    super.update(time, frame);
    this.syncNativeKeyboard();
  }

  override dispose(): void {
    this.disposed = true;
    this.removeEventListener('added', this.syncNativeKeyboard);
    this.removeEventListener('removed', this.syncNativeKeyboard);
    this.syncNativeKeyboard();
    super.dispose();
  }

  get value(): string {
    return this._input ? this._input.value : this._value;
  }

  /** Updates the value without emitting an input callback. */
  setValue(value: string): void {
    if (this._input) {
      this._input.value = value;
      return;
    }
    this._value = value;
  }

  /**
   * Applies a key using KeyboardEvent.key names.
   *
   * Printable layout keys use the current Shift and Caps Lock state. While a
   * field is bound, keys are forwarded to it and the field owns its callbacks.
   * The return value reports whether this keyboard handles the supplied key.
   */
  pressKey(key: string): boolean {
    this.syncNativeKeyboard();
    if (this._input) {
      if (!this._input.ready || this._input.disabled) return false;
      if (!this._input.focused) this._input.focus();
    }
    switch (key) {
      case 'Backspace':
        this.backspace();
        return true;
      case 'CapsLock':
        this.capsLockActive = !this.capsLockActive;
        this.refreshKeys();
        return true;
      case 'Enter':
        this.submit();
        return true;
      case 'Shift':
        this.shiftActive = !this.shiftActive;
        this.refreshKeys();
        return true;
      case 'Tab':
        this.tab();
        return true;
      case ' ':
        this.insert(' ');
        return true;
      default: {
        const definition = CHARACTER_KEYS.get(key);
        if (definition) {
          this.insert(this.displayCharacter(definition));
          return true;
        }
        if (Array.from(key).length === 1) {
          this.insert(key);
          return true;
        }
        return false;
      }
    }
  }

  private syncNativeKeyboard = (): void => {
    const field =
      !this.disposed && this._input && this.isConnectedAndVisible()
        ? this._input
        : undefined;
    if (field === this.suppressedInput) return;
    const release = this.releaseNativeKeyboard;
    this.releaseNativeKeyboard = undefined;
    this.suppressedInput = field;
    release?.();
    if (!field || this.suppressedInput !== field) return;
    const acquired = field.suppressNativeKeyboard();
    if (this.suppressedInput === field) this.releaseNativeKeyboard = acquired;
    else acquired();
  };

  private isConnectedAndVisible(): boolean {
    if (!this.open || this.xb?.pointerEvents === 'none') return false;
    let object = this.parent;
    while (object) {
      if (!object.visible || object.xb?.pointerEvents === 'none') return false;
      if (object instanceof xb.UIElement && object.style.display === 'none')
        return false;
      if (object instanceof THREE.Scene) return true;
      object = object.parent;
    }
    return false;
  }

  private createRow(definitions: KeyDefinition[]): xb.UIPanel {
    const isSpaceRow = definitions.length === 1 && definitions[0]?.key === ' ';
    const row = new xb.UIPanel({
      style: {
        width: '100%',
        height: KEY_HEIGHT,
        flexDirection: 'row',
        gap: KEY_GAP,
        justifyContent: isSpaceRow ? 'center' : 'flex-start',
        alignItems: 'stretch',
      },
    });

    for (const definition of definitions) {
      row.add(this.createKey(definition, isSpaceRow));
    }
    return row;
  }

  private createKey(
    definition: KeyDefinition,
    isSpaceRow: boolean
  ): xb.UIButton {
    const button = new xb.UIButton({
      ...(definition.kind === 'character'
        ? {label: this.displayCharacter(definition)}
        : {icon: definition.icon, ariaLabel: actionLabel(definition.key)}),
      style: {
        height: '100%',
        width: isSpaceRow ? '55%' : undefined,
        flexBasis: isSpaceRow ? undefined : 0,
        flexGrow: isSpaceRow ? undefined : (definition.width ?? 1),
        justifyContent: 'center',
        alignItems: 'center',
        backgroundColor: this.baseKeyColor(definition),
        color: TEXT_COLOR,
        borderRadius: 10,
        borderWidth: 1,
        borderColor: '#55555a',
        borderAlign: 'inside',
        fontSize: 28,
        fontWeight: 'bold',
        ':hover': {backgroundColor: HOVER_KEY_COLOR},
        ':active': {backgroundColor: '#687688'},
      },
      onClick: () => this.pressKey(definition.key),
    });
    button.name = `KeyboardKey:${definition.key}`;

    if (definition.kind === 'character') {
      this.characterButtons.push({definition, button});
    } else {
      const buttons = this.actionButtons.get(definition.key) ?? [];
      buttons.push(button);
      this.actionButtons.set(definition.key, buttons);
    }

    return button;
  }

  private insert(text: string): void {
    if (this._input) this._input.pressKey(text);
    else {
      this._value += text;
      this.onValueChange?.(this._value);
    }
    this.consumeShift();
  }

  private backspace(): void {
    if (this._input) {
      this._input.pressKey('Backspace');
      return;
    }
    const codePoints = Array.from(this._value);
    if (codePoints.length === 0) return;

    codePoints.pop();
    this._value = codePoints.join('');
    this.onValueChange?.(this._value);
  }

  private submit(): void {
    if (this._input) {
      this._input.pressKey('Enter');
      return;
    }
    this.onSubmit?.(this._value);
  }

  private tab(): void {
    if (this._input) {
      this._input.pressKey('Tab', {shiftKey: this.shiftActive});
      this.consumeShift();
      return;
    }
    this.insert('\t');
  }

  private consumeShift(): void {
    if (!this.shiftActive) return;
    this.shiftActive = false;
    this.refreshKeys();
  }

  private displayCharacter(definition: CharacterKey): string {
    const isLetter = /^[a-z]$/i.test(definition.key);
    if (isLetter) {
      return this.shiftActive !== this.capsLockActive
        ? definition.key.toUpperCase()
        : definition.key.toLowerCase();
    }
    return this.shiftActive
      ? (definition.shifted ?? definition.key)
      : definition.key;
  }

  private baseKeyColor(definition: KeyDefinition): string {
    if (definition.kind === 'character') return CHARACTER_KEY_COLOR;
    if (definition.key === 'Enter') return ACCENT_KEY_COLOR;
    if (definition.key === 'Shift' && this.shiftActive) return ACCENT_KEY_COLOR;
    if (definition.key === 'CapsLock' && this.capsLockActive)
      return ACCENT_KEY_COLOR;
    return ACTION_KEY_COLOR;
  }

  private refreshKeys(): void {
    for (const {definition, button} of this.characterButtons) {
      button.label = this.displayCharacter(definition);
    }
    for (const key of ['Shift', 'CapsLock']) {
      for (const button of this.actionButtons.get(key) ?? []) {
        const definition = KEY_LAYOUT.flat().find(
          (candidate) => candidate.kind === 'action' && candidate.key === key
        );
        if (definition)
          button.style.backgroundColor = this.baseKeyColor(definition);
      }
    }
  }
}

function actionLabel(key: ActionKey['key']): string {
  return key === ' ' ? 'Space' : key.replace(/([a-z])([A-Z])/g, '$1 $2');
}
