import * as THREE from 'three';
import { IconButton, IconButtonOptions } from './IconButton';
/**
 *A specialized `IconButton` that provides a simple, single-click
 * way for users to end the current WebXR session.
 *
 * It inherits the visual and interactive properties of `IconButton` and adds
 * the specific logic for session termination.
 */
export declare class ExitButton extends IconButton {
    /**
     * Declares the dependencies required by this script, which will be injected
     * by the core engine during initialization.
     */
    static dependencies: {
        renderer: typeof THREE.WebGLRenderer;
    };
    /** The size of the 'close' icon font. */
    fontSize: number;
    /** The base opacity when the button is not being interacted with. */
    defaultOpacity: number;
    /** The opacity when a controller's reticle hovers over the button. */
    hoverOpacity: number;
    /** The background color of the button's circular shape. */
    backgroundColor: number;
    /** A private reference to the injected THREE.WebGLRenderer instance. */
    private renderer;
    /**
     * @param options - Configuration options to override the button's default
     * appearance.
     */
    constructor(options?: IconButtonOptions);
    /**
     * Initializes the component and stores the injected renderer dependency.
     * @param dependencies - The injected dependencies.
     */
    init({ renderer }: {
        renderer: THREE.WebGLRenderer;
    }): Promise<void>;
    /**
     * This method is triggered when the button is successfully selected (e.g.,
     * clicked). It finds the active WebXR session and requests to end it.
     * @override
     */
    onTriggered(): void;
}
