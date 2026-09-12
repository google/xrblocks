/**
 * Options for WebXR composition layers.
 *
 * Off by default. Layers are an optional session feature and the layer types
 * an app would want are newer than the SDK's baseline browser, so asking for
 * them unconditionally would mean every app pays for a capability most do not
 * use.
 */
export class LayersOptions {
  /** Whether to request the `layers` session feature. */
  enabled = false;

  /**
   * Whether a video shown through {@link VideoView} should be presented as a
   * composition layer when the platform allows it.
   *
   * Falls back to rendering into the scene as a texture when it cannot, so an
   * app can leave this on and still work everywhere.
   */
  video = true;
}
