import * as THREE from 'three';

import {LayerManager} from './LayerManager';

/**
 * How a video should sit in the world.
 *
 * A quad layer is positioned by the compositor rather than by the scene graph,
 * so it needs its pose given explicitly rather than inherited from a parent.
 */
export type VideoLayerPlacement = {
  /** Where the centre of the quad sits, in the reference space. */
  position?: THREE.Vector3;
  /** How the quad is oriented. */
  quaternion?: THREE.Quaternion;
  /** Width in metres. */
  width?: number;
  /** Height in metres. Derived from the video's aspect when omitted. */
  height?: number;
};

/** What backing a video ended up with. */
export type VideoLayerState = 'layer' | 'fallback';

/** Which binding produced the layer. */
export type VideoLayerPath = 'media' | 'webgl' | 'none';

const DEFAULT_WIDTH_M = 1.6;

/**
 * Presents a video as a composition layer where the platform allows it.
 *
 * The point is resampling. Drawn into the scene, a video goes into the eye
 * buffer and is then warped again by the compositor, so it is sampled twice and
 * the first of those is into a buffer that is already lower resolution than the
 * panel. As a layer it is sampled once, at its own resolution.
 *
 * Reports {@link VideoLayerState} rather than throwing when it cannot, so an
 * app can ask for a layer everywhere and draw the video into the scene on the
 * platforms that have no layers.
 */
export class VideoLayer {
  private layer: XRQuadLayer | null = null;
  private state: VideoLayerState = 'fallback';
  private path: VideoLayerPath = 'none';
  private video: HTMLVideoElement | null = null;
  private sourceWidth = 0;
  private sourceHeight = 0;
  private uploads = 0;
  private lastFrameTime = -1;

  /**
   * @param manager - Owns the layer stack this layer joins.
   */
  constructor(private readonly manager: LayerManager) {}

  /** @returns Whether the video is being presented as a layer. */
  getState(): VideoLayerState {
    return this.state;
  }

  /** @returns Which binding is presenting the video. */
  getPath(): VideoLayerPath {
    return this.path;
  }

  /** @returns The underlying layer, if one was created. */
  getLayer(): XRQuadLayer | null {
    return this.layer;
  }

  /**
   * Tries to present a video element as a quad layer.
   *
   * @param video - The element to present. Must already have metadata loaded
   *   for its aspect ratio to be known.
   * @param session - The active XR session.
   * @param space - Reference space the placement is expressed in.
   * @param placement - Where to put the quad.
   * @returns Whether a layer was created.
   */
  attach(
    video: HTMLVideoElement,
    session: XRSession,
    space: XRReferenceSpace,
    placement: VideoLayerPlacement = {}
  ): boolean {
    this.detach();

    if (!this.manager.isSupported()) {
      this.state = 'fallback';
      return false;
    }

    const width = placement.width ?? DEFAULT_WIDTH_M;
    const height = placement.height ?? width / aspectRatioOf(video);
    const position = placement.position ?? new THREE.Vector3(0, 0, -2);
    const quaternion = placement.quaternion ?? new THREE.Quaternion();
    const transform = new XRRigidTransform(
      {x: position.x, y: position.y, z: position.z},
      {x: quaternion.x, y: quaternion.y, z: quaternion.z, w: quaternion.w}
    );

    const capability = this.manager.getCapability();
    const layer =
      capability === 'media'
        ? createMediaLayer(video, session, space, transform, width, height)
        : capability === 'webgl'
          ? createWebGLLayer(
              this.manager.getBinding(),
              video,
              space,
              transform,
              width,
              height
            )
          : null;

    if (!layer) {
      this.state = 'fallback';
      return false;
    }

    if (!this.manager.add(layer)) {
      this.state = 'fallback';
      return false;
    }

    this.layer = layer;
    this.video = video;
    this.sourceWidth = video.videoWidth;
    this.sourceHeight = video.videoHeight;
    this.uploads = 0;
    this.lastFrameTime = -1;
    this.path = capability === 'media' ? 'media' : 'webgl';
    this.state = 'layer';
    return true;
  }

