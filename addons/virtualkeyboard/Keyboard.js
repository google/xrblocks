import * as xb from 'xrblocks';

const KEYBOARD_COLOR = '#1a1a1b';
const CHARACTER_KEY_COLOR = '#333334';
const ACTION_KEY_COLOR = '#3e4a59';
const ACCENT_KEY_COLOR = '#449eb9';
const HOVER_KEY_COLOR = '#566170';
const TEXT_COLOR = '#ffffff';
const KEY_HEIGHT = 64;
const KEY_GAP = 8;
const ROW_GAP = 10;
const character = (key, shifted, width) => ({ kind: 'character', key, shifted, width });
const action = (key, icon, width) => ({ kind: 'action', key, icon, width });
const KEY_LAYOUT = [
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
const CHARACTER_KEYS = new Map(KEY_LAYOUT.flat()
    .filter((key) => key.kind === 'character')
    .map((key) => [key.key, key]));
/**
 * An embeddable QWERTY keyboard for UI Blocks cards.
 *
 * The parent card owns world placement and lifecycle. The keyboard owns text
 * input state, modifier state, layout, and key interaction feedback.
 */
class Keyboard extends xb.UIPanel {
    constructor({ value = '', onValueChange, onSubmit, style, ...options } = {}) {
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
        this.shiftActive = false;
        this.capsLockActive = false;
        this.characterButtons = [];
        this.actionButtons = new Map();
        this.name = 'Keyboard';
        this._value = value;
        this.onValueChange = onValueChange;
        this.onSubmit = onSubmit;
        for (const row of KEY_LAYOUT) {
            this.add(this.createRow(row));
        }
    }
    get value() {
        return this._value;
    }
    /** Updates the value without emitting an input callback. */
    setValue(value) {
        this._value = value;
    }
    /**
     * Applies a key using KeyboardEvent.key names.
     *
     * Printable layout keys use the current Shift and Caps Lock state. The
     * return value reports whether this keyboard handles the supplied key.
     */
    pressKey(key) {
        switch (key) {
            case 'Backspace':
                this.backspace();
                return true;
            case 'CapsLock':
                this.capsLockActive = !this.capsLockActive;
                this.refreshKeys();
                return true;
            case 'Enter':
                this.onSubmit?.(this._value);
                return true;
            case 'Shift':
                this.shiftActive = !this.shiftActive;
                this.refreshKeys();
                return true;
            case 'Tab':
                this.insert('\t');
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
    createRow(definitions) {
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
    createKey(definition, isSpaceRow) {
        const button = new xb.UIButton({
            ...(definition.kind === 'character'
                ? { label: this.displayCharacter(definition) }
                : { icon: definition.icon, ariaLabel: actionLabel(definition.key) }),
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
                ':hover': { backgroundColor: HOVER_KEY_COLOR },
                ':active': { backgroundColor: '#687688' },
            },
            onClick: () => this.pressKey(definition.key),
        });
        button.name = `KeyboardKey:${definition.key}`;
        if (definition.kind === 'character') {
            this.characterButtons.push({ definition, button });
        }
        else {
            const buttons = this.actionButtons.get(definition.key) ?? [];
            buttons.push(button);
            this.actionButtons.set(definition.key, buttons);
        }
        return button;
    }
    insert(text) {
        this._value += text;
        this.onValueChange?.(this._value);
        if (this.shiftActive) {
            this.shiftActive = false;
            this.refreshKeys();
        }
    }
    backspace() {
        const codePoints = Array.from(this._value);
        if (codePoints.length === 0)
            return;
        codePoints.pop();
        this._value = codePoints.join('');
        this.onValueChange?.(this._value);
    }
    displayCharacter(definition) {
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
    baseKeyColor(definition) {
        if (definition.kind === 'character')
            return CHARACTER_KEY_COLOR;
        if (definition.key === 'Enter')
            return ACCENT_KEY_COLOR;
        if (definition.key === 'Shift' && this.shiftActive)
            return ACCENT_KEY_COLOR;
        if (definition.key === 'CapsLock' && this.capsLockActive)
            return ACCENT_KEY_COLOR;
        return ACTION_KEY_COLOR;
    }
    refreshKeys() {
        for (const { definition, button } of this.characterButtons) {
            button.label = this.displayCharacter(definition);
        }
        for (const key of ['Shift', 'CapsLock']) {
            for (const button of this.actionButtons.get(key) ?? []) {
                const definition = KEY_LAYOUT.flat().find((candidate) => candidate.kind === 'action' && candidate.key === key);
                if (definition)
                    button.style.backgroundColor = this.baseKeyColor(definition);
            }
        }
    }
}
function actionLabel(key) {
    return key === ' ' ? 'Space' : key.replace(/([a-z])([A-Z])/g, '$1 $2');
}

export { Keyboard };
