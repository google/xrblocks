import * as xb from 'xrblocks';

// --- Constants ---
const KEY_WIDTH = 0.07;
const KEY_HEIGHT = 0.08;
const FONT_SIZE = 0.45;
const KEYBOARD_COLOR = '#1a1a1b';
const DEFAULT_KEY_COLOR = '#333334';
const SPECIAL_KEY_COLOR = '#3e4a59';
const ACTION_KEY_COLOR = '#449eb9';
const COL_SPACER = 0.01;
const ROW_SPACER = 0.015;
const KEY_LAYOUT = [
    { textKeys: '~!@#$%^&*()_+', specialKeys: [] },
    { textKeys: '`1234567890<>', specialKeys: [] },
    {
        textKeys: 'qwertyuiop',
        specialKeys: [
            {
                position: 'left',
                type: 'tab',
                iconName: 'keyboard_tab',
                weight: KEY_WIDTH * 1.2,
            },
            { position: 'right', type: 'backspace', iconName: 'backspace' },
        ],
    },
    {
        textKeys: 'asdfghjkl',
        specialKeys: [
            {
                position: 'left',
                type: 'shift_lock',
                iconName: 'lock',
                weight: KEY_WIDTH * 1.5,
            },
            {
                position: 'right',
                type: 'enter',
                iconName: 'keyboard_return',
                backgroundColor: ACTION_KEY_COLOR,
            },
        ],
    },
    {
        textKeys: 'zxcvbnm,.',
        specialKeys: [
            {
                position: 'left',
                type: 'shift',
                iconName: 'keyboard_capslock',
                weight: KEY_WIDTH * 2.1,
            },
            { position: 'right', type: 'shift', iconName: 'keyboard_capslock' },
        ],
    },
    {
        specialKeys: [
            {
                position: 'center',
                type: 'space',
                iconName: 'space_bar',
                weight: KEY_WIDTH * 9,
            },
        ],
    },
];
const TOTAL_KEYBOARD_WIDTH = 1.0;
const TOTAL_KEYBOARD_HEIGHT = KEY_LAYOUT.length * KEY_HEIGHT + (KEY_LAYOUT.length - 1) * ROW_SPACER;
// --- Classes ---
class KeyboardButton extends xb.TextButton {
    constructor(options) {
        super(options);
        this.originalKey = options.originalKey;
        this.shiftKey = options.shiftKey;
    }
}
class Keyboard extends xb.Script {
    constructor() {
        super();
        this.keyText = '';
        this.isShifted = false;
        this.isCapsLockOn = false;
        this.textButtons = [];
        this.onTextChanged = null;
        this.onEnterPressed = null;
        this.subspace = new xb.SpatialPanel({
            showEdge: true,
            backgroundColor: KEYBOARD_COLOR,
            width: TOTAL_KEYBOARD_WIDTH,
            height: TOTAL_KEYBOARD_HEIGHT,
        });
        this.subspace.isRoot = true;
        this.add(this.subspace);
        this.mainGrid = new xb.Grid({ height: TOTAL_KEYBOARD_WIDTH });
        this.subspace.add(this.mainGrid);
        this.createKeyboard();
        this.subspace.updateLayouts();
    }
    init() {
        this.subspace.position.set(0, 1.2, -1);
    }
    createKeyboard() {
        KEY_LAYOUT.forEach((rowData, index) => {
            this.createRow(rowData);
            if (index < KEY_LAYOUT.length - 1) {
                this.mainGrid.addRow({ weight: ROW_SPACER });
            }
        });
    }
    createRow(rowData) {
        const row = this.mainGrid.addRow({ weight: KEY_HEIGHT * (1.0 / 0.56) });
        if (rowData.specialKeys.some((k) => k.type === 'space')) {
            const spaceKey = rowData.specialKeys.find((k) => k.type === 'space');
            const sidePadding = (TOTAL_KEYBOARD_WIDTH - (spaceKey.weight || 0)) / 2;
            row.addCol({ weight: sidePadding });
            this.addKey(row, spaceKey);
            row.addCol({ weight: sidePadding });
            return;
        }
        const leftSpecial = rowData.specialKeys.filter((k) => k.position === 'left' || k.position === 'center');
        const rightSpecial = rowData.specialKeys.filter((k) => k.position === 'right');
        const textKeys = rowData.textKeys ? rowData.textKeys.split('') : [];
        let usedWidth = 0;
        leftSpecial.forEach((keyData) => {
            const w = keyData.weight || KEY_WIDTH;
            this.addKey(row, keyData);
            usedWidth += w + COL_SPACER;
            row.addCol({ weight: COL_SPACER });
        });
        textKeys.forEach((char, i) => {
            this.addKey(row, char);
            usedWidth += KEY_WIDTH;
            if (i < textKeys.length - 1 || rightSpecial.length > 0) {
                row.addCol({ weight: COL_SPACER });
                usedWidth += COL_SPACER;
            }
        });
        rightSpecial.forEach((keyData) => {
            const remainingWidth = TOTAL_KEYBOARD_WIDTH + 0.03 - usedWidth;
            this.addKey(row, { ...keyData, weight: remainingWidth });
        });
    }
    addKey(row, data, shiftChar = null) {
        const isObject = typeof data === 'object';
        const weight = isObject ? data.weight || KEY_WIDTH : KEY_WIDTH;
        const backgroundColor = isObject
            ? data.backgroundColor || SPECIAL_KEY_COLOR
            : DEFAULT_KEY_COLOR;
        const keyPanel = row.addCol({ weight: weight }).addPanel({
            backgroundColor: backgroundColor,
        });
        keyPanel.useBorderlessShader = true;
        if (isObject && data.iconName) {
            const btn = new xb.IconButton({
                text: data.iconName,
                fontSize: FONT_SIZE,
                backgroundColor: 0x00000000,
            });
            btn.onTriggered = () => this.handleSpecialKey(data.type);
            keyPanel.add(btn);
        }
        else {
            const char = typeof data === 'string' ? data : data.text || '';
            const btn = new KeyboardButton({
                text: char,
                fontSize: FONT_SIZE,
                originalKey: char,
                shiftKey: shiftChar,
                backgroundColor: '#00000000',
            });
            this.textButtons.push(btn);
            btn.onTriggered = () => this.handleKeyPress(btn.text);
            keyPanel.add(btn);
        }
    }
    handleKeyPress(char) {
        this.keyText += char;
        this.onTextChanged?.(this.keyText);
        if (this.isShifted) {
            this.isShifted = false;
            this.refreshKeyboard();
        }
    }
    handleSpecialKey(type) {
        switch (type) {
            case 'backspace':
                this.keyText = this.keyText.slice(0, -1);
                break;
            case 'space':
                this.handleKeyPress(' ');
                break;
            case 'shift':
                this.isShifted = !this.isShifted;
                this.refreshKeyboard();
                break;
            case 'shift_lock':
                this.isCapsLockOn = !this.isCapsLockOn;
                this.refreshKeyboard();
                break;
            case 'tab':
                this.handleKeyPress('\t');
                break;
            case 'enter':
                this.onEnterPressed?.(this.keyText);
                break;
            default:
                console.warn(`Unhandled special key type: ${type}`);
        }
        this.onTextChanged?.(this.keyText);
    }
    refreshKeyboard() {
        this.textButtons.forEach((button) => {
            const isLetter = button.originalKey.length === 1 && /[a-z]/i.test(button.originalKey);
            let newText;
            const produceUpper = this.isShifted !== this.isCapsLockOn;
            if (isLetter) {
                newText = produceUpper
                    ? button.originalKey.toUpperCase()
                    : button.originalKey.toLowerCase();
            }
            else {
                newText = this.isShifted
                    ? button.shiftKey || button.originalKey
                    : button.originalKey;
            }
            button.setText(newText);
        });
    }
    setText(text) {
        this.keyText = text;
        this.onTextChanged?.(this.keyText);
    }
}

export { Keyboard };
