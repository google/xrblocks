import * as THREE from 'three';
import {afterEach, describe, expect, it, vi} from 'vitest';

import {getSemanticControl} from '../../interaction/SemanticControl';
import {UICard} from '../components/UICard';
import {UIText} from '../components/UIText';
import {UITextInput} from '../components/UITextInput';
import {TextInputEditor, type TextInputPresentation} from './TextInputEditor';

const mounted: TextInputEditor[] = [];
const cleanups: Array<() => void> = [];

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
  for (const cleanup of cleanups.splice(0).reverse()) cleanup();
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
    expect(field.pressKey('x')).toBe(false);
    expect(field.value).toBe('に');
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
    const field = new UITextInput({ariaLabel: 'Message', value: 'a👩‍💻b'});
    mount(field);
    field.setSelectionRange(3, 3);
    field.pressKey('Backspace');
    expect(field.value).toBe('ab');
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

  it('places the caret from pointer geometry and drags a selection', () => {
    const field = new UITextInput({ariaLabel: 'Message', value: 'hello world'});
    const caret = (point: THREE.Vector3) => point.x;
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
    cleanups.push(() => {
      uninstall();
      canvas.remove();
      sibling.remove();
    });

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
    expect(press(sibling)).toBe(false);
    uninstall();
    expect(press(canvas)).toBe(false);
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
});
