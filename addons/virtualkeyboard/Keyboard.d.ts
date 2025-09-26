/**
 * This script defines a virtual keyboard component (gBoard) for XR
 * environments using the XR Blocks SDK. It creates a responsive keyboard UI
 * with alphabetic keys, a backspace, and an enter key.
 */
import * as xb from 'xrblocks';
export declare class Keyboard extends xb.Script {
    private keyText;
    private isShifted;
    private isCapsLockOn;
    private textButtons;
    onEnterPressed: ((text: string) => void) | null;
    onTextChanged: ((text: string) => void) | null;
    private subspace;
    private mainPanel;
    private mainGrid;
    private keyRows;
    constructor();
    init(): void;
    getText(): string;
    setText(newText: string): void;
    clearText(): void;
    createKeyboard(): void;
    private createRow;
    private createTextButtons;
    private createSpecialButtons;
    private handleSpecialKey;
    private handleBackspace;
    private handleEnter;
    private refreshKeyboard;
    private handleKeyPress;
}
