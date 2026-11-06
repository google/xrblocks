import type * as THREE from 'three';

import type {SelectEvent} from '../../core/Script';
import {registerSemanticControl} from '../../interaction/SemanticControl';
import {objectIsDescendantOf} from '../../utils/SceneGraphUtils';
import {UIElement, type UIElementOptions} from '../UIElement';
import {UIScrollView} from './UIScrollView';

type UIDropdownChoice = Readonly<{
  value: string;
  label: string;
  disabled?: boolean;
}>;

export interface UIDropdownOptions extends Omit<UIElementOptions, 'children'> {
  ariaLabel: string;
  options: ReadonlyArray<{value: string; label: string; disabled?: boolean}>;
  value?: string;
  /** Shown on the closed dropdown while `value` is undefined. */
  placeholder?: string;
  disabled?: boolean;
  onChange?: (value: string) => void;
}

/** List height in UI units before a long option list scrolls. */
const LIST_MAX_HEIGHT = 320;
const openDropdowns = new Map<UIDropdown, () => void>();

/**
 * Closes every open dropdown that does not contain `target`. The UI runtime
 * calls this when any source starts a selection, so pressing another control,
 * a scene object, or empty space closes the list without choosing an option.
 */
export function closeDropdownsOutside(target?: THREE.Object3D): void {
  for (const [dropdown, close] of openDropdowns) {
    if (!objectIsDescendantOf(target, dropdown)) close();
  }
}

/**
 * A button that shows the selected option and opens a list of options below
 * or above itself. Picking an enabled option selects it and closes the list.
 */
export class UIDropdown<
  TEventMap extends THREE.Object3DEventMap = THREE.Object3DEventMap,
> extends UIElement<TEventMap> {
  name = 'UIDropdown';
  readonly ariaLabel: string;
  readonly options: ReadonlyArray<UIDropdownChoice>;
  readonly placeholder: string;
  onChange?: (value: string) => void;
  private _value?: string;
  private _disabled: boolean;
  private _open = false;
  private readonly rows: readonly UIDropdownOption[];
  private readonly list: UIScrollView;
  private revealPending = false;

  constructor({
    ariaLabel,
    options,
    value,
    placeholder = '',
    disabled = false,
    onChange,
    ...elementOptions
  }: UIDropdownOptions) {
    if (!ariaLabel) throw new Error('UIDropdown requires ariaLabel.');
    const choices = validateChoices(options);
    validateValue(choices, value);
    if (typeof placeholder !== 'string') {
      throw new Error('UIDropdown placeholder must be a string.');
    }
    validateDisabled(disabled);
    super('dropdown', elementOptions);
    this.ariaLabel = ariaLabel;
    this.options = choices;
    this.placeholder = placeholder;
    this._value = value;
    this._disabled = disabled;
    this.onChange = onChange;
    this.rows = choices.map(
      (choice) =>
        new UIDropdownOption(
          choice,
          () => this._value === choice.value,
          () => this.pick(choice.value)
        )
    );
    this.list = new UIScrollView({
      ariaLabel,
      visible: false,
      style: {height: 'auto', maxHeight: LIST_MAX_HEIGHT, gap: 0},
      children: [...this.rows],
    });
    super.add(this.list);
    this.addEventListener('removed', this.close);

    registerSemanticControl(this, {
      kind: 'button',
      isDisabled: () => this._disabled,
      activate: () => this.setOpen(!this._open),
    });
  }

  get value(): string | undefined {
    return this._value;
  }

  set value(value: string | undefined) {
    validateValue(this.options, value);
    if (value === this._value) return;
    this._value = value;
    this.markUIDirty();
  }

  get disabled(): boolean {
    return this._disabled;
  }

  set disabled(value: boolean) {
    validateDisabled(value);
    if (value === this._disabled) return;
    this._disabled = value;
    if (value) this.close();
    this.markUIDirty();
  }

  /** Whether the option list is showing. */
  get open(): boolean {
    return this._open;
  }

  override add(..._objects: THREE.Object3D[]): this {
    throw new Error('UIDropdown does not accept children.');
  }

  override attach(_object: THREE.Object3D): this {
    throw new Error('UIDropdown does not accept children.');
  }

  /** Closes a hidden list and scrolls an open one to the chosen option. */
  override update(): void {
    if (!this._open) return;
    if (!isVisibleInTree(this)) this.close();
    else this.revealChosen();
  }

  override dispose(): void {
    this.close();
    super.dispose();
  }

  onObjectSelectStart(event: SelectEvent): void {
    event.stopPropagation();
    event.stopGlobalPropagation();
  }

  onObjectSelectEnd(event: SelectEvent): void {
    event.stopPropagation();
    event.stopGlobalPropagation();
  }

  private readonly close = (): void => this.setOpen(false);

  private setOpen(open: boolean): void {
    if (open === this._open) return;
    this._open = open;
    this.list.visible = open;
    this.revealPending = open;
    this.revealChosen();
    if (open) openDropdowns.set(this, this.close);
    else openDropdowns.delete(this);
    this.markUIDirty();
  }

  /** Scrolls the chosen option into view once the open list has a layout. */
  private revealChosen(): void {
    if (!this.revealPending || !this.list.ready) return;
    this.revealPending = false;
    const row = this.rows.find((row) => row.value === this._value);
    if (row) this.list.reveal(row);
  }

  private pick(value: string): void {
    const changed = value !== this._value;
    this._value = value;
    this.close();
    if (!changed) return;
    this.markUIDirty();
    this.onChange?.(value);
  }
}

