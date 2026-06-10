interface XRSystem {
  offerSession?: (
    mode: XRSessionMode,
    sessionInit?: XRSessionInit
  ) => Promise<XRSession>;
}

/**
 * WebXR Raw Camera Access API types.
 * @see https://immersive-web.github.io/raw-camera-access/
 */
interface XRCamera {
  readonly width: number;
  readonly height: number;
}
