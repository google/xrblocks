import * as THREE from 'three';

import {Pager} from './Pager';

/**
 * A specialized `Pager` that arranges its pages vertically and
 * enables vertical swiping gestures. It is commonly used as the foundation for
 * scrollable text views.
 */
export class VerticalPager extends Pager {
  localClippingPlanes = [
    new THREE.Plane(new THREE.Vector3(0, 1, 0), 0.5),
    new THREE.Plane(new THREE.Vector3(0, -1, 0), 0.5),
  ];

  updateLayout() {
    super.updateLayout();
    this.localClippingPlanes[0].constant = 0.5 * this.rangeY;
    this.localClippingPlanes[1].constant = 0.5 * this.rangeY;
  }

  protected computeSelectingDelta(
      selectingPosition: THREE.Vector3, startSelectPosition: THREE.Vector3) {
    return (selectingPosition.y - startSelectPosition.y) / this.rangeY;
  }
}
