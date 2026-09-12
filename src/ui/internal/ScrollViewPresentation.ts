import {Container} from '@pmndrs/uikit';
import * as THREE from 'three';
import type {SemanticScrollbarHit} from '../../interaction/SemanticControl';

import {
  bindScrollView,
  UIScrollView,
  updateScrollViewLayout,
} from '../components/UIScrollView';
import {
  getUIPresentationObject,
  type UIElement,
  type UIStyle,
} from '../UIElement';
import {DEFAULT_SCROLLBAR_WIDTH} from './UIContentDefaults';

/** Keeps scroll clipping inside the decorative shell instead of clipping its shadows. */
export class ScrollViewPresentation {
  readonly viewport = new Container({
    width: '100%',
    flexGrow: 1,
    flexShrink: 1,
    flexBasis: 0,
    minHeight: 0,
    overflow: 'scroll',
    scrollbarWidth: DEFAULT_SCROLLBAR_WIDTH,
    paddingRight: DEFAULT_SCROLLBAR_WIDTH,
    flexDirection: 'column',
  });
  readonly content = new Container({
    width: '100%',
    flexShrink: 0,
    flexDirection: 'column',
    alignItems: 'stretch',
  });
  private readonly unbind: () => void;

  constructor(
    private readonly view: UIScrollView,
    shell: Container
  ) {
    shell.add(this.viewport);
    this.viewport.add(this.content);
    this.unbind = bindScrollView(view, {
      projectPoint: this.projectPoint,
      reveal: this.reveal,
      applyOffset: this.applyOffset,
      scrollbarHit: (point) => scrollbarHit(this.viewport, point),
    });
  }

  commit(properties: UIStyle): void {
    this.content.setProperties({
      flexDirection: properties.flexDirection ?? 'column',
      alignItems: properties.alignItems ?? 'stretch',
      justifyContent: properties.justifyContent ?? 'flex-start',
      gapRow: properties.rowGap ?? properties.gap,
      gapColumn: properties.columnGap ?? properties.gap,
    });
    this.viewport.setProperties({
      scrollbarColor: properties.color ?? '#888888',
    });
  }

  afterLayout(): void {
    const size = this.viewport.size.peek();
    if (!size) return;
    const height = size[1];
    const maximum = this.viewport.maxScrollPosition.peek()[1] ?? 0;
    updateScrollViewLayout(this.view, height, height + maximum);
    this.applyOffset(this.view.scrollTop);
  }

  projectPoint = (point: THREE.Vector3): THREE.Vector2 | undefined => {
    const size = this.viewport.size.peek();
    if (!size || size[0] <= 0 || size[1] <= 0) return undefined;
    const local = this.viewport.worldToLocal(point.clone());
    return new THREE.Vector2(
      (local.x + 0.5) * size[0],
      (0.5 - local.y) * size[1]
    );
  };

  private applyOffset = (offset: number): void => {
    const current = this.viewport.scrollPosition.peek();
    this.viewport.scrollVelocity.set(0, 0);
    if (current[0] !== 0 || current[1] !== offset) {
      this.viewport.scrollPosition.value = [0, offset];
    }
  };

  private reveal = (child: UIElement): void => {
    const physical = getUIPresentationObject(child);
    if (!(physical instanceof THREE.Mesh)) {
      throw new Error('Cannot reveal UI before its presentation is mounted.');
    }
    physical.updateWorldMatrix(true, false);
    const points = [-0.5, 0.5].flatMap((x) =>
      [-0.5, 0.5].map((y) =>
        this.projectPoint(
          new THREE.Vector3(x, y, 0).applyMatrix4(physical.matrixWorld)
        )
      )
    );
    if (points.some((point) => !point)) {
      throw new Error('Cannot reveal UI before its viewport has a layout.');
    }
    const ys = points.map((point) => point!.y);
    const top = Math.min(...ys);
    const bottom = Math.max(...ys);
    if (top < 0) this.view.scrollBy(top);
    else if (bottom > this.view.clientHeight) {
      this.view.scrollBy(bottom - this.view.clientHeight);
    }
  };

  dispose(): void {
    this.unbind();
    this.content.removeFromParent();
    this.content.dispose();
    this.viewport.removeFromParent();
    this.viewport.dispose();
  }
}

/** Maps the viewport's proportional thumb/track to a vertical scroll gesture. */
export function scrollbarHit(
  viewport: Container,
  point: THREE.Vector3
): SemanticScrollbarHit | undefined {
  const size = viewport.size.peek();
  const maximum = viewport.maxScrollPosition.peek()[1];
  if (!size || maximum === undefined || maximum <= 0) return undefined;
  const width = viewport.properties.peek().scrollbarWidth;
  const [top, right, bottom] = viewport.borderInset.peek() ?? [0, 0, 0, 0];
  const local = viewport.worldToLocal(point.clone());
  const x = (local.x + 0.5) * size[0];
  const y = (0.5 - local.y) * size[1] - top;
  const height = size[1] - top - bottom;
  if (
    x < size[0] - right - width ||
    x > size[0] - right ||
    y < 0 ||
    y > height
  ) {
    return undefined;
  }
  const thumb = Math.max(width, (height * height) / (height + maximum));
  const travel = height - thumb;
  if (travel <= 0) return undefined;
  const offset = viewport.scrollPosition.peek()[1];
  const start = (offset / maximum) * travel;
  return {
    offset:
      y >= start && y <= start + thumb
        ? offset
        : Math.max(0, Math.min(maximum, ((y - thumb / 2) * maximum) / travel)),
    scale: maximum / travel,
  };
}
