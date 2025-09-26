import * as THREE from 'three';

import {View} from '../core/View';

const vector3 = new THREE.Vector3();

/**
 * A simple container that represents a single, swipeable page
 * within a `Pager` component. It's a fundamental building block for creating
 * carousels or tabbed interfaces.
 */
export class Page extends View {
  constructor(options = {}) {
    super(options);
  }

  updateLayout() {
    // Do not update the position.
    vector3.copy(this.position);
    super.updateLayout();
    this.position.copy(vector3);
  }
}
