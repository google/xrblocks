/**
 * Detects what the running platform can do with WebXR composition layers.
 *
 * Layers are optional in two independent places: the session may not have been
 * granted the `layers` feature, and the binding may not offer the layer type
 * wanted. A session existing says nothing about either, so both get probed.
 *
 * `XRMediaBinding` is called out separately because it is the cheap path for
 * video, the compositor drives the video element and the app never draws a
 * frame for it, but it is far less widely implemented than the WebGL path.
 * Chrome ships quad layers via `XRWebGLBinding` and does not ship
 * `XRMediaBinding` at all, so a video layer has to work both ways.
 */
export type LayerCapability = 'media' | 'webgl' | 'unsupported';

/**
 * Works out how this platform can back a quad layer.
 *
 * @param session - The active XR session, if any.
 * @param binding - The WebGL binding, if one exists.
 * @param preferWebGL - Take the WebGL path even where a media binding exists.
 *   Quest ships both, so without this the WebGL path has no hardware to run
 *   on: every device that can take it would take the media path instead.
 * @returns Which layer path is available.
 */
export function layerCapability(
  session: XRSession | null | undefined,
  binding: XRWebGLBinding | null | undefined,
  preferWebGL = false
): LayerCapability {
  if (!session) return 'unsupported';

  const hasWebGLQuad =
    typeof (binding as {createQuadLayer?: unknown} | null)?.createQuadLayer ===
    'function';
  if (preferWebGL && hasWebGLQuad) return 'webgl';

  // Media layers need no per-frame drawing, so prefer them where present.
  const mediaBinding = (globalThis as {XRMediaBinding?: unknown})
    .XRMediaBinding;
  if (typeof mediaBinding === 'function') return 'media';

  if (hasWebGLQuad) return 'webgl';

  return 'unsupported';
}

/**
 * Whether a capability can actually present a layer.
 *
 * @param capability - Result of {@link layerCapability}.
 * @returns True when a quad layer can be created.
 */
export function isLayerCapable(capability: LayerCapability): boolean {
  return capability !== 'unsupported';
}
