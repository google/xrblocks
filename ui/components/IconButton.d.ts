import * as THREE from 'three';
import { TextView, TextViewOptions } from '../components/TextView';
/**
 * An interactive circular button that displays a single character
 * icon from the Material Icons font library. It provides visual feedback for
 * hover and selection states by changing its background opacity.
 */
export type IconButtonOptions = TextViewOptions & {
    backgroundColor?: THREE.ColorRepresentation;
    defaultOpacity?: number;
    hoverColor?: number;
    hoverOpacity?: number;
    selectedOpacity?: number;
    opacity?: number;
};
export declare class IconButton extends TextView {
    /** The overall opacity when the button is not being interacted with. */
    opacity: number;
    /** The background opacity when the button is not being interacted with. */
    defaultOpacity: number;
    /** The background color when a reticle hovers over the button. */
    hoverColor: number;
    /** The background opacity when a reticle hovers over the button. */
    hoverOpacity: number;
    /** The background opacity when the button is actively being pressed. */
    selectedOpacity: number;
    /** The icon font file to use. Defaults to Material Icons. */
    font: string;
    /** The underlying mesh for the button's background. */
    mesh: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>;
    /**
     * Overrides the parent `rangeX` to ensure the circular shape is not affected
     * by panel aspect ratio.
     */
    get rangeX(): number;
    /**
     * Overrides the parent `rangeY` to ensure the circular shape is not affected
     * by panel aspect ratio.
     */
    get rangeY(): number;
    /**
     * An interactive button that displays a single character icon from a font
     * file. Inherits from TextView to handle text rendering.
     * @param options - The options for the IconButton.
     */
    constructor(options?: IconButtonOptions);
    /**
     * Initializes the component and sets the render order.
     */
    init(_?: object): Promise<void>;
    /**
  
    /**
     * Handles behavior when the cursor hovers over the button.
     */
    onHoverOver(): void;
    /**
     * Handles behavior when the cursor moves off the button.
     */
    onHoverOut(): void;
    /**
     * Updates the button's visual state based on hover and selection status.
     */
    update(): void;
    /**
     * Overrides the parent's private initialization method. This is called by the
     * parent's `init()` method after the Troika module is confirmed to be loaded.
     */
    protected _initializeText(): void;
}
