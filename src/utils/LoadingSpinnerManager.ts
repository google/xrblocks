import * as THREE from 'three';

import {createLoadingSpinner} from './CreateLoadingSpinner';

/**
 * Manages the global THREE.DefaultLoadingManager instance for
 * XRBlocks and handles communication of loading progress to the parent iframe.
 * This module controls the visibility of a loading spinner
 * in the DOM based on loading events.
 *
 * Import the single instance
 * `loadingSpinnerManager` to use it throughout the application.
 */
export class LoadingSpinnerManager {
  /**
   * DOM element of the loading spinner, created
   * when showSpinner() is called and removed on `onLoad` or `onError`.
   */
  private spinnerElement?: HTMLElement;

  /**
   * Tracks if the manager is currently loading assets.
   */
  isLoading = false;

  constructor() {
    this.setupCallbacks();
  }

  showSpinner() {
    if (!this.spinnerElement) {
      this.spinnerElement = createLoadingSpinner();
    }
  }

  hideSpinner() {
    if (this.spinnerElement) {
      this.spinnerElement.remove();
      this.spinnerElement = undefined;
    }
  }

  private setupCallbacks() {
    /**
     * Callback function for when the first loading item starts.
     * It sends an initial 'XR_LOADING_PROGRESS' message to the parent window.
     * Note: The spinner is now shown via a manual call to showSpinner()
     * @param _url - The URL of the item being loaded.
     * @param itemsLoaded - The number of items loaded so far.
     * @param itemsTotal - The total number of items to load.
     */
    THREE.DefaultLoadingManager.onStart = (_url, itemsLoaded, itemsTotal) => {
      this.isLoading = true;
      window.parent.postMessage(
          {
            type: 'XR_LOADING_PROGRESS',
            payload: {
              progress: itemsLoaded / itemsTotal,
              message: 'Loading assets...'
            }
          },
          '*');
    };

    /**
     * Callback function for when a loading item progresses.
     * It sends a 'XR_LOADING_PROGRESS' message to the parent window with
     * updated progress.
     * @param _url - The URL of the item currently in progress.
     * @param itemsLoaded - The number of items loaded so far.
     * @param itemsTotal - The total number of items to load.
     */
    THREE.DefaultLoadingManager.onProgress = (_url, itemsLoaded, itemsTotal) => {
      window.parent.postMessage(
          {
            type: 'XR_LOADING_PROGRESS',
            payload: {
              progress: itemsLoaded / itemsTotal,
              message:
                  `Loading ${Math.round((itemsLoaded / itemsTotal) * 100)}%`
            }
          },
          '*');
    };

    /**
     * Callback function for when all loading items are complete.
     * It removes the loading spinner from the DOM and sends an
     * 'XR_LOADING_COMPLETE' message to the parent window.
     */
    THREE.DefaultLoadingManager.onLoad = () => {
      this.isLoading = false;
      this.hideSpinner();
      window.parent.postMessage({type: 'XR_LOADING_COMPLETE'}, '*');
    };

    /**
     * Callback function for when a loading item encounters an error.
     * It removes the loading spinner from the DOM and sends an
     * 'XR_LOADING_ERROR' message to the parent window.
     * @param url - The URL of the item that failed to load.
     */
    THREE.DefaultLoadingManager.onError = (url) => {
      this.isLoading = false;
      console.warn('XRBlocks: Error loading: ' + url);
      this.hideSpinner();
      window.parent.postMessage(
          {
            type: 'XR_LOADING_ERROR',
            payload: {url, message: 'Failed to load assets.'}
          },
          '*');
    };
  }
}

export const loadingSpinnerManager = new LoadingSpinnerManager();
