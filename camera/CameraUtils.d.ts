import * as THREE from 'three';
import { Depth } from '../depth/Depth';
import { XRDeviceCamera } from './XRDeviceCamera';
export declare const aspectRatios: {
    depth: number;
    RGB: number;
};
/**
 * Parameters for RGB to depth UV mapping (manually calibrated for aspect
 * ratios. For RGB and depth, 4:3 and 1:1, respectively.
 */
export declare const rgbToDepthParams: {
    scale: number;
    scaleX: number;
    scaleY: number;
    translateU: number;
    translateV: number;
    k1: number;
    k2: number;
    k3: number;
    p1: number;
    p2: number;
    xc: number;
    yc: number;
};
/**
 * Maps a UV coordinate from a RGB space to a destination depth space,
 * applying Brown-Conrady distortion and affine transformations based on
 * aspect ratios. If the simulator camera is used, no transformation is applied.
 *
 * @param rgbUv - The RGB UV coordinate, e.g., \{ u: 0.5, v: 0.5 \}.
 * @param xrDeviceCamera - The device camera instance.
 * @returns The transformed UV coordinate in the depth image space, or null if
 *     inputs are invalid.
 */
export declare function transformRgbToDepthUv(rgbUv: {
    u: number;
    v: number;
}, xrDeviceCamera?: XRDeviceCamera): {
    u: number;
    v: number;
} | null;
/**
 * Retrieves the world space position of a given RGB UV coordinate.
 * Note: it is essential that the coordinates, depth array, and projection
 * matrix all correspond to the same view ID (e.g., 0 for left). It is also
 * advised that all of these are obtained at the same time.
 *
 * @param rgbUv - The RGB UV coordinate, e.g., \{ u: 0.5, v: 0.5 \}.
 * @param depthArray - Array containing depth data.
 * @param viewProjectionMatrix - XRView object with corresponding
 * projection matrix.
 * @param matrixWorld - Matrix for view-to-world translation.
 * @param xrDeviceCamera - The device camera instance.
 * @param xrDepth - The SDK's Depth module.
 * @returns Vertex at (u, v) in world space.
 */
export declare function transformRgbUvToWorld(rgbUv: {
    u: number;
    v: number;
}, depthArray: number[] | Uint16Array | Float32Array, viewProjectionMatrix: THREE.Matrix4, matrixWorld: THREE.Matrix4, xrDeviceCamera?: XRDeviceCamera, xrDepth?: Depth | undefined): THREE.Vector3 | null;
/**
 * Asynchronously crops a base64 encoded image using a THREE.Box2 bounding box.
 * This function creates an in-memory image, draws a specified portion of it to
 * a canvas, and then returns the canvas content as a new base64 string.
 * @param base64Image - The base64 string of the source image. Can be a raw
 *     string or a full data URI.
 * @param boundingBox - The bounding box with relative coordinates (0-1) for
 *     cropping.
 * @returns A promise that resolves with the base64 string of the cropped image.
 */
export declare function cropImage(base64Image: string, boundingBox: THREE.Box2): Promise<string>;
