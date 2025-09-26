import * as THREE from 'three';
/**
 * Represents a single detected plane in the XR environment. It's a THREE.Mesh
 * that also holds metadata about the plane's properties.
 * Note: This requires experimental flag for Chrome.
 */
export declare class DetectedPlane extends THREE.Mesh {
    /**
     * The underlying XRPlane object from the WebXR API.
     * @see https://immersive-web.github.io/real-world-geometry/plane-detection.html#xrplane
     */
    xrPlane: XRPlane;
    /**
     * A semantic label for the plane (e.g., 'floor', 'wall', 'ceiling', 'table').
     * Since xrPlane.semanticLabel is readonly, this allows user authoring.
     */
    label: string;
    /**
     * The orientation of the plane ('Horizontal' or 'Vertical').
     */
    orientation: XRPlaneOrientation;
    /**
     * @param xrPlane - The plane object from the WebXR API.
     * @param material - The material for the mesh.
     */
    constructor(xrPlane: XRPlane, material: THREE.Material);
}
