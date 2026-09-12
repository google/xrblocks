import * as THREE from 'three';
import {afterEach, describe, expect, it, vi} from 'vitest';

import {getSemanticControl} from '../../interaction/SemanticControl';
import {UICard} from '../components/UICard';
import {UIText} from '../components/UIText';
import {UITextInput} from '../components/UITextInput';
import {TextInputEditor, type TextInputPresentation} from './TextInputEditor';

const mounted: TextInputEditor[] = [];

function mount(
  field: UITextInput,
  presentation: Partial<TextInputPresentation> = {}
): TextInputEditor {
  const editor = new TextInputEditor(field, {
    caretAtPoint: () => undefined,
    isReady: () => true,
    ...presentation,
  });
  mounted.push(editor);
  return editor;
}

function type(editor: TextInputEditor, value: string): void {
  editor.element.value = value;
  editor.element.dispatchEvent(new Event('input'));
}

function keyDown(
  editor: TextInputEditor,
  init: KeyboardEventInit
): KeyboardEvent {
  const event = new KeyboardEvent('keydown', {cancelable: true, ...init});
  editor.element.dispatchEvent(event);
  return event;
}

afterEach(() => {
  for (const editor of mounted.splice(0)) editor.dispose();
});

describe('TextInputEditor native binding', () => {
  it('rejects a duplicate backend without leaking a native element', () => {
    const field = new UITextInput({ariaLabel: 'Unique field'});
    const editor = mount(field);
    const selector = 'input[aria-label="Unique field"]';
    try {
      expect(() => mount(field)).toThrow(
        'UITextInput already has a native editing backend.'
      );
      expect(document.querySelectorAll(selector)).toHaveLength(1);
      field.focus();
      type(editor, 'still editable');
      expect(field.value).toBe('still editable');
    } finally {
      for (const element of document.querySelectorAll(selector))
        element.remove();
    }
  });

  it('suppresses the software keyboard without making native editing read-only', () => {
    const field = new UITextInput({ariaLabel: 'Message', multiline: true});
    const release = field.suppressNativeKeyboard();
    const editor = mount(field);
    expect(editor.element.inputMode).toBe('none');
    expect(editor.element.getAttribute('virtualkeyboardpolicy')).toBe('manual');
    expect(editor.element.readOnly).toBe(false);
    field.focus();
    type(editor, 'A native edit');
    expect(field.value).toBe('A native edit');
    release();
    expect(editor.element.inputMode).toBe('');
    expect(editor.element.hasAttribute('virtualkeyboardpolicy')).toBe(false);
  });

  it('hides an already-open platform keyboard once when suppression starts', () => {
    const descriptor = Object.getOwnPropertyDescriptor(
      navigator,
      'virtualKeyboard'
    );
    const hide = vi.fn();
    Object.defineProperty(navigator, 'virtualKeyboard', {
      configurable: true,
      value: {hide},
    });
    try {
      const field = new UITextInput({ariaLabel: 'Message'});
      const editor = mount(field);
      field.focus();
      const release = field.suppressNativeKeyboard();
      expect(hide).toHaveBeenCalledOnce();
      expect(field.focused).toBe(true);
      editor.sync();
      editor.sync();
      expect(hide).toHaveBeenCalledOnce();
      release();
      expect(hide).toHaveBeenCalledOnce();
    } finally {
      if (descriptor)
        Object.defineProperty(navigator, 'virtualKeyboard', descriptor);
      else Reflect.deleteProperty(navigator, 'virtualKeyboard');
    }
  });

  it('does not leave a broken cluster when a caret lies inside a joined emoji', () => {
    const field = new UITextInput({
      ariaLabel: 'Message',
      value: 'a\u{1f469}\u200d\u{1f4bb}b',
    });
    mount(field);
    field.setSelectionRange(3, 3);
    field.pressKey('Backspace');
    expect(field.value).toBe('ab');
    expect(field.selectionStart).toBe(1);
  });

  it('normalizes native line endings and preserves a clamped programmatic selection', () => {
    const single = new UITextInput({ariaLabel: 'Title', value: 'a\r\nb'});
    const editor = mount(single);
    expect(single.value).toBe('ab');
    expect(editor.element.value).toBe('ab');
    single.setSelectionRange(1, 1);
    single.insertText('\nX\r');
    expect(single.value).toBe('aXb');
    expect(single.selectionStart).toBe(2);
    single.value = 'q';
    expect(single.selectionStart).toBe(1);
    single.setSelectionRange(1, 0);
    expect(single.selection).toMatchObject({start: 0, end: 0});
    const multiline = new UITextInput({
      ariaLabel: 'Body',
      multiline: true,
      value: 'a\r\nb\rc',
    });
    const multiEditor = mount(multiline);
    expect(multiline.value).toBe('a\nb\nc');
    expect(multiEditor.element.value).toBe(multiline.value);
  });

  it('keeps IME events away from visual navigation and virtual editing', () => {
    const field = new UITextInput({ariaLabel: 'Body', multiline: true});
    const handleKeyDown = vi.fn(() => true);
    const editor = mount(field, {handleKeyDown});
    editor.element.dispatchEvent(new CompositionEvent('compositionstart'));
    type(editor, '\u306b');
    keyDown(editor, {key: 'ArrowDown'});
    expect(handleKeyDown).not.toHaveBeenCalled();
    expect(field.pressKey('x')).toBe(false);
    expect(field.value).toBe('\u306b');
    editor.element.dispatchEvent(new CompositionEvent('compositionend'));
    keyDown(editor, {key: 'ArrowDown'});
    expect(handleKeyDown).toHaveBeenCalledOnce();
  });

  it('exposes renderer failures and skips not-ready fields in native tab order', () => {
    const field = new UITextInput({ariaLabel: 'Body'});
    const error = new Error('Font loading failed');
    let ready = false;
    const editor = mount(field, {isReady: () => ready, getError: () => error});
    expect(field.error).toBe(error);
    expect(editor.element.tabIndex).toBe(-1);
    ready = true;
    editor.sync();
    expect(editor.element.tabIndex).toBe(0);
  });

  it('creates the element the field kind requires and mirrors options', () => {
    const single = mount(
      new UITextInput({ariaLabel: 'Search', value: 'hello', maxLength: 8})
    );
    const field = new UITextInput({
      ariaLabel: 'Message',
      multiline: true,
      placeholder: 'Write here',
      readOnly: true,
    });
    const multi = mount(field);
    expect(single.element.tagName).toBe('INPUT');
    expect(single.element.value).toBe('hello');
    expect(single.element.maxLength).toBe(8);
    expect(multi.element.tagName).toBe('TEXTAREA');
    expect(multi.element.placeholder).toBe('Write here');
    expect(multi.element.readOnly).toBe(true);
    expect(multi.element.getAttribute('aria-label')).toBe('Message');
    expect(document.body.contains(multi.element)).toBe(true);
    field.placeholder = 'Updated';
    field.readOnly = false;
    field.maxLength = 3;
    expect(multi.element.placeholder).toBe('Updated');
    expect(multi.element.readOnly).toBe(false);
    expect(multi.element.maxLength).toBe(3);
  });

  it('reports native edits and focus transitions to the field', () => {
    const onInput = vi.fn();
    const onChange = vi.fn();
    const field = new UITextInput({ariaLabel: 'Message', onInput, onChange});
    const editor = mount(field);
    editor.element.focus();
    expect(field.focused).toBe(true);
    expect(field.ready).toBe(true);
    type(editor, 'typed');
    expect(field.value).toBe('typed');
    expect(onInput).toHaveBeenCalledExactlyOnceWith('typed');
    editor.element.blur();
    expect(field.focused).toBe(false);
    expect(onChange).toHaveBeenCalledExactlyOnceWith('typed');
  });

  it('submits on Enter per field kind and never while composing', () => {
    const onSubmit = vi.fn();
    const single = mount(new UITextInput({ariaLabel: 'Search', onSubmit}));
    const multiSubmit = vi.fn();
    const multi = mount(
      new UITextInput({
        ariaLabel: 'Message',
        multiline: true,
        onSubmit: multiSubmit,
      })
    );
    const enter = keyDown(single, {key: 'Enter'});
    expect(onSubmit).toHaveBeenCalledOnce();
    expect(enter.defaultPrevented).toBe(true);

    const plain = keyDown(multi, {key: 'Enter'});
    expect(multiSubmit).not.toHaveBeenCalled();
    expect(plain.defaultPrevented).toBe(false);
    keyDown(multi, {key: 'Enter', ctrlKey: true});
    keyDown(multi, {key: 'Enter', metaKey: true});
    expect(multiSubmit).toHaveBeenCalledTimes(2);

    single.element.dispatchEvent(new CompositionEvent('compositionstart'));
    keyDown(single, {key: 'Enter'});
    expect(onSubmit).toHaveBeenCalledOnce();
    single.element.dispatchEvent(new CompositionEvent('compositionend'));
    keyDown(single, {key: 'Enter'});
    expect(onSubmit).toHaveBeenCalledTimes(2);
  });

  it('reports composed text and ignores Enter flagged as composing', () => {
    const onInput = vi.fn();
    const onSubmit = vi.fn();
    const field = new UITextInput({ariaLabel: 'Message', onInput, onSubmit});
    const editor = mount(field);
    editor.element.focus();
    editor.element.dispatchEvent(new CompositionEvent('compositionstart'));
    type(editor, 'に');
    expect(onInput).toHaveBeenCalledExactlyOnceWith('に');
    keyDown(editor, {key: 'Enter', isComposing: true});
    expect(onSubmit).not.toHaveBeenCalled();
    editor.element.value = '日本';
    editor.element.dispatchEvent(new CompositionEvent('compositionend'));
    expect(field.value).toBe('日本');
    expect(onInput).toHaveBeenLastCalledWith('日本');
  });

  it('blurs on Escape while keeping typed data', () => {
    const onChange = vi.fn();
    const field = new UITextInput({ariaLabel: 'Message', onChange});
    const editor = mount(field);
    editor.element.focus();
    type(editor, 'draft');
    const escape = keyDown(editor, {key: 'Escape'});
    expect(escape.defaultPrevented).toBe(true);
    expect(field.focused).toBe(false);
    expect(field.value).toBe('draft');
    expect(onChange).toHaveBeenCalledExactlyOnceWith('draft');
  });

  it('lets a presentation own wrapped-line keys before editor defaults', () => {
    const onSubmit = vi.fn();
    const handleKeyDown = vi.fn(() => true);
    const editor = mount(new UITextInput({ariaLabel: 'Search', onSubmit}), {
      handleKeyDown,
    });
    keyDown(editor, {key: 'Enter'});
    expect(handleKeyDown).toHaveBeenCalledOnce();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('replaces selections and honors maxLength for narrow edits', () => {
    const field = new UITextInput({ariaLabel: 'Message', value: 'hello world'});
    const editor = mount(field);
    field.setSelectionRange(0, 5);
    field.insertText('goodbye');
    expect(field.value).toBe('goodbye world');
    expect(editor.element.selectionStart).toBe(7);
    field.maxLength = 15;
    field.setSelectionRange(13, 13);
    field.insertText('!!!!!');
    expect(field.value).toBe('goodbye world!!');
    field.maxLength = undefined;
    field.insertText('?');
    expect(field.value).toBe('goodbye world!!?');
  });

  it('deletes whole grapheme clusters for virtual Backspace', () => {
    const field = new UITextInput({ariaLabel: 'Message'});
    mount(field);
    for (const value of ['a👍🏽', 'a👨‍👩‍👧', 'ae\u0301', 'a𝔘']) {
      field.value = value;
      field.setSelectionRange(value.length, value.length);
      expect(field.pressKey('Backspace')).toBe(true);
      expect(field.value).toBe('a');
    }
    field.setSelectionRange(1, 1);
    expect(field.pressKey('Backspace')).toBe(true);
    expect(field.value).toBe('');
    expect(field.pressKey('Backspace')).toBe(false);
    field.value = '👍🏽x';
    field.setSelectionRange(0, 0);
    expect(field.pressKey('Delete')).toBe(true);
    expect(field.value).toBe('x');
  });

  it('applies virtual keys per field kind without a second buffer', () => {
    const onSubmit = vi.fn();
    const single = new UITextInput({ariaLabel: 'Search', onSubmit});
    mount(single);
    expect(single.pressKey('a')).toBe(true);
    expect(single.pressKey('👍')).toBe(true);
    expect(single.pressKey('ArrowLeft')).toBe(false);
    expect(single.value).toBe('a👍');
    expect(single.pressKey('Enter')).toBe(true);
    expect(onSubmit).toHaveBeenCalledExactlyOnceWith('a👍');
    expect(single.value).toBe('a👍');

    const multiSubmit = vi.fn();
    const multi = new UITextInput({
      ariaLabel: 'Message',
      multiline: true,
      onSubmit: multiSubmit,
    });
    mount(multi);
    multi.pressKey('a');
    expect(multi.pressKey('Enter')).toBe(true);
    expect(multi.value).toBe('a\n');
    expect(multiSubmit).not.toHaveBeenCalled();
    expect(multi.pressKey('Enter', {ctrlKey: true})).toBe(true);
    expect(multiSubmit).toHaveBeenCalledOnce();
  });

  it('navigates mounted fields with virtual Tab without trapping focus', () => {
    const first = new UITextInput({ariaLabel: 'First'});
    const second = new UITextInput({ariaLabel: 'Second'});
    const firstEditor = mount(first);
    const secondEditor = mount(second);
    first.focus();
    expect(first.focused).toBe(true);
    expect(first.pressKey('Tab')).toBe(true);
    expect(first.focused).toBe(false);
    expect(second.focused).toBe(true);
    expect(second.pressKey('Tab', {shiftKey: true})).toBe(true);
    expect(first.focused).toBe(true);
    expect(document.activeElement).toBe(firstEditor.element);
    expect(first.pressKey('Tab', {shiftKey: true})).toBe(true);
    expect(first.focused).toBe(false);
    expect(second.pressKey('Tab')).toBe(true);
    expect(second.focused).toBe(false);
    expect(document.activeElement).not.toBe(secondEditor.element);
  });

  it('moves focus between fields and reports each transition once', () => {
    const events: string[] = [];
    const first = new UITextInput({
      ariaLabel: 'First',
      onFocus: () => events.push('first:focus'),
      onBlur: () => events.push('first:blur'),
      onChange: () => events.push('first:change'),
    });
    const second = new UITextInput({
      ariaLabel: 'Second',
      onFocus: () => events.push('second:focus'),
      onBlur: () => events.push('second:blur'),
    });
    const firstEditor = mount(first);
    mount(second);
    first.focus();
    type(firstEditor, 'draft');
    second.focus();
    expect(events).toEqual([
      'first:focus',
      'first:change',
      'first:blur',
      'second:focus',
    ]);
    expect(first.focused).toBe(false);
    expect(second.focused).toBe(true);
  });

  it('places the caret from pointer geometry and drags a selection', () => {
    const field = new UITextInput({ariaLabel: 'Message', value: 'hello world'});
    const caret = vi.fn((point: THREE.Vector3) => point.x);
    const editor = mount(field, {caretAtPoint: caret});
    const control = getSemanticControl(field)!;
    const at = (x: number) => ({
      source: {} as never,
      point: new THREE.Vector3(x, 0, 0),
    });
    control.begin!(at(2));
    expect(field.focused).toBe(true);
    expect(field.selection).toMatchObject({start: 2, end: 2});
    control.update!(at(6));
    expect(field.selection).toEqual({
      start: 2,
      end: 6,
      direction: 'forward',
    });
    control.update!(at(0));
    expect(field.selection).toEqual({
      start: 0,
      end: 2,
      direction: 'backward',
    });
    control.complete!();
    control.update!(at(9));
    expect(field.selection).toMatchObject({start: 0, end: 2});
    expect(editor.element.selectionEnd).toBe(2);
  });

  it('keeps focus only for the field, its descendants, and accessories', () => {
    const field = new UITextInput({ariaLabel: 'Message'});
    const label = new UIText({text: 'Inside'});
    const card = new UICard({size: {width: 1, height: 1}});
    card.add(field);
    field.add(label);
    mount(field);
    const accessory = new THREE.Object3D();
    accessory.xb = {preserveTextFocus: true};
    const accessoryKey = new THREE.Object3D();
    accessory.add(accessoryKey);
    const unrelated = new THREE.Object3D();

    field.focus();
    TextInputEditor.handlePointerTarget(field);
    expect(field.focused).toBe(true);
    TextInputEditor.handlePointerTarget(label);
    expect(field.focused).toBe(true);
    TextInputEditor.handlePointerTarget(accessoryKey);
    expect(field.focused).toBe(true);
    TextInputEditor.handlePointerTarget(unrelated);
    expect(field.focused).toBe(false);

    field.focus();
    TextInputEditor.handlePointerTarget(undefined);
    expect(field.focused).toBe(false);
  });

  it('suppresses the canvas blur default only while a field is focused', () => {
    const canvas = document.createElement('canvas');
    const sibling = document.createElement('button');
    document.body.append(canvas, sibling);
    const uninstall = TextInputEditor.guardCanvas(canvas);
    const bubbled = vi.fn();
    canvas.addEventListener('pointerdown', bubbled);

    const field = new UITextInput({ariaLabel: 'Message'});
    mount(field);
    const press = (target: HTMLElement) => {
      const event = new Event('pointerdown', {
        bubbles: true,
        cancelable: true,
      });
      target.dispatchEvent(event);
      return event.defaultPrevented;
    };
    expect(press(canvas)).toBe(false);
    field.focus();
    expect(press(canvas)).toBe(true);
    expect(bubbled).toHaveBeenCalledTimes(2);
    expect(press(sibling)).toBe(false);
    uninstall();
    uninstall();
    expect(press(canvas)).toBe(false);
    canvas.remove();
    sibling.remove();
  });

  it('releases focus for unavailable, disabled, and disposed fields', () => {
    const onBlur = vi.fn();
    const field = new UITextInput({ariaLabel: 'Message', onBlur});
    const editor = mount(field);
    field.focus();
    editor.sync(false);
    expect(field.focused).toBe(false);
    expect(field.ready).toBe(false);
    expect(editor.element.disabled).toBe(true);
    expect(onBlur).toHaveBeenCalledOnce();
    expect(() => field.focus()).toThrow(/ready/);

    editor.sync(true);
    expect(field.ready).toBe(true);
    field.focus();
    field.disabled = true;
    expect(field.focused).toBe(false);
    expect(editor.element.disabled).toBe(true);
    field.disabled = false;

    field.focus();
    editor.dispose();
    editor.dispose();
    expect(field.focused).toBe(false);
    expect(field.ready).toBe(false);
    expect(document.body.contains(editor.element)).toBe(false);
    expect(onBlur).toHaveBeenCalledTimes(3);
    expect(field.pressKey('a')).toBe(false);
  });

  it('stays unusable until the presentation reports ready geometry', () => {
    let ready = false;
    const field = new UITextInput({ariaLabel: 'Message'});
    mount(field, {isReady: () => ready});
    expect(field.ready).toBe(false);
    expect(field.pressKey('a')).toBe(false);
    expect(() => field.focus()).toThrow(/ready/);
    ready = true;
    expect(field.ready).toBe(true);
    field.focus();
    expect(field.focused).toBe(true);
  });
});
