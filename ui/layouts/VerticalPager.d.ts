import * as THREE from 'three';
import { Pager } from './Pager';
/**
 * A specialized `Pager` that arranges its pages vertically and
 * enables vertical swiping gestures. It is commonly used as the foundation for
 * scrollable text views.
 */
export declare class VerticalPager extends Pager {
    localClippingPlanes: THREE.Plane[];
    updateLayout(): void;
    protected computeSelectingDelta(selectingPosition: THREE.Vector3, startSelectPosition: THREE.Vector3): number;
}
