import {afterEach, describe, expect, it, vi} from 'vitest';
import {TextInputEditor} from '../internal/TextInputEditor';
import {UITextInput} from './UITextInput';

const editors: TextInputEditor[] = [];
function mount(field: UITextInput) {
  const editor = new TextInputEditor(field, {
    caretAtPoint: () => undefined,
    isReady: () => true,
  });
  editors.push(editor);
  return editor.element;
}
function input(element: HTMLInputElement | HTMLTextAreaElement, value: string) {
  element.value = value;
  element.dispatchEvent(new Event('input'));
}
afterEach(() => {
  for (const editor of editors.splice(0)) editor.dispose();
});

describe('text input value and events', () => {
  it('keeps keyboard suppression until every owner releases it', () => {
    const field = new UITextInput({ariaLabel: 'Message'});
    const element = mount(field);
    const first = field.suppressNativeKeyboard();
    const second = field.suppressNativeKeyboard();
    expect(element.inputMode).toBe('none');
    first();
    expect(field.nativeKeyboardSuppressed).toBe(true);
    second();
    second();
    expect(field.nativeKeyboardSuppressed).toBe(false);
    expect(element.inputMode).toBe('');
  });

  it('reports actual native changes and commits a changed value once on blur', () => {
    const onInput = vi.fn();
    const onChange = vi.fn();
    const field = new UITextInput({
      ariaLabel: 'Message',
      value: 'a',
      onInput,
      onChange,
    });
    const element = mount(field);
    field.focus();
    input(element, 'a');
    input(element, 'ab');
    input(element, 'abc');
    expect(field.value).toBe('abc');
    expect(onInput.mock.calls).toEqual([['ab'], ['abc']]);
    field.blur();
    field.focus();
    field.blur();
    expect(onChange).toHaveBeenCalledExactlyOnceWith('abc');
  });

  it('rebases programmatic changes without emitting user edits', () => {
    const onInput = vi.fn();
    const onChange = vi.fn();
    const field = new UITextInput({ariaLabel: 'Message', onInput, onChange});
    const element = mount(field);
    field.value = 'preset';
    expect(element.value).toBe('preset');
    expect(onInput).not.toHaveBeenCalled();
    field.focus();
    input(element, 'preset typed');
    field.value = 'rebased';
    field.blur();
    expect(element.value).toBe('rebased');
    expect(onInput).toHaveBeenCalledExactlyOnceWith('preset typed');
    expect(onChange).not.toHaveBeenCalled();
  });

  it('submits without clearing or committing until blur', () => {
    const onSubmit = vi.fn();
    const onChange = vi.fn();
    const field = new UITextInput({ariaLabel: 'Search', onSubmit, onChange});
    const element = mount(field);
    field.focus();
    input(element, 'query');
    element.dispatchEvent(
      new KeyboardEvent('keydown', {key: 'Enter', cancelable: true})
    );
    expect(onSubmit).toHaveBeenCalledExactlyOnceWith('query');
    expect(field.value).toBe('query');
    expect(onChange).not.toHaveBeenCalled();
    field.blur();
    expect(onChange).toHaveBeenCalledExactlyOnceWith('query');
  });

  it('blocks editing when read-only or disabled while allowing programmatic values', () => {
    const field = new UITextInput({
      ariaLabel: 'Message',
      value: 'draft',
      readOnly: true,
    });
    mount(field);
    field.insertText('blocked');
    expect(field.value).toBe('draft');
    field.value = 'preset';
    expect(field.value).toBe('preset');
    field.readOnly = false;
    field.setSelectionRange(0, 6);
    field.insertText('editable');
    expect(field.value).toBe('editable');
    field.disabled = true;
    expect(field.pressKey('x')).toBe(false);
    expect(field.value).toBe('editable');
  });

  it('preserves the draft and releases focus when its backend is disposed', () => {
    const onChange = vi.fn();
    const field = new UITextInput({ariaLabel: 'Message', onChange});
    const element = mount(field);
    field.focus();
    input(element, 'draft');
    editors[0].dispose();
    expect(field.value).toBe('draft');
    expect(onChange).toHaveBeenCalledExactlyOnceWith('draft');
    expect(field.focused).toBe(false);
    expect(field.ready).toBe(false);
    expect(element.isConnected).toBe(false);
    expect(() => field.insertText('late')).toThrow();
    expect(field.value).toBe('draft');
  });
});
