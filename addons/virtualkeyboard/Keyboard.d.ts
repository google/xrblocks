import * as xb from 'xrblocks';
export declare class Keyboard extends xb.Script {
    private keyText;
    private isShifted;
    private isCapsLockOn;
    private textButtons;
    onTextChanged: ((text: string) => void) | null;
    onEnterPressed: ((text: string) => void) | null;
    private subspace;
    private mainGrid;
    constructor();
    init(): void;
    private createKeyboard;
    private createRow;
    private addKey;
    private handleKeyPress;
    private handleSpecialKey;
    private refreshKeyboard;
    setText(text: string): void;
}
