import * as THREE from 'three';
export declare const IMMERSIVE_AR = "immersive-ar";
export declare const IMMERSIVE_VR = "immersive-vr";
declare global {
    interface XRSystem {
        offerSession?: (mode: XRSessionMode, sessionInit?: XRSessionInit) => Promise<XRSession>;
    }
}
export declare enum WebXRSessionEventType {
    UNSUPPORTED = "unsupported",
    READY = "ready",
    SESSION_START = "sessionstart",
    SESSION_END = "sessionend"
}
export type WebXRSessionManagerEventMap = THREE.Object3DEventMap & {
    [WebXRSessionEventType.UNSUPPORTED]: object;
    [WebXRSessionEventType.READY]: {
        sessionOptions: XRSessionInit;
    };
    [WebXRSessionEventType.SESSION_START]: {
        session: XRSession;
    };
    [WebXRSessionEventType.SESSION_END]: object;
};
/**
 * Manages the WebXR session lifecycle by extending THREE.EventDispatcher
 * to broadcast its state to any listener.
 */
export declare class WebXRSessionManager extends THREE.EventDispatcher<WebXRSessionManagerEventMap> {
    private renderer;
    private sessionInit;
    private mode;
    currentSession?: XRSession;
    private sessionOptions?;
    private onSessionEndedBound;
    private xrModeSupported?;
    constructor(renderer: THREE.WebGLRenderer, sessionInit: XRSessionInit, mode: XRSessionMode);
    /**
     * Checks for WebXR support and availability of the requested session mode.
     * This should be called to initialize the manager and trigger the first
     * events.
     */
    initialize(): Promise<void>;
    /**
     * Ends the WebXR session.
     */
    startSession(): void;
    /**
     * Ends the WebXR session.
     */
    endSession(): void;
    /**
     * Returns whether XR is supported. Will be undefined until initialize is
     * complete.
     */
    isXRSupported(): boolean | undefined;
    /** Internal callback for when a session successfully starts. */
    private onSessionStartedInternal;
    /** Internal callback for when the session ends. */
    private onSessionEndedInternal;
}
