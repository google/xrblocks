import * as THREE from 'three';

// Event type definitions for clarity
export enum WebXRSessionEventType {
  UNSUPPORTED = 'unsupported',
  READY = 'ready',
  SESSION_START = 'sessionstart',
  SESSION_END = 'sessionend',
}

export type WebXRSessionManagerEventMap = THREE.Object3DEventMap & {
  [WebXRSessionEventType.UNSUPPORTED]: object;
  [WebXRSessionEventType.READY]: {sessionOptions: XRSessionInit};
  [WebXRSessionEventType.SESSION_START]: {session: XRSession};
  [WebXRSessionEventType.SESSION_END]: object;
};

/**
 * Manages the WebXR session lifecycle by extending THREE.EventDispatcher
 * to broadcast its state to any listener.
 */
export class WebXRSessionManager extends THREE.EventDispatcher<WebXRSessionManagerEventMap> {
  public currentSession?: XRSession;
  private sessionOptions?: XRSessionInit;
  private xrModeSupported?: boolean;
  private waitingForXRSession = false;
  private disposed = false;
  private disposalPromise?: Promise<void>;

  constructor(
    private renderer: THREE.WebGLRenderer,
    private sessionInit: XRSessionInit,
    private mode: XRSessionMode
  ) {
    super(); // Initialize the EventDispatcher
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
      if (this.disposed) return;
      console.error('Error getting isSessionSupported', e);
      this.xrModeSupported = false;
      this.dispatchEvent({type: WebXRSessionEventType.UNSUPPORTED});
      return;
    }

    if (this.disposed) return;

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
          .then(this.onSessionStartedInternal)
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
    if (this.disposed) {
      throw new Error('WebXRSessionManager has been disposed');
    } else if (this.xrModeSupported === undefined) {
      throw new Error('Initialize not yet complete');
    } else if (!this.xrModeSupported) {
      throw new Error('WebXR not supported');
    } else if (this.currentSession) {
      throw new Error('Session already started');
    } else if (this.waitingForXRSession) {
      throw new Error('Waiting for session to start');
    }
    this.waitingForXRSession = true;
    navigator
      .xr!.requestSession(this.mode, this.sessionOptions)
      .finally(() => {
        this.waitingForXRSession = false;
      })
      .then(this.onSessionStartedInternal)
      .catch((err) => {
        console.error(
          'Error requesting session',
          err,
          'mode:',
          this.mode,
          'sesionOptions:',
          this.sessionOptions
        );
      });
  }

  /**
   * Ends the WebXR session.
   */
  public async endSession(): Promise<void> {
    const session = this.currentSession;
    if (!session) {
      throw new Error('No session to end');
    }
    try {
      await session.end();
    } finally {
      session.removeEventListener('end', this.onSessionEndedInternal);
      if (this.currentSession === session) this.currentSession = undefined;
    }
  }

  /**
   * Returns whether XR is supported. Will be undefined until initialize is
   * complete.
   */
  public isXRSupported() {
    return this.xrModeSupported;
  }

  public getSessionOptions() {
    return this.sessionOptions;
  }

  /** Internal callback for when a session successfully starts. */
  private onSessionStartedInternal = async (session: XRSession) => {
    if (this.disposed) {
      await session.end();
      return;
    }
    session.addEventListener('end', this.onSessionEndedInternal);
    try {
      await this.renderer.xr.setSession(session);
    } catch (error) {
      session.removeEventListener('end', this.onSessionEndedInternal);
      throw error;
    }
    if (this.disposed) {
      session.removeEventListener('end', this.onSessionEndedInternal);
      await session.end();
      return;
    }
    this.currentSession = session;

    // Fire the 'sessionstart' event with the session in the data payload
    this.dispatchEvent({
      type: WebXRSessionEventType.SESSION_START,
      session: session,
    });
  };

  /** Internal callback for when the session ends. */
  private onSessionEndedInternal = () => {
    const session = this.currentSession;
    session?.removeEventListener('end', this.onSessionEndedInternal);
    this.currentSession = undefined;
    if (!this.disposed) {
      this.dispatchEvent({type: WebXRSessionEventType.SESSION_END});
    }
  };

  dispose(): Promise<void> {
    if (this.disposalPromise) return this.disposalPromise;
    this.disposed = true;
    this.disposalPromise = this.currentSession
      ? this.endSession()
      : Promise.resolve();
    return this.disposalPromise;
  }
}
