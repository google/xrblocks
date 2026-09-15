import type * as THREE from 'three';

import {
  registerSemanticControl,
  type SemanticScrollbarHit,
} from '../../interaction/SemanticControl';
import {UIElement, type UIElementOptions} from '../UIElement';

const DEFAULT_VIEWPORT_HEIGHT = 240;

export interface UIScrollViewOptions extends UIElementOptions {
  ariaLabel?: string;
  scrollTop?: number;
  onScroll?: (offset: number) => void;
}

export interface ScrollViewBinding {
  projectPoint(point: THREE.Vector3): THREE.Vector2 | undefined;
  reveal(child: UIElement): void;
  applyOffset(offset: number): void;
  scrollbarHit?(point: THREE.Vector3): SemanticScrollbarHit | undefined;
}

interface ScrollViewState {
  binding?: ScrollViewBinding;
  updateLayout(height: number, contentHeight: number): void;
  clearLayout(): void;
}

const states = new WeakMap<UIScrollView, ScrollViewState>();

/** A vertical viewport for ordinary retained UI children. Offsets use UI units. */
export class UIScrollView<
  TEventMap extends THREE.Object3DEventMap = THREE.Object3DEventMap,
> extends UIElement<TEventMap> {
  name = 'UIScrollView';
  readonly ariaLabel: string;
  onScroll?: (offset: number) => void;
  private _scrollTop: number;
  private _clientHeight = 0;
  private _scrollHeight = 0;
  private measured = false;

  constructor({
    ariaLabel = 'Scroll view',
    scrollTop = 0,
    onScroll,
    style,
    ...options
  }: UIScrollViewOptions = {}) {
    validateOffset(scrollTop);
    if (!ariaLabel)
      throw new Error('UIScrollView requires an accessible name.');
    super('scroll', {
      ...options,
      style: {width: '100%', height: DEFAULT_VIEWPORT_HEIGHT, ...style},
    });
    this.ariaLabel = ariaLabel;
    this._scrollTop = Math.max(0, scrollTop);
    this.onScroll = onScroll;
    states.set(this, {
      updateLayout: (height, contentHeight) => {
        this._clientHeight = height;
        this._scrollHeight = contentHeight;
        this.measured = true;
        this.scrollTo(this._scrollTop);
      },
      clearLayout: () => {
        this.measured = false;
        this._clientHeight = 0;
        this._scrollHeight = 0;
      },
    });
    registerSemanticControl(this, {
      kind: 'scroll',
      isDisabled: () => !this.ready,
      activate: () => {},
      scroll: {
        getOffset: () => this.scrollTop,
        getViewportHeight: () => this.clientHeight,
        projectPoint: (point) => states.get(this)?.binding?.projectPoint(point),
        scrollBy: (delta) => this.scrollBy(delta),
        scrollbarHit: (point) =>
          states.get(this)?.binding?.scrollbarHit?.(point),
      },
    });
  }

  get ready(): boolean {
    return this.measured && states.get(this)?.binding !== undefined;
  }

  get scrollTop(): number {
    return this._scrollTop;
  }

  set scrollTop(offset: number) {
    this.scrollTo(offset);
  }

  get clientHeight(): number {
    return this._clientHeight;
  }

  get scrollHeight(): number {
    return this._scrollHeight;
  }

  get maxScrollTop(): number {
    return Math.max(0, this.scrollHeight - this.clientHeight);
  }

  /** Sets a clamped offset. Before layout, retains the requested initial offset. */
  scrollTo(offset: number): void {
    validateOffset(offset);
    const next = this.measured
      ? Math.min(this.maxScrollTop, Math.max(0, offset))
      : Math.max(0, offset);
    states.get(this)?.binding?.applyOffset(next);
    if (next === this._scrollTop) return;
    this._scrollTop = next;
    this.markUIDirty();
    this.onScroll?.(next);
  }

  /** Returns whether a measured viewport actually moved. */
  scrollBy(delta: number): boolean {
    validateOffset(delta);
    if (!this.ready) return false;
    const previous = this.scrollTop;
    this.scrollTo(previous + delta);
    return previous !== this.scrollTop;
  }

  /** Minimally reveals a descendant after its mounted layout is ready. */
  reveal(child: UIElement): void {
    let parent = child.parent;
    while (parent && parent !== this) parent = parent.parent;
    if (parent !== this) {
      throw new Error('UIScrollView.reveal requires a descendant UI element.');
    }
    const binding = states.get(this)?.binding;
    if (!this.ready || !binding) {
      throw new Error('UIScrollView.reveal requires a mounted layout.');
    }
    binding.reveal(child);
  }
}

export function bindScrollView(
  view: UIScrollView,
  binding: ScrollViewBinding
): () => void {
  const state = states.get(view)!;
  state.binding = binding;
  return () => {
    if (state.binding !== binding) return;
    state.binding = undefined;
    state.clearLayout();
  };
}

export function updateScrollViewLayout(
  view: UIScrollView,
  height: number,
  contentHeight: number
): void {
  if (
    !Number.isFinite(height) ||
    !Number.isFinite(contentHeight) ||
    height < 0 ||
    contentHeight < 0
  ) {
    throw new Error(
      'UIScrollView requires finite, nonnegative layout extents.'
    );
  }
  states.get(view)!.updateLayout(height, Math.max(height, contentHeight));
}

function validateOffset(offset: number): void {
  if (!Number.isFinite(offset)) {
    throw new Error('UIScrollView offsets must be finite.');
  }
}
