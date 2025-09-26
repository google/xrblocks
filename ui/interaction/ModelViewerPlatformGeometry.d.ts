import * as THREE from 'three';
/**
 * A factory function that constructs the complete geometry for a
 * `ModelViewerPlatform`. It combines several sub-geometries: four rounded
 * corners, four straight side tubes, and the flat top and bottom surfaces.
 * @param width - The total width of the platform.
 * @param depth - The total depth of the platform.
 * @param thickness - The thickness of the platform.
 * @param cornerRadius - The radius of the rounded corners.
 * @returns A merged `THREE.BufferGeometry` for the entire platform.
 */
export declare function createPlatformGeometry(width?: number, depth?: number, thickness?: number, cornerRadius?: number, cornerWidthSegments?: number, radialSegments?: number): THREE.BufferGeometry<THREE.NormalBufferAttributes, THREE.BufferGeometryEventMap>;
