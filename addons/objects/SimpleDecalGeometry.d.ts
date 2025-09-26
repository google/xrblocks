import * as THREE from 'three';
/**
 * SimpleDecalGeometry is a custom geometry class used to project decals onto
 * a 3D mesh, based on a position, orientation, and scale.
 */
export declare class SimpleDecalGeometry extends THREE.BufferGeometry {
    /**
     * @param mesh - The mesh on which the decal will be projected.
     * @param position - The position of the decal in world space.
     * @param orientation - The orientation of the decal as a
     *     quaternion.
     * @param scale - The scale of the decal.
     */
    constructor(mesh: THREE.Mesh, position: THREE.Vector3, orientation: THREE.Quaternion, scale: THREE.Vector3);
}
