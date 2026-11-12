import * as THREE from 'three';
import {expect, it, vi} from 'vitest';
import {
  bindScrollView,
  UIScrollView,
  updateScrollViewLayout,
} from './UIScrollView';

it('clamps scrolling to measured content and reports only actual offset changes', () => {
  const onScroll = vi.fn();
  const view = new UIScrollView({scrollTop: 500, onScroll});
  const unbind = bindScrollView(view, {
    projectPoint: (point) => new THREE.Vector2(point.x, point.y),
    applyOffset: () => {},
    reveal: () => {},
  });
  try {
    updateScrollViewLayout(view, 100, 300);
    expect(view.scrollTop).toBe(200);
    expect(view.scrollBy(100)).toBe(false);
    expect(view.scrollBy(-30)).toBe(true);
    expect(view.scrollTop).toBe(170);
    updateScrollViewLayout(view, 200, 220);
    expect(view.scrollTop).toBe(20);
    expect(onScroll.mock.calls).toEqual([[200], [170], [20]]);
    expect(() => view.scrollBy(Infinity)).toThrow();
    expect(view.scrollTop).toBe(20);
  } finally {
    unbind();
    view.dispose();
  }
  expect(view.ready).toBe(false);
});
