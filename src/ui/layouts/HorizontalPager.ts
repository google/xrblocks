import * as THREE from 'three';

import {Pager} from './Pager';

/**
 * A specialized `Pager` that arranges its pages horizontally and
 * enables horizontal swiping gestures for navigation. It clips content that
 * is outside the viewable area.
 */
export class HorizontalPager extends Pager {
  localClippingPlanes = [
    new THREE.Plane(new THREE.Vector3(1, 0, 0), 0.5),
    new THREE.Plane(new THREE.Vector3(-1, 0, 0), 0.5),
  ];

  updateLayout() {
    super.updateLayout();
    this.localClippingPlanes[0].constant = 0.5 * this.rangeX;
    this.localClippingPlanes[1].constant = 0.5 * this.rangeX;
  }
}
