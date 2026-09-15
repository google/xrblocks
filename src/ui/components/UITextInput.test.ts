import {describe, expect, it, vi} from 'vitest';

import {getSemanticControl} from '../../interaction/SemanticControl';
import {bindTextInput, type TextInputBinding, UITextInput} from './UITextInput';

function fakeBinding(overrides: Partial<TextInputBinding> = {}) {
  let selection = {start: 0, end: 0, direction: 'none' as const};
  const binding: TextInputBinding = {
    isReady: () => true,
    applyValue: vi.fn(),
    applyOptions: vi.fn(),
    getSelection: () => selection,
    setSelectionRange: vi.fn((start, end, direction) => {
      selection = {start, end, direction: direction as 'none'};
    }),
    focus: vi.fn(),
    blur: vi.fn(),
    insertText: vi.fn(),
    pressKey: vi.fn(() => true),
    ...overrides,
  };
  return binding;
}

function mount(field: UITextInput, overrides: Partial<TextInputBinding> = {}) {
  const binding = fakeBinding(overrides);
  return {binding, host: bindTextInput(field, binding)};
}

describe('UITextInput model', () => {
  it('keeps native keyboard suppression until every scoped owner releases it', () => {
    const field = new UITextInput({ariaLabel: 'Message'});
    const {binding} = mount(field);
    const first = field.suppressNativeKeyboard();
    const second = field.suppressNativeKeyboard();
    expect(field.nativeKeyboardSuppressed).toBe(true);
    expect(binding.applyOptions).toHaveBeenCalledOnce();
    first();
    expect(field.nativeKeyboardSuppressed).toBe(true);
    second();
    expect(field.nativeKeyboardSuppressed).toBe(false);
    expect(binding.applyOptions).toHaveBeenCalledTimes(2);
    second();
    expect(binding.applyOptions).toHaveBeenCalledTimes(2);
  });

  it('requires an accessible name and validates retained options', () => {
    expect(() => new UITextInput({ariaLabel: ''})).toThrow(/ariaLabel/);
    expect(() => new UITextInput({ariaLabel: 'A', maxLength: -1})).toThrow(
      /maxLength/
    );
    expect(() => new UITextInput({ariaLabel: 'A', maxLength: 1.5})).toThrow(
      /maxLength/
    );
    expect(() => new UITextInput({ariaLabel: 'A', value: 1 as never})).toThrow(
      /value/
    );
    const field = new UITextInput({ariaLabel: 'Note'});
    expect(field.multiline).toBe(false);
    expect(field.maxLength).toBeUndefined();
    expect(
      new UITextInput({ariaLabel: 'Note', multiline: true}).multiline
    ).toBe(true);
    expect(field.value).toBe('');
    expect(field.ready).toBe(false);
    expect(field.focused).toBe(false);
    expect('text' in field).toBe(false);
  });

  it('emits onInput only for real native changes and onChange once per blur', () => {
    const onInput = vi.fn();
    const onChange = vi.fn();
    const onFocus = vi.fn();
    const onBlur = vi.fn();
    const field = new UITextInput({
      ariaLabel: 'Message',
      value: 'a',
      onInput,
      onChange,
      onFocus,
      onBlur,
    });
    const {host} = mount(field);
    host.notifyFocus();
    host.notifyFocus();
    expect(onFocus).toHaveBeenCalledOnce();
    host.notifyInput('a');
    expect(onInput).not.toHaveBeenCalled();
    host.notifyInput('ab');
    host.notifyInput('abc');
    expect(onInput).toHaveBeenCalledTimes(2);
    expect(onInput).toHaveBeenLastCalledWith('abc');
    expect(field.value).toBe('abc');
    host.notifyBlur();
    expect(onChange).toHaveBeenCalledExactlyOnceWith('abc');
    expect(onBlur).toHaveBeenCalledOnce();
    host.notifyBlur();
    expect(onBlur).toHaveBeenCalledOnce();
    host.notifyFocus();
    host.notifyBlur();
    expect(onChange).toHaveBeenCalledOnce();
  });

  it('treats programmatic assignment as a silent rebase', () => {
    const onInput = vi.fn();
    const onChange = vi.fn();
    const field = new UITextInput({ariaLabel: 'Message', onInput, onChange});
    const {binding, host} = mount(field);
    field.value = 'preset';
    expect(field.value).toBe('preset');
    expect(binding.applyValue).toHaveBeenCalledWith('preset');
    expect(onInput).not.toHaveBeenCalled();
    host.notifyFocus();
    host.notifyInput('preset typed');
    field.value = 'rebased';
    host.notifyBlur();
    expect(onChange).not.toHaveBeenCalled();
    expect(onInput).toHaveBeenCalledExactlyOnceWith('preset typed');
  });

  it('keeps submit distinct from change and never clears the value', () => {
    const onSubmit = vi.fn();
    const onChange = vi.fn();
    const field = new UITextInput({ariaLabel: 'Search', onSubmit, onChange});
    const {host} = mount(field);
    host.notifyFocus();
    host.notifyInput('query');
    host.notifySubmit();
    expect(onSubmit).toHaveBeenCalledExactlyOnceWith('query');
    expect(field.value).toBe('query');
    expect(onChange).not.toHaveBeenCalled();
    host.notifyBlur();
    expect(onChange).toHaveBeenCalledExactlyOnceWith('query');
  });

  it('requires a ready backend for focus and editing operations', () => {
    const field = new UITextInput({ariaLabel: 'Message'});
    expect(() => field.focus()).toThrow(/mounted/);
    expect(() => field.insertText('a')).toThrow(/mounted/);
    expect(() => field.setSelectionRange(0, 1)).toThrow(/mounted/);
    expect(field.pressKey('a')).toBe(false);
    expect(() => field.blur()).not.toThrow();
    let ready = false;
    const {binding} = mount(field, {isReady: () => ready});
    expect(() => field.focus()).toThrow(/ready/);
    ready = true;
    field.focus();
    expect(binding.focus).toHaveBeenCalledOnce();
    field.setSelectionRange(1, 4, 'forward');
    expect(binding.setSelectionRange).toHaveBeenCalledWith(1, 4, 'forward');
    expect(() => field.setSelectionRange(1.5, 2)).toThrow(/integers/);
    expect(field.selection).toEqual({start: 1, end: 4, direction: 'forward'});
    expect(field.selectionStart).toBe(1);
    expect(field.selectionEnd).toBe(4);
    expect(field.selectionDirection).toBe('forward');
  });

  it('mirrors disabled and readOnly semantics without blocking assignment', () => {
    const field = new UITextInput({ariaLabel: 'Message', readOnly: true});
    const {binding} = mount(field);
    const control = getSemanticControl(field)!;
    expect(control.kind).toBe('input');
    expect(control.isDisabled()).toBe(false);
    field.insertText('typed');
    expect(binding.insertText).not.toHaveBeenCalled();
    field.value = 'programmatic';
    expect(field.value).toBe('programmatic');
    field.readOnly = false;
    field.insertText('typed');
    expect(binding.insertText).toHaveBeenCalledWith('typed');
    field.disabled = true;
    expect(control.isDisabled()).toBe(true);
    expect(field.pressKey('a')).toBe(false);
    field.focus();
    expect(binding.focus).not.toHaveBeenCalled();
    expect(binding.applyOptions).toHaveBeenCalled();
  });

  it('delegates pointer capture and scroll state to the backend', () => {
    const field = new UITextInput({ariaLabel: 'Message', multiline: true});
    const scroll = {
      getOffset: () => 12,
      getViewportHeight: () => 40,
      projectPoint: () => undefined,
      scrollBy: () => false,
    };
    const begin = vi.fn();
    const update = vi.fn();
    const complete = vi.fn();
    const cancel = vi.fn();
    mount(field, {begin, update, complete, cancel, getScroll: () => scroll});
    const control = getSemanticControl(field)!;
    const input = {
      source: {} as never,
      point: {x: 0, y: 0, z: 0} as never,
    };
    control.begin?.(input);
    control.update?.(input);
    control.complete?.();
    control.cancel?.();
    expect(begin).toHaveBeenCalledWith(input);
    expect(update).toHaveBeenCalledWith(input);
    expect(complete).toHaveBeenCalledOnce();
    expect(cancel).toHaveBeenCalledOnce();
    expect(control.scroll?.getOffset()).toBe(12);
  });

  it('releases state when a backend unbinds while focused', () => {
    const onBlur = vi.fn();
    const onChange = vi.fn();
    const field = new UITextInput({ariaLabel: 'Message', onBlur, onChange});
    const {host} = mount(field);
    host.notifyFocus();
    host.notifyInput('typed');
    host.unbind();
    expect(onChange).toHaveBeenCalledExactlyOnceWith('typed');
    expect(onBlur).toHaveBeenCalledOnce();
    expect(field.focused).toBe(false);
    expect(field.ready).toBe(false);
    expect(field.value).toBe('typed');
    expect(() => bindTextInput(field, fakeBinding())).not.toThrow();
  });

  it('rejects a second concurrent backend', () => {
    const field = new UITextInput({ariaLabel: 'Message'});
    mount(field);
    expect(() => bindTextInput(field, fakeBinding())).toThrow(/already/);
  });
});
