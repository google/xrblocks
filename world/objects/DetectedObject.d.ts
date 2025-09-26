import * as THREE from 'three';
/**
 * Represents a single detected object in the XR environment and holds metadata
 * about the object's properties. Note: 3D object position is stored in the
 * position property of `Three.Object3D`.
 */
export declare class DetectedObject extends THREE.Object3D {
    /**
     * A semantic label for the object (e.g., 'chair', 'table').
     */
    label: string;
    /**
     * The cropped part of the image that contains the object, as a base64 Data
     * URL.
     */
    image: string | null;
    /**
     * The 2D bounding box of the detected object in normalized screen
     * coordinates. Values are between 0 and 1. Centerpoint of this bounding is
     * used for backproject to obtain 3D object position (i.e., this.position).
     */
    detection2DBoundingBox: THREE.Box2;
    /**
     * Allows for additional, dynamic properties to be added to the object, as
     * defined in the schema in `ObjectsOptions`.
     */
    [key: string]: any;
    /**
     * @param label - The semantic label of the object.
     * @param image - The base64 encoded cropped image of the object.
     * @param boundingBox - The 2D bounding box.
     * @param additionalData - A key-value map of additional properties from the
     * detector. This includes any object proparties that is requested through the
     * schema but is not assigned a class property by default (e.g., color, size).
     */
    constructor(label: string, image: string | null, boundingBox: THREE.Box2, additionalData?: {
        [key: string]: any;
    });
}
