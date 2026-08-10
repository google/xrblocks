import * as xb from 'xrblocks';
export interface KeyboardOptions extends Omit<xb.UIPanelOptions, 'children'> {
    value?: string;
    onValueChange?: (value: string) => void;
    onSubmit?: (value: string) => void;
}
/**
 * An embeddable QWERTY keyboard for UI Blocks cards.
 *
 * The parent card owns world placement and lifecycle. The keyboard owns text
 * input state, modifier state, layout, and key interaction feedback.
 */
export declare class Keyboard extends xb.UIPanel {
    onValueChange?: (value: string) => void;
    onSubmit?: (value: string) => void;
    private _value;
    private shiftActive;
    private capsLockActive;
    private characterButtons;
    private actionButtons;
    constructor({ value, onValueChange, onSubmit, style, ...options }?: KeyboardOptions);
    get value(): string;
    /** Updates the value without emitting an input callback. */
    setValue(value: string): void;
    /**
     * Applies a key using KeyboardEvent.key names.
     *
     * Printable layout keys use the current Shift and Caps Lock state. The
     * return value reports whether this keyboard handles the supplied key.
     */
    pressKey(key: string): boolean;
    private createRow;
    private createKey;
    private insert;
    private backspace;
    private displayCharacter;
    private baseKeyColor;
    private refreshKeys;
}
