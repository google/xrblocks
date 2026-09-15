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

describe('Keyboard standalone buffer', () => {
  it('does not inspect ancestor visibility without a bound field', () => {
    const keyboard = new Keyboard();
    const scene = new Scene();
    const card = new UICard({size: {width: 1, height: 1}});
    scene.add(card);
    const readVisibility = vi.fn(() => true);
    Object.defineProperty(scene, 'visible', {get: readVisibility});
    card.add(keyboard);
    keyboard.update();
    keyboard.open = false;
    keyboard.open = true;
    keyboard.pressKey('a');
    expect(keyboard.value).toBe('a');
    expect(readVisibility).not.toHaveBeenCalled();
    keyboard.dispose();
  });

  it('keeps its own value, modifiers, and callbacks', () => {
    const onValueChange = vi.fn();
    const onSubmit = vi.fn();
    const keyboard = new Keyboard({value: 'x', onValueChange, onSubmit});
    expect(keyboard.value).toBe('x');
    expect(keyboard.input).toBeUndefined();
    expect(keyboard.xb?.preserveTextFocus).toBeFalsy();
    expect(keyboard.pressKey('Shift')).toBe(true);
    expect(keyboard.pressKey('a')).toBe(true);
    expect(keyboard.value).toBe('xA');
    keyboard.pressKey('1');
    expect(keyboard.value).toBe('xA1');
    keyboard.pressKey('CapsLock');
    keyboard.pressKey('b');
    expect(keyboard.value).toBe('xA1B');
    keyboard.pressKey('CapsLock');
    keyboard.pressKey(' ');
    keyboard.pressKey('Tab');
    expect(keyboard.value).toBe('xA1B \t');
    keyboard.pressKey('Backspace');
    expect(keyboard.value).toBe('xA1B ');
    expect(onValueChange).toHaveBeenLastCalledWith('xA1B ');
    keyboard.pressKey('Enter');
    expect(onSubmit).toHaveBeenCalledExactlyOnceWith('xA1B ');
    expect(keyboard.value).toBe('xA1B ');
    keyboard.setValue('reset');
    expect(keyboard.value).toBe('reset');
    expect(onValueChange).toHaveBeenLastCalledWith('xA1B ');
    expect(keyboard.pressKey('ArrowLeft')).toBe(false);
  });
});

describe('Keyboard bound to a text field', () => {
  it('requests no native keyboard before first focus and keeps accessory keys focused', () => {
    const field = new UITextInput({ariaLabel: 'Message'});
    const editor = mount(field);
    const keyboard = new Keyboard({input: field});
    const card = new UICard({
      size: {width: 1, height: 1},
      children: [keyboard],
    });
    new Scene().add(card);
    keyboard.update();
    const modes: string[] = [];
    const focus = vi.spyOn(editor.element, 'focus');
    editor.element.addEventListener('focus', () =>
      modes.push(editor.element.inputMode)
    );
    keyboard.pressKey('a');
    const accessory = keyboard.children[0].children[0];
    TextInputEditor.handlePointerTarget(accessory);
    keyboard.pressKey('b');
    TextInputEditor.handlePointerTarget(accessory);
    keyboard.pressKey('c');
    expect(field.value).toBe('abc');
    expect(modes).toEqual(['none']);
    expect(focus).toHaveBeenCalledOnce();
    expect(field.focused).toBe(true);
    keyboard.dispose();
  });

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

  it('does not toggle keyboard policy during asynchronous glyph updates', () => {
    let ready = true;
    const field = new UITextInput({ariaLabel: 'Message'});
    const editor = mount(field, () => ready);
    const keyboard = new Keyboard({input: field});
    const card = new UICard({
      size: {width: 1, height: 1},
      children: [keyboard],
    });
    new Scene().add(card);
    keyboard.update();
    expect(editor.element.inputMode).toBe('none');
    ready = false;
    keyboard.update();
    expect(editor.element.inputMode).toBe('none');
    ready = true;
    keyboard.update();
    expect(editor.element.inputMode).toBe('none');
    card.visible = false;
    keyboard.update();
    expect(editor.element.inputMode).toBe('');
    keyboard.dispose();
  });

  it('forwards edits to the field and reads the field value', () => {
    const onValueChange = vi.fn();
    const onSubmit = vi.fn();
    const onInput = vi.fn();
    const fieldSubmit = vi.fn();
    const field = new UITextInput({
      ariaLabel: 'Message',
      onInput,
      onSubmit: fieldSubmit,
    });
    mount(field);
    const keyboard = new Keyboard({input: field, onValueChange, onSubmit});
    expect(keyboard.input).toBe(field);
    expect(keyboard.xb?.preserveTextFocus).toBe(true);
    typeKeys(keyboard, 'hi');
    expect(field.value).toBe('hi');
    expect(keyboard.value).toBe('hi');
    expect(onInput).toHaveBeenLastCalledWith('hi');
    expect(onValueChange).not.toHaveBeenCalled();
    keyboard.pressKey('Shift');
    keyboard.pressKey('1');
    expect(field.value).toBe('hi!');
    keyboard.pressKey('Backspace');
    expect(field.value).toBe('hi');
    keyboard.pressKey('Enter');
    expect(fieldSubmit).toHaveBeenCalledExactlyOnceWith('hi');
    expect(onSubmit).not.toHaveBeenCalled();
    expect(field.value).toBe('hi');
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

  it('inserts newlines in multiline fields and navigates with Tab', () => {
    const first = new UITextInput({ariaLabel: 'First', multiline: true});
    const second = new UITextInput({ariaLabel: 'Second'});
    mount(first);
    mount(second);
    const keyboard = new Keyboard({input: first});
    first.focus();
    keyboard.pressKey('a');
    keyboard.pressKey('Enter');
    keyboard.pressKey('b');
    expect(first.value).toBe('a\nb');
    keyboard.pressKey('Tab');
    expect(second.focused).toBe(true);
    expect(first.value).toBe('a\nb');
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

  it('ignores keys while a bound field has no usable mount', () => {
    const field = new UITextInput({ariaLabel: 'Message'});
    const keyboard = new Keyboard({input: field});
    expect(() => keyboard.pressKey('a')).not.toThrow();
    expect(field.value).toBe('');
    expect(keyboard.value).toBe('');
  });
});
