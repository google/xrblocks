import * as THREE from 'three';

import {Script} from '../../core/Script.js';
import {clamp} from '../../utils/utils.js';

/**
 * A state management class for a `Pager` component. It tracks the
 * total number of pages, the current scroll position, and handles the physics
 * and animation logic for smooth, inertia-based scrolling between pages.
 */
export class PagerState extends Script {
  static dependencies = {timer: THREE.Timer};
  currentPage = 0;
  shouldUpdate = true;
  pages = 1;
  timer!: THREE.Timer;

  constructor({pages = 1}) {
    super();
    this.pages = pages;
  }

  init({timer}: {timer: THREE.Timer}) {
    this.timer = timer;
  }

  update() {
    super.update();
    if (!this.shouldUpdate) {
      return false;
    }
    const velocity = Math.sin(Math.PI * (this.currentPage % 1));
    const direction = ((this.currentPage % 1) >= 0.5 ? 1 : -1) *
        Number(Math.abs(velocity) > 0.01);
    const targetPage = clamp(this.currentPage + direction, 0, this.pages - 1);
    const remainingDelta = Math.abs(targetPage - this.currentPage);
    this.currentPage +=
        direction * clamp(velocity * this.timer.getDelta(), 0, remainingDelta);
  }

  addPage() {
    return this.pages++;
  }
}
