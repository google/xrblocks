import * as THREE from 'three';
import {describe, expect, it, vi} from 'vitest';

import {getSemanticControl} from '../../interaction/SemanticControl';
import {UIButton} from './UIButton';
import {
  bindScrollView,
  UIScrollView,
  updateScrollViewLayout,
} from './UIScrollView';

function mount(view: UIScrollView) {
  const binding = {
    projectPoint: (point: THREE.Vector3) => new THREE.Vector2(point.x, point.y),
    applyOffset: vi.fn(),
    reveal: vi.fn(),
  };
  return {binding, unbind: bindScrollView(view, binding)};
}

describe('UIScrollView state', () => {
  it('retains initial offsets, clamps after layout, and reports actual changes', () => {
    const onScroll = vi.fn();
    const view = new UIScrollView({scrollTop: 500, onScroll});
    const {binding, unbind} = mount(view);
    expect(view.ready).toBe(false);
    updateScrollViewLayout(view, 100, 300);
    expect(view.scrollTop).toBe(200);
    expect(view.ready).toBe(true);
    expect(onScroll).toHaveBeenCalledExactlyOnceWith(200);
    expect(view.scrollBy(100)).toBe(false);
    expect(view.scrollBy(-30)).toBe(true);
    expect(binding.applyOffset).toHaveBeenLastCalledWith(170);
    updateScrollViewLayout(view, 200, 220);
    expect(view.scrollTop).toBe(20);
    unbind();
    expect(view.ready).toBe(false);
    expect(view.scrollTop).toBe(20);
  });

  it('rejects invalid input and requires measured descendant layout for reveal', () => {
    expect(() => new UIScrollView({scrollTop: NaN})).toThrow(/finite/);
    const view = new UIScrollView();
    const child = new UIButton({label: 'Item'});
    view.add(child);
    expect(() => view.reveal(child)).toThrow(/mounted/);
    const {binding} = mount(view);
    updateScrollViewLayout(view, 100, 200);
    view.reveal(child);
    expect(binding.reveal).toHaveBeenCalledWith(child);
    expect(() => view.reveal(new UIButton({label: 'Elsewhere'}))).toThrow(
      /descendant/
    );
    expect(() => view.scrollBy(Infinity)).toThrow(/finite/);
    expect(() => updateScrollViewLayout(view, -1, 20)).toThrow(/nonnegative/);
  });

  it('registers source-neutral scroll semantics without enabling card manipulation', () => {
    const view = new UIScrollView();
    mount(view);
    updateScrollViewLayout(view, 100, 200);
    const control = getSemanticControl(view)!;
    expect(control.kind).toBe('scroll');
    expect(control.isDisabled()).toBe(false);
    expect(control.scroll?.scrollBy(15)).toBe(true);
    expect(control.scroll?.getOffset()).toBe(15);
  });
});