  /**
   * Draws the current video frame into the layer.
   *
   * Only the WebGL path needs this: on the media path the compositor pulls
   * frames from the element itself and the app never draws one. Safe to call
   * every frame regardless.
   *
   * @param frame - The frame being rendered.
   */
  update(frame: XRFrame): void {
    if (this.path !== 'webgl' || !this.layer || !this.video) return;
    const binding = this.manager.getBinding();
    const gl = this.manager.getContext();
    if (!binding || !gl) return;
    // The layer texture was allocated at the size the video reported when it
    // was created. If the source has since changed size, texSubImage2D would
    // raise a GL error on every frame, so re-attach instead of uploading.
    if (
      this.video.videoWidth !== this.sourceWidth ||
      this.video.videoHeight !== this.sourceHeight
    ) {
      return;
    }
    // The card streams at 30fps but the headset renders at 90, so uploading
    // every frame would push the same 2048x1152 image three times over.
    // needsRedraw still forces one, since that means the compositor lost the
    // layer's contents.
    const stale = this.video.currentTime === this.lastFrameTime;
    if (stale && !this.layer.needsRedraw) return;
    this.lastFrameTime = this.video.currentTime;

    try {
      const subImage = binding.getSubImage(this.layer, frame);
      // three.js caches GL state and skips redundant calls, so binding a
      // texture behind its back leaves its cache describing something that is
      // no longer true, and it then renders with whatever it thinks is bound.
      // Everything touched here is put back so the cache stays honest.
      const previousUnit = gl.getParameter(gl.ACTIVE_TEXTURE);
      const previousTexture = gl.getParameter(gl.TEXTURE_BINDING_2D);
      const previousFlip = gl.getParameter(gl.UNPACK_FLIP_Y_WEBGL);

      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
      gl.bindTexture(gl.TEXTURE_2D, subImage.colorTexture);
      gl.texSubImage2D(
        gl.TEXTURE_2D,
        0,
        0,
        0,
        gl.RGBA,
        gl.UNSIGNED_BYTE,
        this.video
      );

      gl.bindTexture(gl.TEXTURE_2D, previousTexture);
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, previousFlip);
      gl.activeTexture(previousUnit);
      this.uploads++;
    } catch {
      // getSubImage throws until updateRenderState has taken effect, which is
      // a frame or two after the layer is added. Dropping a frame is better
      // than tearing the layer down over a transient state.
    }
  }

  /**
   * How many frames have actually been uploaded.
   *
   * On the WebGL path the app draws every frame itself, so a count that stays
   * at zero is the difference between a layer that is presenting and one that
   * was created and then quietly did nothing.
   *
   * @returns Number of successful uploads since attaching.
   */
  getUploadCount(): number {
    return this.uploads;
  }

  /** Stops presenting the layer and returns the video to the scene. */
  detach(): void {
    if (this.layer) {
      this.manager.remove(this.layer);
      this.layer.destroy?.();
      this.layer = null;
    }
    this.video = null;
    this.sourceWidth = 0;
    this.sourceHeight = 0;
    this.path = 'none';
    this.state = 'fallback';
  }
}

/**
 * Whether this platform treats quad extents as half width and half height.
 *
 * The spec means full metres and Chromium passes them to OpenXR unchanged, but
 * the Quest browser halves them, so the same numbers give a quad at twice the
 * size there. It applies to the compositor, not to one binding, so the WebGL
 * path needs the same correction on Quest that the media path does.
 *
 * `XRMediaBinding` is the tell: Quest is the only browser that ships it, and it
 * is still present when the WebGL path is taken by choice.
 * See immersive-web/layers#324.
 *
 * @returns True when extents must be halved.
 */
function usesHalfExtents(): boolean {
  return typeof (globalThis as {XRMediaBinding?: unknown}).XRMediaBinding ===
    'function';
}

/**
 * Builds a quad layer the compositor drives itself.
 *
 * @param video - Element the compositor reads frames from.
 * @param session - Session the binding is made against.
 * @param space - Space the transform is expressed in.
 * @param transform - Where the quad sits.
 * @param width - Full width in metres.
 * @param height - Full height in metres.
 * @returns The layer, or null when the platform refuses it.
 */
function createMediaLayer(
  video: HTMLVideoElement,
  session: XRSession,
  space: XRReferenceSpace,
  transform: XRRigidTransform,
  width: number,
  height: number
): XRQuadLayer | null {
  const MediaBinding = (
    globalThis as {
      XRMediaBinding?: new (session: XRSession) => {
        createQuadLayer: (video: HTMLVideoElement, init: object) => XRQuadLayer;
      };
    }
  ).XRMediaBinding;
  if (!MediaBinding) return null;

  const scale = usesHalfExtents() ? 0.5 : 1;
  try {
    return new MediaBinding(session).createQuadLayer(video, {
      space,
      layout: 'mono',
      transform,
      width: width * scale,
      height: height * scale,
    });
  } catch {
    // A platform can advertise the binding and still refuse a given video, for
    // example one whose metadata has not loaded yet.
    return null;
  }
}

/**
 * Builds a quad layer the app draws into each frame.
 *
 * This is the path Chrome and Android XR need, since neither implements
 * `XRMediaBinding`.
 *
 * @param binding - The WebGL binding for the session.
 * @param video - Element frames are uploaded from.
 * @param space - Space the transform is expressed in.
 * @param transform - Where the quad sits.
 * @param width - Full width in metres.
 * @param height - Full height in metres.
 * @returns The layer, or null when the platform refuses it.
 */
function createWebGLLayer(
  binding: XRWebGLBinding | null,
  video: HTMLVideoElement,
  space: XRReferenceSpace,
  transform: XRRigidTransform,
  width: number,
  height: number
): XRQuadLayer | null {
  if (!binding?.createQuadLayer) return null;
  // The texture is allocated once at this size and texSubImage2D refuses a
  // source that does not fit it. Guessing here and uploading a differently
  // sized frame raises a GL error every frame, which can take the session down
  // with it, so wait for the real dimensions instead.
  if (!video.videoWidth || !video.videoHeight) return null;

  const scale = usesHalfExtents() ? 0.5 : 1;
  try {
    return binding.createQuadLayer({
      space,
      // 'default' is a TypeError on a quad layer, so it has to be named.
      layout: 'mono',
      transform,
      width: width * scale,
      height: height * scale,
      viewPixelWidth: video.videoWidth,
      viewPixelHeight: video.videoHeight,
      // A video changes every frame. getSubImage throws InvalidStateError on a
      // static layer once needsRedraw has gone false.
      isStatic: false,
    } as XRQuadLayerInit);
  } catch {
    return null;
  }
}

/**
 * Aspect ratio of a video, falling back to 16:9 before metadata arrives.
 *
 * @param video - The element to measure.
 * @returns Width divided by height.
 */
export function aspectRatioOf(video: HTMLVideoElement): number {
  if (video.videoWidth > 0 && video.videoHeight > 0) {
    return video.videoWidth / video.videoHeight;
  }
  return 16 / 9;
}
