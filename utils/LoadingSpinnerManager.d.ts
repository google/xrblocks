/**
 * Manages the global THREE.DefaultLoadingManager instance for
 * XRBlocks and handles communication of loading progress to the parent iframe.
 * This module controls the visibility of a loading spinner
 * in the DOM based on loading events.
 *
 * Import the single instance
 * `loadingSpinnerManager` to use it throughout the application.
 */
export declare class LoadingSpinnerManager {
    /**
     * DOM element of the loading spinner, created
     * when showSpinner() is called and removed on `onLoad` or `onError`.
     */
    private spinnerElement?;
    /**
     * Tracks if the manager is currently loading assets.
     */
    isLoading: boolean;
    constructor();
    showSpinner(): void;
    hideSpinner(): void;
    private setupCallbacks;
}
export declare const loadingSpinnerManager: LoadingSpinnerManager;
