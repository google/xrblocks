import * as THREE from 'three';

import {IconButton, IconButtonOptions} from './IconButton';

/**
 *A specialized `IconButton` that provides a simple, single-click
 * way for users to end the current WebXR session.
 *
 * It inherits the visual and interactive properties of `IconButton` and adds
 * the specific logic for session termination.
 */
export class ExitButton extends IconButton {
  /**
   * Declares the dependencies required by this script, which will be injected
   * by the core engine during initialization.
   */
  static dependencies = {
    renderer: THREE.WebGLRenderer,
  };

  /** The size of the 'close' icon font. */
  fontSize = 0.8;
  /** The base opacity when the button is not being interacted with. */
  defaultOpacity = 0.2;
  /** The opacity when a controller's reticle hovers over the button. */
  hoverOpacity = 0.8;
  /** The background color of the button's circular shape. */
  backgroundColor = 0xffffff;

  /** A private reference to the injected THREE.WebGLRenderer instance. */
  private renderer!: THREE.WebGLRenderer;

  /**
   * @param options - Configuration options to override the button's default
   * appearance.
   */
  constructor(options: IconButtonOptions = {}) {
    // Passes a default icon ('close') and any user-provided options to the
    // parent IconButton constructor.
    super({text: 'close', ...options});
  }

  /**
   * Initializes the component and stores the injected renderer dependency.
   * @param dependencies - The injected dependencies.
   */
  async init({renderer}: {renderer: THREE.WebGLRenderer;}) {
    await super.init();
    this.renderer = renderer;
  }

  /**
   * This method is triggered when the button is successfully selected (e.g.,
   * clicked). It finds the active WebXR session and requests to end it.
   * @override
   */
  onTriggered() {
    console.log('ExitButton triggered: Shutting down XR session.');
    const session = this.renderer.xr.getSession();
    if (session) {
      // Asynchronously end the session. No need to await.
      session.end();
    }
  }
}
