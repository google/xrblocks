import * as THREE from 'three';

import {Script} from '../core/Script';

/**
 * Enum for video stream states.
 */
export enum StreamState {
  IDLE = 'idle',
  INITIALIZING = 'initializing',
  STREAMING = 'streaming',
  ERROR = 'error',
  NO_DEVICES_FOUND = 'no_devices_found',
}

export type VideoStreamDetails = {
  force?: boolean;
  error?: Error;
}

export interface VideoStreamEventMap<T> extends THREE.Object3DEventMap {
  statechange: {state: StreamState, details?: T};
}

export type VideoStreamGetSnapshotOptions = {
  /** The target width, defaults to the video width. */
  width?: number;
  /** The target height, defaults to the video height. */
  height?: number;
  /** The output format, defaults to 'texture'. */
  outputFormat?: 'texture' | 'base64' | 'imageData';
  /** The MIME type for base64 output. */
  mimeType?: string;
  /** The quality for base64 output. */
  quality?: number;
};

export type VideoStreamOptions = {
  /** Hint for performance optimization for frequent captures. */
  willCaptureFrequently?: boolean;
};

/**
 * The base class for handling video streams (from camera or file), managing
 * the underlying <video> element, streaming state, and snapshot logic.
 */
export class VideoStream<T extends VideoStreamDetails =
                                       VideoStreamDetails> extends
    Script<VideoStreamEventMap<T>> {
  loaded = false;
  width?: number;
  height?: number;
  aspectRatio?: number;
  texture: THREE.VideoTexture;
  state = StreamState.IDLE;

  protected stream_: MediaStream|null = null;
  protected video_ = document.createElement('video');

  private willCaptureFrequently_: boolean;
  private frozenTexture_: THREE.Texture|null = null;
  private canvas_: HTMLCanvasElement|null = null;
  private context_: CanvasRenderingContext2D|null = null;


  /**
   * @param options - The configuration options.
   */
  constructor({willCaptureFrequently = false}: VideoStreamOptions = {}) {
    super();

    this.willCaptureFrequently_ = willCaptureFrequently;
    this.video_.autoplay = true;
    this.video_.muted = true;
    this.video_.playsInline = true;

    this.texture = new THREE.VideoTexture(this.video_);
    this.texture.colorSpace = THREE.SRGBColorSpace;
    this.texture.minFilter = THREE.LinearFilter;
    this.texture.magFilter = THREE.LinearFilter;
  }

  /**
   * Sets the stream's state and dispatches a 'statechange' event.
   * @param state - The new state.
   * @param details - Additional data for the event payload.
   */
  protected setState_(state: StreamState, details: VideoStreamDetails|T = {}) {
    if (this.state === state && !details.force) return;
    this.state = state;
    this.dispatchEvent({type: 'statechange', state: this.state, ...details});
    console.debug(
        `VideoStream state changed to ${state} with details:`, details);
  }

  /**
   * Processes video metadata, sets dimensions, and resolves a promise.
   * @param resolve - The resolve function of the wrapping Promise.
   * @param reject - The reject function of the wrapping Promise.
   * @param allowRetry - Whether to allow a retry attempt on failure.
   */
  protected handleVideoStreamLoadedMetadata(
      resolve: () => void, reject: (_: Error) => void, allowRetry = false) {
    try {
      if (this.video_.videoWidth > 0 && this.video_.videoHeight > 0) {
        this.width = this.video_.videoWidth;
        this.height = this.video_.videoHeight;
        this.aspectRatio = this.width / this.height;
        this.loaded = true;
        resolve();
      } else if (allowRetry) {
        setTimeout(() => {
          this.handleVideoStreamLoadedMetadata(resolve, reject, false);
        }, 500);
      } else {
        const error = new Error('Failed to get valid video dimensions.');
        this.setState_(StreamState.ERROR, {error});
        reject(error);
      }
    } catch (error) {
      if (error instanceof Error) {
        this.setState_(StreamState.ERROR, {error});
        reject(error);
      }
    }
  }

  /**
   * Captures the current video frame.
   * @param options - The options for the snapshot.
   * @returns The captured data.
   */
  getSnapshot({
    width = this.width,
    height = this.height,
    outputFormat = 'texture',
    mimeType = 'image/jpeg',
    quality = 0.9
  }: VideoStreamGetSnapshotOptions = {}) {
    if (!this.loaded || !width || !height ||
        this.video_.readyState < this.video_.HAVE_CURRENT_DATA) {
      return null;
    }

    if (width > this.width! || height > this.height!) {
      console.warn(`The requested snapshot width (${width}px x ${
          height}px) is larger than the source video width (${this.width}px x ${
          this.height}px). The snapshot will be upscaled.`);
    }

    try {
      // Re-initialize canvas only if dimensions have changed.
      if (!this.canvas_ || this.canvas_.width !== width ||
          this.canvas_.height !== height) {
        this.canvas_ = document.createElement('canvas');
        this.canvas_.width = width;
        this.canvas_.height = height;
        this.context_ =
            this.canvas_.getContext(
                '2d', {willCaptureFrequently: this.willCaptureFrequently_}) as
            CanvasRenderingContext2D;
      }

      this.context_!.drawImage(this.video_, 0, 0, width, height);
      switch (outputFormat) {
        case 'imageData':
          return this.context_!.getImageData(0, 0, width, height);
        case 'base64':
          return this.canvas_.toDataURL(mimeType, quality);
        case 'texture':
        default: {
          const frozenTexture = new THREE.Texture(this.canvas_);
          frozenTexture.needsUpdate = true;
          frozenTexture.colorSpace = THREE.SRGBColorSpace;
          this.frozenTexture_ = frozenTexture;
          return this.frozenTexture_;
        }
      }
    } catch (error) {
      console.error('Error capturing snapshot:', error);
      return null;
    }
  }

  /**
   * Stops the current video stream tracks.
   */
  protected stop_() {
    if (this.stream_) {
      this.stream_.getTracks().forEach(track => track.stop());
      this.stream_ = null;
    }
    if (this.video_.srcObject) {
      this.video_.srcObject = null;
    }
    if (this.video_.src && this.video_.src.startsWith('blob:')) {
      URL.revokeObjectURL(this.video_.src);
    }
    this.video_.src = '';
    this.loaded = false;
    this.setState_(StreamState.IDLE);
  }

  /**
   * Disposes of all resources used by this stream.
   */
  override dispose() {
    this.stop_();
    this.texture?.dispose();
    this.frozenTexture_?.dispose();
    this.canvas_ = null;
    this.context_ = null;
    super.dispose();
  }
}
