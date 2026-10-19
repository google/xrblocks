import * as THREE from 'three';

/**
 * Minimal WebXR manager contract implemented by SplitEngineWebXrManager.
 */
export interface SerializerXRManager {
  enabled: boolean;
  isPresenting: boolean;
  getController(index: number): THREE.XRTargetRaySpace;
  getControllerGrip(index: number): THREE.XRGripSpace;
  getHand(index: number): THREE.XRHandSpace;
  getFrame?(): XRFrame | undefined;
  getCamera(): THREE.ArrayCamera;
  updateCamera(camera: THREE.Camera): void;
  getBinding?(): XRWebGLBinding | null;
  getReferenceSpace?(): XRReferenceSpace | null;
  setReferenceSpaceType(type: XRReferenceSpaceType): void;
  setFramebufferScaleFactor(factor: number): void;
  setSession(session: XRSession | null): Promise<void>;
  getSession?(): XRSession | null;
  addEventListener?: THREE.EventDispatcher['addEventListener'];
  removeEventListener?: THREE.EventDispatcher['removeEventListener'];
}

/**
 * Minimal renderer contract implemented by SplitEngineSerializer.
 */
export interface SerializerRenderer {
  readonly isSplitEngineSerializer: true;
  readonly xr: SerializerXRManager;
  domElement?: HTMLCanvasElement;
  shadowMap?: {
    enabled: boolean;
    type?: THREE.ShadowMapType;
    autoUpdate?: boolean;
  };
  render(scene: THREE.Object3D, camera: THREE.Camera): void;
  setSize(width: number, height: number, updateStyle?: boolean): void;
  getSize(target?: {
    set?: (w: number, h: number) => void;
    width?: number;
    height?: number;
  }): {width: number; height: number};
  setPixelRatio(value: number): void;
  getPixelRatio(): number;
  setAnimationLoop(
    callback: ((time: number, frame?: XRFrame) => void) | null
  ): void;
  dispose(): void;
}

/**
 * Factory function that returns or resolves to a `SerializerRenderer`.
 */
export type SerializerRendererFactory = () =>
  | SerializerRenderer
  | Promise<SerializerRenderer>;

/**
 * Type guard to determine if a renderer instance is a SplitEngineSerializer
 * (`SerializerRenderer`).
 *
 * @param renderer - The renderer instance to test.
 * @returns True if the renderer is a SerializerRenderer, false otherwise.
 */
export function isSerializerRenderer(
  renderer?: unknown
): renderer is SerializerRenderer {
  return (
    renderer != null &&
    typeof renderer === 'object' &&
    'isSplitEngineSerializer' in renderer &&
    (renderer as {isSplitEngineSerializer?: boolean})
      .isSplitEngineSerializer === true
  );
}
