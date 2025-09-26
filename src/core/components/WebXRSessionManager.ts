import * as THREE from 'three';

export const IMMERSIVE_AR = 'immersive-ar';
export const IMMERSIVE_VR = 'immersive-vr';

declare global {
  interface XRSystem {
    offerSession?: (
        mode: XRSessionMode,
        sessionInit?: XRSessionInit,
        ) => Promise<XRSession>;
  }
}

// Event type definitions for clarity
export enum WebXRSessionEventType {
  UNSUPPORTED = 'unsupported',
  READY = 'ready',
  SESSION_START = 'sessionstart',
  SESSION_END = 'sessionend',
}

export type WebXRSessionManagerEventMap = THREE.Object3DEventMap&{
  [WebXRSessionEventType.UNSUPPORTED]: object;
  [WebXRSessionEventType.READY]: {sessionOptions: XRSessionInit};
  [WebXRSessionEventType.SESSION_START]: {session: XRSession};
  [WebXRSessionEventType.SESSION_END]: object;
}

/**
 * Manages the WebXR session lifecycle by extending THREE.EventDispatcher
 * to broadcast its state to any listener.
 */
export class WebXRSessionManager extends
    THREE.EventDispatcher<WebXRSessionManagerEventMap> {
  public currentSession?: XRSession;
  private sessionOptions?: XRSessionInit;
  private onSessionEndedBound = this.onSessionEndedInternal.bind(this);
  private xrModeSupported?: boolean;

  constructor(
      private renderer: THREE.WebGLRenderer,
      private sessionInit: XRSessionInit,
      private mode: XRSessionMode,
  ) {
    super();  // Initialize the EventDispatcher
  }

  /**
   * Checks for WebXR support and availability of the requested session mode.
   * This should be called to initialize the manager and trigger the first
   * events.
   */
  public async initialize() {
    if (!('xr' in navigator)) {
      console.warn('WebXR not supported');
      this.xrModeSupported = false;
      this.dispatchEvent({type: WebXRSessionEventType.UNSUPPORTED});
      return;
    }

    let modeSupported = false;
    try {
      modeSupported =
          (await navigator.xr!.isSessionSupported(this.mode)) || false;
    } catch (e) {
      console.error('Error getting isSessionSupported', e);
      this.xrModeSupported = false;
      this.dispatchEvent({type: WebXRSessionEventType.UNSUPPORTED});
      return;
    }

    if (modeSupported) {
      this.xrModeSupported = true;
      this.sessionOptions = {
        ...this.sessionInit,
        optionalFeatures: [
          'local-floor',
          ...(this.sessionInit.optionalFeatures || []),
        ],
      };

      // Fire the 'ready' event with the sessionOptions in the data payload
      this.dispatchEvent({
        type: WebXRSessionEventType.READY,
        sessionOptions: this.sessionOptions,
      });

      // Automatically start session if 'offerSession' is available
      if (navigator.xr!.offerSession !== undefined) {
        navigator.xr!.offerSession!(this.mode, this.sessionOptions)
            .then(this.onSessionStartedInternal.bind(this))
            .catch((err) => {
              console.warn(err);
            });
      }
    } else {
      console.log(`${this.mode} not supported`);
      this.xrModeSupported = false;
      this.dispatchEvent({type: WebXRSessionEventType.UNSUPPORTED});
    }
  }

  /**
   * Ends the WebXR session.
   */
  public startSession() {
    if (this.xrModeSupported === undefined) {
      throw new Error('Initialize not yet complete');
    } else if (!this.xrModeSupported) {
      throw new Error('WebXR not supported');
    } else if (this.currentSession) {
      throw new Error('Session already started');
    }
    navigator.xr!.requestSession(this.mode, this.sessionOptions)
        .then(this.onSessionStartedInternal.bind(this));
  }

  /**
   * Ends the WebXR session.
   */
  public endSession() {
    if (!this.currentSession) {
      throw new Error('No session to end');
    }
    this.currentSession.end();
    this.currentSession = undefined;
  }

  /**
   * Returns whether XR is supported. Will be undefined until initialize is
   * complete.
   */
  public isXRSupported() {
    return this.xrModeSupported;
  }

  /** Internal callback for when a session successfully starts. */
  private async onSessionStartedInternal(session: XRSession) {
    session.addEventListener('end', this.onSessionEndedBound);
    await this.renderer.xr.setSession(session);
    this.currentSession = session;

    // Fire the 'sessionstart' event with the session in the data payload
    this.dispatchEvent({
      type: WebXRSessionEventType.SESSION_START,
      session: session,
    });
  }

  /** Internal callback for when the session ends. */
  private onSessionEndedInternal(/*event*/) {
    // Fire the 'sessionend' event
    this.dispatchEvent({type: WebXRSessionEventType.SESSION_END});

    this.currentSession?.removeEventListener('end', this.onSessionEndedBound);
    this.currentSession = undefined;
  }
}
