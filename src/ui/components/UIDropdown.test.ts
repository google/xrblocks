import * as THREE from 'three';
import {describe, expect, it, vi} from 'vitest';

import {getSemanticControl} from '../../interaction/SemanticControl';
import {getUIElementKind, getUIRevision} from '../UIElement';
import {createThemeSnapshot, grayGlassTheme} from '../UITheme';
import {UICard} from './UICard';
import {UIDropdown, UIDropdownOption} from './UIDropdown';
import {
  bindScrollView,
  UIScrollView,
  updateScrollViewLayout,
} from './UIScrollView';
import {UIText} from './UIText';

const SIZES = [
  {value: 's', label: 'Small'},
  {value: 'm', label: 'Medium'},
  {value: 'l', label: 'Large', disabled: true},
];

function list(dropdown: UIDropdown): UIScrollView {
  return dropdown.children[0] as UIScrollView;
}

function rows(dropdown: UIDropdown): UIDropdownOption[] {
  return list(dropdown).children as UIDropdownOption[];
}

function open(dropdown: UIDropdown): void {
  getSemanticControl(dropdown)!.activate();
}

describe('UIDropdown', () => {
  it('starts closed with one option row per option', () => {
    const dropdown = new UIDropdown({ariaLabel: 'Size', options: SIZES});

    expect(dropdown.name).toBe('UIDropdown');
    expect(getUIElementKind(dropdown)).toBe('dropdown');
    expect(dropdown.ariaLabel).toBe('Size');
    expect(dropdown.value).toBeUndefined();
    expect(dropdown.placeholder).toBe('');
    expect(dropdown.disabled).toBe(false);
    expect(dropdown.open).toBe(false);
    expect(dropdown.options).toEqual(SIZES);
    expect(Object.isFrozen(dropdown.options)).toBe(true);
    expect(Object.isFrozen(dropdown.options[0])).toBe(true);
    expect(dropdown.children).toEqual([list(dropdown)]);
    expect(list(dropdown)).toBeInstanceOf(UIScrollView);
    expect(list(dropdown).visible).toBe(false);
    expect(
      rows(dropdown).map((row) => [
        getUIElementKind(row),
        row.value,
        row.label,
        row.disabled,
      ])
    ).toEqual([
      ['dropdownOption', 's', 'Small', false],
      ['dropdownOption', 'm', 'Medium', false],
      ['dropdownOption', 'l', 'Large', true],
    ]);

    const chosen = new UIDropdown({
      ariaLabel: 'Size',
      options: SIZES,
      value: 'm',
      placeholder: 'Pick a size',
      disabled: true,
    });
    expect(chosen.value).toBe('m');
    expect(chosen.placeholder).toBe('Pick a size');
    expect(chosen.disabled).toBe(true);
    expect(rows(chosen).map((row) => row.checked)).toEqual([
      false,
      true,
      false,
    ]);
  });

  it('validates its accessible name, options, value, and flags', () => {
    const make = (options: object) => () =>
      new UIDropdown({ariaLabel: 'Size', options: SIZES, ...options});

    expect(make({ariaLabel: ''})).toThrow('UIDropdown requires ariaLabel.');
    expect(make({options: []})).toThrow(
      'UIDropdown options must be a non-empty array.'
    );
    expect(make({options: 'small'})).toThrow(
      'UIDropdown options must be a non-empty array.'
    );
    expect(make({options: [{value: 's', label: ''}]})).toThrow(
      'UIDropdown option labels must be non-empty strings.'
    );
    expect(make({options: [{value: 1, label: 'One'}]})).toThrow(
      'UIDropdown option values must be strings.'
    );
    expect(
      make({
        options: [
          {value: 's', label: 'Small'},
          {value: 's', label: 'Short'},
        ],
      })
    ).toThrow('UIDropdown option values must be unique.');
    expect(
      make({options: [{value: 's', label: 'Small', disabled: 'no'}]})
    ).toThrow('UIDropdown option disabled must be a boolean.');
    expect(make({value: 'xl'})).toThrow(
      'UIDropdown value must be one of its option values.'
    );
    expect(make({disabled: 1})).toThrow(
      'UIDropdown disabled must be a boolean.'
    );
    expect(make({placeholder: 3})).toThrow(
      'UIDropdown placeholder must be a string.'
    );
  });

  it('applies programmatic value and disabled changes without onChange', () => {
    const onChange = vi.fn();
    const dropdown = new UIDropdown({
      ariaLabel: 'Size',
      options: SIZES,
      onChange,
    });
    const initial = getUIRevision(dropdown);

    dropdown.value = 'l';
    expect(dropdown.value).toBe('l');
    expect(rows(dropdown)[2].checked).toBe(true);
    expect(getUIRevision(dropdown)).toBeGreaterThan(initial);
    const chosen = getUIRevision(dropdown);
    dropdown.value = 'l';
    expect(getUIRevision(dropdown)).toBe(chosen);
    expect(() => {
      dropdown.value = 'xl';
    }).toThrow('UIDropdown value must be one of its option values.');
    expect(dropdown.value).toBe('l');
    dropdown.value = undefined;
    expect(dropdown.value).toBeUndefined();

    dropdown.disabled = true;
    expect(dropdown.disabled).toBe(true);
    expect(() => {
      dropdown.disabled = 'yes' as never;
    }).toThrow('UIDropdown disabled must be a boolean.');
    expect(onChange).not.toHaveBeenCalled();
  });

  it('toggles the list from its button control and closes when disabled', () => {
    const dropdown = new UIDropdown({ariaLabel: 'Size', options: SIZES});
    const control = getSemanticControl(dropdown)!;
    const initial = getUIRevision(dropdown);

    expect(control.kind).toBe('button');
    control.activate();
    expect(dropdown.open).toBe(true);
    expect(list(dropdown).visible).toBe(true);
    expect(getUIRevision(dropdown)).toBeGreaterThan(initial);
    control.activate();
    expect(dropdown.open).toBe(false);
    expect(list(dropdown).visible).toBe(false);

    control.activate();
    dropdown.disabled = true;
    expect(control.isDisabled()).toBe(true);
    expect(dropdown.open).toBe(false);
    expect(list(dropdown).visible).toBe(false);
  });

  it('picks an enabled option, reports only real changes, and closes', () => {
    const onChange = vi.fn();
    const dropdown = new UIDropdown({
      ariaLabel: 'Size',
      options: SIZES,
      value: 's',
      onChange,
    });
    const [small, medium, large] = rows(dropdown).map(
      (row) => getSemanticControl(row)!
    );

    expect(medium.kind).toBe('button');
    expect(large.isDisabled()).toBe(true);
    expect(small.isDisabled()).toBe(false);
    open(dropdown);
    medium.activate();
    expect(dropdown.value).toBe('m');
    expect(dropdown.open).toBe(false);
    expect(onChange).toHaveBeenCalledExactlyOnceWith('m');

    open(dropdown);
    medium.activate();
    expect(dropdown.open).toBe(false);
    expect(onChange).toHaveBeenCalledTimes(1);
  });

  it('closes when it or an ancestor is hidden, removed, or disposed', () => {
    const dropdown = new UIDropdown({ariaLabel: 'Size', options: SIZES});
    const card = new UICard({
      size: {width: 1, height: 1},
      children: [dropdown],
    });

    open(dropdown);
    dropdown.update();
    expect(dropdown.open).toBe(true);
    dropdown.visible = false;
    dropdown.update();
    expect(dropdown.open).toBe(false);

    dropdown.visible = true;
    open(dropdown);
    card.visible = false;
    dropdown.update();
    expect(dropdown.open).toBe(false);

    card.visible = true;
    open(dropdown);
    card.remove(dropdown);
    expect(dropdown.open).toBe(false);

    open(dropdown);
    dropdown.dispose();
    expect(dropdown.open).toBe(false);
  });

  it('reveals the chosen option once, after the open list has a layout', () => {
    const dropdown = new UIDropdown({
      ariaLabel: 'Size',
      options: SIZES,
      value: 'l',
    });
    const reveal = vi.fn();

    open(dropdown);
    bindScrollView(list(dropdown), {
      projectPoint: () => undefined,
      reveal,
      applyOffset: () => {},
    });
    updateScrollViewLayout(list(dropdown), 100, 300);
    expect(reveal).not.toHaveBeenCalled();
    dropdown.update();
    dropdown.update();
    expect(reveal).toHaveBeenCalledExactlyOnceWith(rows(dropdown)[2]);
  });

  it('does not accept application children', () => {
    const dropdown = new UIDropdown({ariaLabel: 'Size', options: SIZES});

    expect(() => dropdown.add(new UIText({text: 'Extra'}))).toThrow(
      'UIDropdown does not accept children.'
    );
    expect(() => dropdown.attach(new UIText({text: 'Extra'}))).toThrow(
      'UIDropdown does not accept children.'
    );
    expect(
      () =>
        new UIDropdown({
          ariaLabel: 'Size',
          options: SIZES,
          children: [new THREE.Object3D()],
        } as never)
    ).toThrow('UIDropdown does not accept children.');
    expect(dropdown.children).toEqual([list(dropdown)]);
  });

  it('accepts dropdown and dropdownOption theme style roles', () => {
    const theme = createThemeSnapshot({
      ...grayGlassTheme,
      styles: {
        ...grayGlassTheme.styles,
        dropdown: {borderRadius: 12},
        dropdownOption: {':hover': {backgroundColor: '#333333'}},
      },
    });

    expect(theme.styles?.dropdown?.borderRadius).toBe(12);
    expect(theme.styles?.dropdownOption?.[':hover']?.backgroundColor).toBe(
      '#333333'
    );
  });
});
