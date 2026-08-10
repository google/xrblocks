import {
  isLayerCapable,
  LayerCapability,
  layerCapability,
} from './LayerCapability';

/**
 * Owns the composition layers an app adds on top of the scene.
 *
 * three.js sets `layers: [projectionLayer]` once when the session starts and
 * never touches that array again, so anything extra has to be composed back in
 * together with its layer. Dropping the projection layer would blank the scene,
 * which is why {@link setBaseLayer} is required before anything is added.
 *
 * Ordering follows the layers spec: earlier entries are composited behind later
 * ones, so the projection layer goes first and app layers sit in front of it.
 */
export class LayerManager {
  private session: XRSession | null = null;
  private binding: XRWebGLBinding | null = null;
  private gl: WebGL2RenderingContext | null = null;
  private baseLayer: XRLayer | null = null;
  private readonly layers: XRLayer[] = [];
  private capability: LayerCapability = 'unsupported';
  private preferWebGL = false;

  /**
   * Forces the WebGL path on platforms that also offer a media binding.
   *
   * Quest has both and would otherwise always take the media path, so without
   * this the WebGL path cannot be exercised on the hardware most likely to be
   * to hand.
   *
   * @param prefer - Whether to take WebGL over media.
   */
  setPreferWebGL(prefer: boolean): void {
    this.preferWebGL = prefer;
    this.capability = layerCapability(this.session, this.binding, prefer);
  }

  /**
   * Binds the manager to a session.
   *
   * @param session - The active session, or null when one ends.
   * @param binding - The WebGL binding, if one exists.
   * @param gl - The context the binding was made against. Needed to upload
   *   frames into a layer's texture on the WebGL path.
   */
  setSession(
    session: XRSession | null,
    binding: XRWebGLBinding | null = null,
    gl: WebGL2RenderingContext | null = null
  ): void {
    this.session = session;
    this.binding = binding;
    this.gl = gl;
    this.capability = layerCapability(session, binding, this.preferWebGL);
    if (!session) {
      this.layers.length = 0;
      this.baseLayer = null;
      this.binding = null;
      this.gl = null;
    }
  }

  /** @returns The WebGL binding, if the session has one. */
  getBinding(): XRWebGLBinding | null {
    return this.binding;
  }

  /** @returns The context layer textures are uploaded through. */
  getContext(): WebGL2RenderingContext | null {
    return this.gl;
  }

  /**
   * Records the layer three.js renders the scene into.
   *
   * @param layer - The projection or WebGL layer backing the scene.
   */
  setBaseLayer(layer: XRLayer | null): void {
    this.baseLayer = layer;
  }

  /** @returns Which layer path this platform supports. */
  getCapability(): LayerCapability {
    return this.capability;
  }

  /** @returns True when a layer can actually be presented. */
  isSupported(): boolean {
    return isLayerCapable(this.capability) && !!this.baseLayer;
  }

  /** @returns The layers currently composited in front of the scene. */
  getLayers(): readonly XRLayer[] {
    return this.layers;
  }

  /**
   * Adds a layer in front of the scene.
   *
   * @param layer - Layer to present.
   * @returns True when it was added and submitted.
   */
  add(layer: XRLayer): boolean {
    if (!this.session || !this.baseLayer) return false;
    if (this.layers.includes(layer)) return true;
    this.layers.push(layer);
    this.submit();
    return true;
  }

  /**
   * Removes a layer.
   *
   * @param layer - Layer to stop presenting.
   * @returns True when it was present and removed.
   */
  remove(layer: XRLayer): boolean {
    const index = this.layers.indexOf(layer);
    if (index < 0) return false;
    this.layers.splice(index, 1);
    this.submit();
    return true;
  }

  /**
   * Pushes the current layer stack to the compositor.
   *
   * Always includes the base layer, since replacing the array without it would
   * leave the scene itself unrendered.
   */
  private submit(): void {
    if (!this.session || !this.baseLayer) return;
    this.session.updateRenderState({
      layers: [this.baseLayer, ...this.layers],
    } as XRRenderStateInit);
  }
}
