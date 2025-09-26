import * as THREE from 'three';
import { Pager } from './Pager';
/**
 * A specialized `Pager` that arranges its pages horizontally and
 * enables horizontal swiping gestures for navigation. It clips content that
 * is outside the viewable area.
 */
export declare class HorizontalPager extends Pager {
    localClippingPlanes: THREE.Plane[];
    updateLayout(): void;
}
