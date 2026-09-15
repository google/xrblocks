import * as THREE from 'three';
import * as xb from 'xrblocks';
export interface KeyboardOptions extends Omit<xb.UIPanelOptions, 'children'> {
    value?: string;
    /** Binds every key to one text field instead of the standalone buffer. */
    input?: xb.UITextInput;
    /** Initial visibility. Omit to preserve the supplied visible/display options. */
    open?: boolean;
    onValueChange?: (value: string) => void;
    onSubmit?: (value: string) => void;
}
/**
 * An embeddable QWERTY keyboard for UI Blocks cards.
 *
 * The parent card owns world placement and lifecycle. The keyboard owns text
 * input state, modifier state, layout, and key interaction feedback.
 */
export declare class Keyboard<TEventMap extends THREE.Object3DEventMap = THREE.Object3DEventMap> extends xb.UIPanel<TEventMap> {
    onValueChange?: (value: string) => void;
    onSubmit?: (value: string) => void;
    private _value;
    private _input?;
    private suppressedInput?;
    private releaseNativeKeyboard?;
    private disposed;
    private shiftActive;
    private capsLockActive;
    private characterButtons;
    private actionButtons;
    constructor({ value, input, open, onValueChange, onSubmit, style, ...options }?: KeyboardOptions);
    /** The bound field, or undefined while the keyboard owns its own buffer. */
    get input(): xb.UITextInput | undefined;
    set input(field: xb.UITextInput | undefined);
    get open(): boolean;
    /** Shows or hides the panel and immediately updates native-keyboard ownership. */
    set open(value: boolean);
    update(time?: number, frame?: XRFrame): void;
    dispose(): void;
    get value(): string;
    /** Updates the value without emitting an input callback. */
    setValue(value: string): void;
    /**
     * Applies a key using KeyboardEvent.key names.
     *
     * Printable layout keys use the current Shift and Caps Lock state. While a
     * field is bound, keys are forwarded to it and the field owns its callbacks.
     * The return value reports whether this keyboard handles the supplied key.
     */
    pressKey(key: string): boolean;
    private syncNativeKeyboard;
    private isConnectedAndVisible;
    private createRow;
    private createKey;
    private insert;
    private backspace;
    private submit;
    private tab;
    private consumeShift;
    private displayCharacter;
    private baseKeyColor;
    private refreshKeys;
}
