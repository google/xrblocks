import {describe, expect, it, vi} from 'vitest';
import {getSemanticControl} from '../../interaction/SemanticControl';
import {UICard} from './UICard';
import {UIDropdown} from './UIDropdown';

const OPTIONS = [
  {value: 's', label: 'Small'},
  {value: 'm', label: 'Medium'},
  {value: 'l', label: 'Large', disabled: true},
];

function open(dropdown: UIDropdown) {
  getSemanticControl(dropdown)!.activate();
}

describe('dropdown selection', () => {
  it('reports a changed selection once and keeps programmatic changes silent', () => {
    const onChange = vi.fn();
    const dropdown = new UIDropdown({
      ariaLabel: 'Size',
      options: OPTIONS,
      value: 's',
      onChange,
    });
    const list = dropdown.children[0];
    const medium = getSemanticControl(list.children[1])!;
    const large = getSemanticControl(list.children[2])!;
    expect(large.isDisabled()).toBe(true);
    open(dropdown);
    medium.activate();
    expect(dropdown.value).toBe('m');
    expect(dropdown.open).toBe(false);
    expect(onChange).toHaveBeenCalledExactlyOnceWith('m');
    open(dropdown);
    medium.activate();
    expect(dropdown.open).toBe(false);
    expect(onChange).toHaveBeenCalledOnce();
    dropdown.value = 's';
    expect(dropdown.value).toBe('s');
    expect(onChange).toHaveBeenCalledOnce();
    dropdown.dispose();
  });

  it('closes an open list when disabled or when its owner becomes unavailable', () => {
    const dropdown = new UIDropdown({ariaLabel: 'Size', options: OPTIONS});
    const card = new UICard({
      size: {width: 1, height: 1},
      children: [dropdown],
    });
    open(dropdown);
    expect(dropdown.open).toBe(true);
    dropdown.disabled = true;
    expect(dropdown.open).toBe(false);
    dropdown.disabled = false;
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
    card.dispose();
  });
});
