import * as THREE from 'three';
import { View } from '../core/View';
import { ViewOptions } from '../core/ViewOptions';
/**
 * A UI component for displaying a 2D image on a panel in XR.
 * It automatically handles loading the image and scaling it to fit within its
 * layout bounds while preserving the original aspect ratio.
 */
export type ImageViewOptions = ViewOptions & {
    src?: string;
};
export declare class ImageView extends View {
    /** The URL of the image file to be displayed. */
    src?: string;
    /** The material applied to the image plane. */
    material: THREE.MeshBasicMaterial;
    /** The mesh that renders the image. */
    mesh: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>;
    private texture?;
    private initCalled;
    private textureLoader;
    /**
     * @param options - Configuration options. Can include properties like
     * `src`, `width`, `height`, and other properties from the base `View` class.
     */
    constructor(options?: ImageViewOptions);
    /**
     * Initializes the component. Called once by the XR Blocks lifecycle.
     */
    init(): void;
    /**
     * Reloads the image from the `src` URL. If a texture already exists, it is
     * properly disposed of before loading the new one.
     */
    reload(): void;
    /**
     * Updates the layout of the view and then adjusts the mesh scale to maintain
     * the image's aspect ratio.
     * @override
     */
    updateLayout(): void;
    /**
     * Calculates the correct scale for the image plane to fit within the view's
     * bounds without distortion.
     */
    scaleImageToCorrectAspectRatio(): void;
    /**
     * Sets a new image source and reloads it.
     * @param src - The URL of the new image to load.
     */
    load(src: string): void;
}
