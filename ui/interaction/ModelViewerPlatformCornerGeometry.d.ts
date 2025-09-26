import * as THREE from 'three';
/**
 * A custom `THREE.BufferGeometry` that creates one rounded corner
 * piece for the `ModelViewerPlatform`. Four of these are instantiated and
 * rotated to form all corners of the platform.
 */
export declare class ModelViewerPlatformCornerGeometry extends THREE.BufferGeometry {
    constructor(radius?: number, tube?: number, radialSegments?: number, tubularSegments?: number);
}
