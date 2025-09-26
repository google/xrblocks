import * as xb from 'xrblocks';

/**
 * This script defines a virtual keyboard component (gBoard) for XR
 * environments using the XR Blocks SDK. It creates a responsive keyboard UI
 * with alphabetic keys, a backspace, and an enter key.
 */
const COLUMN_WEIGHT = 0.074;
const ROW_TOP_PADDING = 0.04;
const COLUMN_LEFT_PADDING = 0.02;
const FONT_SIZE = 0.45;
const KEYBOARD_COLOR = '#060606';
const DEFAULT_KEY_COLOR = '#121212';
const SPECIAL_KEY_COLOR = '#292929';
const KEY_LAYOUT = [
    {
        textKeys: '`1234567890-+',
        shiftKeys: '~!@#$%^&*()_+',
        specialKeys: [],
    },
    {
        textKeys: 'qwertyuiop',
        specialKeys: [
            {
                position: 'left',
                type: 'tab',
                iconName: 'keyboard_tab',
                weight: COLUMN_WEIGHT * 1.2,
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
                weight: COLUMN_WEIGHT * 1.5,
            },
            {
                position: 'right',
                type: 'enter',
                iconName: 'keyboard_return',
                backgroundColor: '#449eb9',
            },
        ],
    },
    {
        textKeys: 'zxcvbnm,.',
        shiftKeys: 'ZXCVBNM/?',
        specialKeys: [
            {
                position: 'left',
                type: 'shift',
                iconName: 'keyboard_capslock',
                weight: COLUMN_WEIGHT * 2.1,
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
                weight: COLUMN_WEIGHT * 9,
            },
        ],
    },
];
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
        this.onEnterPressed = null;
        this.onTextChanged = null;
        this.keyRows = [];
        this.subspace =
            new xb.SpatialPanel({ useDefaultPosition: false, showEdge: false });
        this.subspace.isRoot = true;
        this.add(this.subspace);
        this.mainPanel =
            this.subspace.add(new xb.Panel({ backgroundColor: KEYBOARD_COLOR }));
        this.mainGrid = new xb.Grid();
        this.mainPanel.add(this.mainGrid);
        this.mainGrid.addRow({ weight: ROW_TOP_PADDING });
        this.createKeyboard();
        this.subspace.updateLayouts();
    }
    init() {
        xb.core.renderer.localClippingEnabled = true;
        this.subspace.position.set(0, 1.2, -1);
    }
    getText() {
        return this.keyText;
    }
    setText(newText) {
        this.keyText = newText;
        if (this.onTextChanged) {
            this.onTextChanged(this.keyText);
        }
    }
    clearText() {
        this.keyText = '';
        if (this.onTextChanged) {
            this.onTextChanged(this.keyText);
        }
    }
    createKeyboard() {
        this.keyRows = [];
        const dynamicRowWeight = 0.93 / KEY_LAYOUT.length;
        KEY_LAYOUT.forEach((rowData) => this.createRow(rowData, this.mainGrid, dynamicRowWeight));
    }
    createRow(rowData, parentGrid, rowWeight) {
        const row = parentGrid.addRow({ weight: rowWeight });
        row.addCol({ weight: COLUMN_LEFT_PADDING });
        this.keyRows.push(row);
        const textKeys = rowData.textKeys ? rowData.textKeys.split('') : [];
        const shiftKeys = rowData.shiftKeys ? rowData.shiftKeys.split('') : [];
        const specialKeys = rowData.specialKeys || [];
        const TARGET_COLUMN_WEIGHT = 12 * COLUMN_WEIGHT;
        if (textKeys.length === 0) {
            let currentColumnWeight = 0;
            row.addCol({ weight: 0.145 });
            specialKeys.forEach(key => {
                currentColumnWeight += key.weight || COLUMN_WEIGHT;
            });
            const missingWeight = TARGET_COLUMN_WEIGHT - currentColumnWeight;
            if (missingWeight > 1) {
                const leftKeys = specialKeys.filter(key => key.position === 'left');
                const rightKeys = specialKeys.filter(key => key.position === 'right');
                const weightForLeftKeys = (missingWeight / 3) / (leftKeys.length || 1);
                const weightForRightKeys = (missingWeight * 2 / 3) / (rightKeys.length || 1);
                specialKeys.forEach(key => {
                    let finalWeight = key.weight || COLUMN_WEIGHT;
                    if (key.position === 'left') {
                        finalWeight += weightForLeftKeys;
                    }
                    else if (key.position === 'right') {
                        finalWeight += weightForRightKeys;
                    }
                    this.createSpecialButtons(row, { ...key, weight: finalWeight });
                });
            }
            else {
                specialKeys.forEach(key => this.createSpecialButtons(row, key));
            }
            return;
        }
        const leftSpecialKeys = specialKeys.filter(key => key.position === 'left');
        const rightSpecialKeys = specialKeys.filter(key => key.position === 'right');
        let remainingWeight = TARGET_COLUMN_WEIGHT;
        leftSpecialKeys.forEach(key => {
            this.createSpecialButtons(row, key);
            remainingWeight -= key.weight;
        });
        textKeys.forEach((key, index) => {
            const shiftKey = shiftKeys[index];
            this.createTextButtons(row, key, shiftKey);
            remainingWeight -= COLUMN_WEIGHT;
        });
        rightSpecialKeys.forEach(key => {
            const finalWeight = (key.weight || COLUMN_WEIGHT) + remainingWeight;
            this.createSpecialButtons(row, { ...key, weight: finalWeight });
        });
    }
    createTextButtons(row, key, shiftKey) {
        const keyPanel = row.addCol({ weight: COLUMN_WEIGHT }).addPanel({
            backgroundColor: DEFAULT_KEY_COLOR,
        });
        const textButton = new KeyboardButton({
            text: key,
            fontSize: FONT_SIZE,
            backgroundColor: DEFAULT_KEY_COLOR,
            originalKey: key,
            shiftKey: shiftKey
        });
        keyPanel.add(textButton);
        this.textButtons.push(textButton);
        textButton.onTriggered = () => {
            this.handleKeyPress(textButton.text);
        };
    }
    createSpecialButtons(row, key) {
        const finalWeight = key.weight || COLUMN_WEIGHT;
        const backgroundColor = key.backgroundColor || SPECIAL_KEY_COLOR;
        const keyPanel = row.addCol({ weight: finalWeight }).addPanel({
            backgroundColor: backgroundColor,
        });
        if (key.type !== 'space') {
            const btn = keyPanel.add(new xb.IconButton({
                text: key.iconName,
                fontSize: FONT_SIZE,
                backgroundColor: backgroundColor,
                paddingZ: 0.05,
                opacity: 0,
            }));
            btn.onTriggered = () => {
                this.handleSpecialKey(key.type);
            };
        }
        keyPanel.onTriggered = () => {
            this.handleSpecialKey(key.type);
        };
    }
    handleSpecialKey(type) {
        switch (type) {
            case 'backspace':
                this.handleBackspace();
                break;
            case 'enter':
                this.handleEnter();
                break;
            case 'shift':
                this.isShifted = !this.isShifted;
                this.refreshKeyboard();
                break;
            case 'shift_lock':
                this.isCapsLockOn = !this.isCapsLockOn;
                this.refreshKeyboard();
                break;
            case 'space':
                this.handleKeyPress(' ');
                break;
        }
    }
    handleBackspace() {
        this.keyText = this.keyText.slice(0, -1);
        if (this.onTextChanged)
            this.onTextChanged(this.keyText);
    }
    handleEnter() {
        if (this.onEnterPressed) {
            this.onEnterPressed(this.keyText);
        }
    }
    refreshKeyboard() {
        this.textButtons.forEach(button => {
            const isLetter = button.originalKey.length === 1 && button.originalKey.match(/[a-z]/i);
            let newText;
            const produceUpper = this.isShifted !== this.isCapsLockOn;
            if (isLetter) {
                newText = produceUpper ? button.originalKey.toUpperCase() :
                    button.originalKey.toLowerCase();
            }
            else {
                newText = this.isShifted ? (button.shiftKey || button.originalKey) :
                    button.originalKey;
            }
            button.setText(newText);
        });
    }
    handleKeyPress(char) {
        this.keyText += char;
        if (this.onTextChanged)
            this.onTextChanged(this.keyText);
        console.log('Key pressed. Sentence: ', this.keyText);
        if (this.isShifted) {
            this.isShifted = false;
            this.refreshKeyboard();
        }
    }
}

export { Keyboard };
