import type {SelectEvent} from '../../core/Script';
import {
  registerSemanticControl,
  type SemanticControlInput,
} from '../../interaction/SemanticControl';
import {clamp} from '../../utils/utils';
import {UIElement, type UIElementOptions} from '../UIElement';

export interface UISliderOptions extends UIElementOptions {
  ariaLabel: string;
  min?: number;
  max?: number;
  step?: number;
  value?: number;
  disabled?: boolean;
  onInput?: (value: number) => void;
  onChange?: (value: number) => void;
}

/** A horizontal slider with one exclusive captured interaction. */
export class UISlider extends UIElement {
  name = 'UISlider';
  readonly ariaLabel: string;
  onInput?: (value: number) => void;
  onChange?: (value: number) => void;

  private _min: number;
  private _max: number;
  private _step: number;
  private _value: number;
  private _disabled: boolean;
  private interactionStart?: number;
  private interactionChanged = false;

  constructor({
    ariaLabel,
    min = 0,
    max = 1,
    step = 0.01,
    value = 0,
    disabled = false,
    onInput,
    onChange,
    ...options
  }: UISliderOptions) {
    if (!ariaLabel) throw new Error('UISlider requires ariaLabel.');
    if (typeof disabled !== 'boolean') {
      throw new Error('UISlider disabled must be a boolean.');
    }
    validateRange(min, max, step);
    validateValue(value);
    super('slider', options);
    this.ariaLabel = ariaLabel;
    this._min = min;
    this._max = max;
    this._step = step;
    this._value = quantize(value, min, max, step);
    this._disabled = disabled;
    this.onInput = onInput;
    this.onChange = onChange;

    registerSemanticControl(this, {
      kind: 'slider',
      isDisabled: () => this._disabled,
      activate: () => {},
      begin: (input) => this.beginInput(input),
      update: (input) => this.updateInput(input),
      complete: () => this.completeInput(),
      cancel: () => this.cancelInput(),
    });
  }

  get min(): number {
    return this._min;
  }

  set min(value: number) {
    validateRange(value, this._max, this._step);
    this._min = value;
    this.requantizeInteraction();
  }

  get max(): number {
    return this._max;
  }

  set max(value: number) {
    validateRange(this._min, value, this._step);
    this._max = value;
    this.requantizeInteraction();
  }

  get step(): number {
    return this._step;
  }

  set step(value: number) {
    validateRange(this._min, this._max, value);
    this._step = value;
    this.requantizeInteraction();
  }

  get value(): number {
    return this._value;
  }

  set value(value: number) {
    this.setProgrammaticValue(value);
  }

  get disabled(): boolean {
    return this._disabled;
  }

  set disabled(value: boolean) {
    if (typeof value !== 'boolean') {
      throw new Error('UISlider disabled must be a boolean.');
    }
    if (value === this._disabled) return;
    this._disabled = value;
    this.markUIDirty();
  }

  onObjectSelectStart(_event: SelectEvent): true {
    return true;
  }

  onObjectSelectEnd(_event: SelectEvent): true {
    return true;
  }

  private beginInput(input: SemanticControlInput): void {
    this.interactionStart = this._value;
    this.interactionChanged = false;
    this.updateInput(input);
  }

  private updateInput(input: SemanticControlInput): void {
    const ratio = clamp(input.uv?.x ?? 0.5, 0, 1);
    const next = quantize(
      this._min + ratio * (this._max - this._min),
      this._min,
      this._max,
      this._step
    );
    if (next === this._value) return;
    this._value = next;
    this.interactionChanged = true;
    this.markUIDirty();
    this.onInput?.(next);
  }

  private completeInput(): void {
    if (this.interactionStart === undefined) return;
    const changed = this.interactionChanged;
    this.interactionStart = undefined;
    this.interactionChanged = false;
    if (changed) this.onChange?.(this._value);
  }

  private cancelInput(): void {
    if (this.interactionStart === undefined) return;
    const original = this.interactionStart;
    this.interactionStart = undefined;
    this.interactionChanged = false;
    if (original === this._value) return;
    this._value = original;
    this.markUIDirty();
    this.onInput?.(original);
  }

  private setProgrammaticValue(value: number): void {
    validateValue(value);
    const next = quantize(value, this._min, this._max, this._step);
    if (this.interactionStart !== undefined) {
      this.interactionStart = next;
      this.interactionChanged = false;
    }
    if (next === this._value) return;
    this._value = next;
    this.markUIDirty();
  }

  private requantizeInteraction(): void {
    const next = quantize(this._value, this._min, this._max, this._step);
    if (this.interactionStart !== undefined) {
      this.interactionStart = quantize(
        this.interactionStart,
        this._min,
        this._max,
        this._step
      );
      this.interactionChanged = next !== this.interactionStart;
    }
    if (next !== this._value) this._value = next;
    this.markUIDirty();
  }
}

function validateRange(min: number, max: number, step: number): void {
  if (
    !Number.isFinite(min) ||
    !Number.isFinite(max) ||
    !Number.isFinite(step) ||
    min > max ||
    step <= 0
  ) {
    throw new Error(
      'UISlider requires finite values with min <= max and step > 0.'
    );
  }
}

function validateValue(value: number): void {
  if (!Number.isFinite(value)) {
    throw new Error('UISlider value must be finite.');
  }
}

function quantize(
  value: number,
  min: number,
  max: number,
  step: number
): number {
  const stepped = min + Math.round((value - min) / step) * step;
  return clamp(Number(stepped.toPrecision(12)), min, max);
}