/** One option row inside a UIDropdown list. Created by the dropdown. */
export class UIDropdownOption extends UIElement {
  name = 'UIDropdownOption';
  readonly value: string;
  readonly label: string;
  readonly disabled: boolean;

  constructor(
    choice: UIDropdownChoice,
    private readonly isChosen: () => boolean,
    pick: () => void
  ) {
    super('dropdownOption');
    this.value = choice.value;
    this.label = choice.label;
    this.disabled = choice.disabled ?? false;
    registerSemanticControl(this, {
      kind: 'button',
      isDisabled: () => this.disabled,
      activate: pick,
    });
  }

  /** Whether this option is the dropdown's current value. */
  get checked(): boolean {
    return this.isChosen();
  }

  onObjectSelectStart(event: SelectEvent): void {
    event.stopPropagation();
    event.stopGlobalPropagation();
  }

  onObjectSelectEnd(event: SelectEvent): void {
    event.stopPropagation();
    event.stopGlobalPropagation();
  }
}

function validateChoices(options: unknown): ReadonlyArray<UIDropdownChoice> {
  if (!Array.isArray(options) || options.length === 0) {
    throw new Error('UIDropdown options must be a non-empty array.');
  }
  const values = new Set<string>();
  return Object.freeze(
    options.map((option: Partial<UIDropdownChoice> | undefined) => {
      const {value, label, disabled} = option ?? {};
      if (typeof value !== 'string') {
        throw new Error('UIDropdown option values must be strings.');
      }
      if (typeof label !== 'string' || !label) {
        throw new Error('UIDropdown option labels must be non-empty strings.');
      }
      if (disabled !== undefined && typeof disabled !== 'boolean') {
        throw new Error('UIDropdown option disabled must be a boolean.');
      }
      if (values.has(value)) {
        throw new Error('UIDropdown option values must be unique.');
      }
      values.add(value);
      return Object.freeze(
        disabled === undefined ? {value, label} : {value, label, disabled}
      );
    })
  );
}

function validateValue(
  choices: ReadonlyArray<UIDropdownChoice>,
  value: unknown
): void {
  if (
    value !== undefined &&
    !choices.some((choice) => choice.value === value)
  ) {
    throw new Error('UIDropdown value must be one of its option values.');
  }
}

function validateDisabled(value: unknown): void {
  if (typeof value !== 'boolean') {
    throw new Error('UIDropdown disabled must be a boolean.');
  }
}

function isVisibleInTree(object: THREE.Object3D): boolean {
  for (let node: THREE.Object3D | null = object; node; node = node.parent) {
    if (!node.visible) return false;
  }
  return true;
}
