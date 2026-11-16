import {afterEach, describe, expect, it, vi} from 'vitest';
import {Scene} from 'three';

vi.hoisted(() => {
  vi.stubGlobal('AudioContext', function () {
    return {createGain: () => ({connect: () => {}}), destination: {}};
  });
});

import {UITextInput} from '../../ui/components/UITextInput';
import {UICard} from '../../ui/components/UICard';
import {TextInputEditor} from '../../ui/internal/TextInputEditor';
import {Keyboard} from './Keyboard';

const mounted: TextInputEditor[] = [];

function mount(field: UITextInput, isReady = () => true): TextInputEditor {
  const editor = new TextInputEditor(field, {
    caretAtPoint: () => undefined,
    isReady,
  });
  mounted.push(editor);
  return editor;
}

function typeKeys(keyboard: Keyboard, keys: string): void {
  for (const key of keys) keyboard.pressKey(key);
}

afterEach(() => {
  for (const editor of mounted.splice(0)) editor.dispose();
});

describe('Keyboard bound to a text field', () => {
  it('owns suppression only while the bound keyboard is open and connected', () => {
    const first = new UITextInput({ariaLabel: 'First'});
    const second = new UITextInput({ariaLabel: 'Second'});
    const firstEditor = mount(first);
    const secondEditor = mount(second);
    const keyboard = new Keyboard({input: first, open: false});
    const card = new UICard({
      size: {width: 1, height: 1},
      children: [keyboard],
    });
    new Scene().add(card);
    keyboard.update();
    expect(first.nativeKeyboardSuppressed).toBe(false);
    keyboard.open = true;
    expect(firstEditor.element.inputMode).toBe('none');
    keyboard.input = second;
    expect(firstEditor.element.inputMode).toBe('');
    expect(secondEditor.element.inputMode).toBe('none');
    keyboard.open = false;
    expect(second.nativeKeyboardSuppressed).toBe(false);
    keyboard.open = true;
    keyboard.removeFromParent();
    expect(second.nativeKeyboardSuppressed).toBe(false);
    card.add(keyboard);
    expect(second.nativeKeyboardSuppressed).toBe(true);
    keyboard.dispose();
    expect(second.nativeKeyboardSuppressed).toBe(false);
  });

  it('respects field editing rules and grapheme deletion', () => {
    const field = new UITextInput({ariaLabel: 'Message', maxLength: 4});
    mount(field);
    const keyboard = new Keyboard({input: field});
    typeKeys(keyboard, 'abcdef');
    expect(field.value).toBe('abcd');
    keyboard.setValue('a👍🏽');
    expect(field.value).toBe('a👍🏽');
    field.setSelectionRange(field.value.length, field.value.length);
    keyboard.pressKey('Backspace');
    expect(field.value).toBe('a');
    field.readOnly = true;
    keyboard.pressKey('z');
    expect(field.value).toBe('a');
    field.readOnly = false;
    field.disabled = true;
    keyboard.pressKey('z');
    expect(field.value).toBe('a');
  });

  it('rebinds between fields and restores the standalone buffer', () => {
    const first = new UITextInput({ariaLabel: 'First'});
    const second = new UITextInput({ariaLabel: 'Second'});
    mount(first);
    mount(second);
    const keyboard = new Keyboard({value: 'standalone'});
    first.onFocus = () => (keyboard.input = first);
    second.onFocus = () => (keyboard.input = second);
    first.focus();
    typeKeys(keyboard, 'one');
    second.focus();
    typeKeys(keyboard, 'two');
    expect(first.value).toBe('one');
    expect(second.value).toBe('two');
    expect(keyboard.value).toBe('two');
    keyboard.input = undefined;
    expect(keyboard.xb?.preserveTextFocus).toBeFalsy();
    expect(keyboard.value).toBe('two');
    keyboard.pressKey('!');
    expect(keyboard.value).toBe('two!');
    expect(second.value).toBe('two');
  });
});
