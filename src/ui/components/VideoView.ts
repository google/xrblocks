import * as THREE from 'three';

import {VideoStream, VideoStreamDetails} from '../../video/VideoStream';
import {View} from '../core/View';
import {ViewOptions} from '../core/ViewOptions';
import {DragMode} from '../../ux/DragManager';

/**
 * A UI component for displaying video content on a 3D plane. It
 * supports various sources, including URLs, HTMLVideoElement,
 * THREE.VideoTexture, and the XR Blocks `VideoStream` class. It automatically
 * handles aspect ratio correction to prevent distortion.
 */
export type VideoViewOptions = ViewOptions & {
  src?: string;
  muted?: boolean;
  loop?: boolean;
  autoplay?: boolean;
  playsInline?: boolean;
  crossOrigin?: string;
  mode?: 'center' | 'stretch';
};

export class VideoView extends View {
  draggingMode = DragMode.DO_NOT_DRAG;
  /** Default description of this view in Three.js DevTools. */
  name: string = 'VideoView';
  /** The display mode for the video ('center' preserves aspect ratio). */
  mode: 'center' | 'stretch' = 'center';
  /** The underlying HTMLVideoElement being used for playback. */
  video?: HTMLVideoElement;
  /** The URL source of the video, if loaded from a URL. */
  src?: string;
  /** VideoView resides in a panel by default. */
  isRoot = false;

  /** If true, the video will be muted. Default is true. */
  muted = true;
  /** If true, the video will loop. Default is true. */
  loop = true;
  /** If true, the video will attempt to play automatically. Default is true. */
  autoplay = true;
  /** If true, the video will play inline on mobile devices. Default is true. */
  playsInline = true;
  /** The cross-origin setting for the video element. Default is 'anonymous'. */
  crossOrigin = 'anonymous';

  /** The material applied to the video plane. */
  material: THREE.MeshBasicMaterial;
  /** The mesh that renders the video texture. */
  mesh: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>;

  private stream_?: VideoStream;
  private streamReadyCallback_?: (event: {
    details?: VideoStreamDetails & {
      aspectRatio?: number;
    };
  }) => void;

  private texture?: THREE.Texture;
  private videoAspectRatio: number = 0.0;

  /**
   * @param options - Configuration options for the VideoView.
   */
  constructor(options: VideoViewOptions = {}) {
    super(options);
    // set video options if passed in
    this.autoplay = options.autoplay ?? this.autoplay;
    this.muted = options.muted ?? this.muted;
    this.loop = options.loop ?? this.loop;
    this.playsInline = options.playsInline ?? this.playsInline;
    if (options.crossOrigin) this.crossOrigin = options.crossOrigin;
    if (options.mode) this.mode = options.mode;

    const videoGeometry = new THREE.PlaneGeometry(1, 1);
    const videoMaterial = new THREE.MeshBasicMaterial({
      transparent: true,
      blending: THREE.NoBlending,
      toneMapped: false,
      depthWrite: true,
      side: THREE.DoubleSide,
      // `map` will be set based on options.texture or during load
    });
    this.mesh = new THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>(
      videoGeometry,
      videoMaterial
    );
    this.material = videoMaterial;
    this.add(this.mesh);

    if (this.texture instanceof THREE.Texture) {
      this.material.map = this.texture;
    } else {
      this.texture = new THREE.Texture();
      this.material.map = this.texture;
    }
  }

  /**
   * Initializes the component, loading from `src` if provided in options.
   */
  init() {
    super.init(); // Calls View's init method.

    if (
      this.material.map instanceof THREE.VideoTexture &&
      this.material.map.image
    ) {
      this.loadFromVideoTexture(this.material.map);
    } else if (this.src) {
      this.load(this.src);
    }
  }

  /**
   * Loads a video from various source types. This is the main method for
   * setting the video content.
   * @param source - The video source (URL, HTMLVideoElement, VideoTexture, or
   * VideoStream).
   */
  load(source: string | HTMLVideoElement | THREE.Texture | VideoStream) {
    if (source instanceof HTMLVideoElement) {
      this.loadFromVideoElement(source);
    } else if (source instanceof THREE.VideoTexture) {
      this.loadFromVideoTexture(source);
    } else if (source instanceof THREE.Texture) {
      this.loadFromTexture(source);
    } else if (typeof source === 'string') {
      this.loadFromURL(source);
    } else if (source instanceof VideoStream) {
      this.loadFromStream(source);
    } else {
      console.error('VideoView: Invalid video source provided.', source);
    }
  }

  /**
   * Loads video content from an VideoStream, handling the 'ready' event
   * to correctly display the stream and set the aspect ratio.
   * @param stream - The VideoStream instance.
   */
  loadFromStream(stream: VideoStream) {
    this.disposeStreamListener_();
    this.stream_ = stream;

    this.streamReadyCallback_ = (event: {
      details?: {aspectRatio?: number};
      aspectRatio?: number;
    }) => {
      if (!this.stream_?.texture) {
        console.warn('Stream is ready, but its texture is not available.');
        return;
      }
      if (this.stream_.texture instanceof THREE.VideoTexture) {
        this.loadFromVideoTexture(this.stream_.texture);
      } else {
        this.loadFromTexture(this.stream_.texture);
      }
      // The event from VideoStream provides the definitive aspect ratio
      const aspectRatio = event.aspectRatio ?? event.details?.aspectRatio;
      if (aspectRatio !== undefined) {
        this.videoAspectRatio = aspectRatio;
      }
      this.updateLayout();
    };

    if (this.stream_.loaded) {
      // If the stream is already loaded, manually trigger the handler
      this.streamReadyCallback_({
        details: {aspectRatio: this.stream_.aspectRatio!},
      });
    } else {
      // Otherwise, wait for the 'ready' event
      this.stream_.addEventListener('statechange', this.streamReadyCallback_);
    }
  }

  /**
   * Creates a video element and loads content from a URL.
   * @param url - The URL of the video file.
   */
  loadFromURL(url: string) {
    this.src = url;
    const videoElement = document.createElement('video');
    videoElement.muted = this.muted;
    videoElement.loop = this.loop;
    videoElement.playsInline = this.playsInline;
    videoElement.autoplay = this.autoplay;
    videoElement.crossOrigin = this.crossOrigin;
    videoElement.src = url;
    this.loadFromVideoElement(videoElement);
  }

  /**
   * Configures the view to use an existing `HTMLVideoElement`.
   * @param videoElement - The video element to use as the source.
   */
  loadFromVideoElement(videoElement: HTMLVideoElement) {
    this.video = videoElement;

    if (this.video.autoplay && this.video.paused) {
      this.video.play().catch((error) => {
        console.warn('VideoView: Autoplay prevented for video element.', error);
      });
    }

    const videoTextureInstance = new THREE.VideoTexture(this.video);
    videoTextureInstance.colorSpace = THREE.SRGBColorSpace;

    this.texture = videoTextureInstance; // Update internal texture reference
    this.material.map = this.texture;

    const onLoadedMetadata = () => {
      if (this.video!.videoWidth && this.video!.videoHeight) {
        this.videoAspectRatio =
          this.video!.videoWidth / this.video!.videoHeight;
      } else {
        console.warn('VideoView: Video metadata loaded but dimensions are 0.');
        this.videoAspectRatio = 0; // Invalid aspect ratio
      }
      this.updateLayout(); // Update layout now that aspect ratio is known
    };

    if (this.video.readyState >= this.video.HAVE_METADATA) {
      onLoadedMetadata();
    } else {
      this.video.addEventListener('loadedmetadata', onLoadedMetadata, {
        once: true,
      });
    }
  }

  /**
   * Configures the view to use an existing `THREE.VideoTexture`.
   * @param videoTextureInstance - The texture to display.
   */
  loadFromVideoTexture(videoTextureInstance: THREE.VideoTexture) {
    this.texture = videoTextureInstance;
    this.material.map = this.texture;
    this.video = this.texture.image as HTMLVideoElement; // Underlying video

    if (this.video && this.video.videoWidth && this.video.videoHeight) {
      this.videoAspectRatio = this.video.videoWidth / this.video.videoHeight;
      this.updateLayout();
    } else if (this.video) {
      this.video.addEventListener(
        'loadedmetadata',
        () => {
          if (this.video!.videoWidth && this.video!.videoHeight) {
            this.videoAspectRatio =
              this.video!.videoWidth / this.video!.videoHeight;
          } else {
            this.videoAspectRatio = 0;
          }
          this.updateLayout();
        },
        {once: true}
      );
    } else {
      console.warn(
        'VideoView: VideoTexture does not have a valid underlying video element.'
      );
      this.videoAspectRatio = 0;
      this.updateLayout();
    }
  }

  /**
   * Configures the view to use a generic texture, such as an ExternalTexture
   * produced by WebXR camera access.
   * @param textureInstance - The texture to display.
   */
  loadFromTexture(textureInstance: THREE.Texture) {
    this.texture = textureInstance;
    this.material.map = this.texture ?? null;
    this.video = undefined;
    this.updateLayout();
  }

  /** Starts video playback. */
  play() {
    if (this.video && this.video.paused) {
      this.video
        .play()
        .catch((e) => console.warn('VideoView: Error playing video:', e));
    }
  }

  /** Pauses video playback. */
  pause() {
    if (this.video && !this.video.paused) {
      this.video.pause();
    }
  }

  private disposeStreamListener_() {
    if (this.stream_ && this.streamReadyCallback_) {
      this.stream_.removeEventListener(
        'statechange',
        this.streamReadyCallback_
      );
      this.stream_ = undefined;
      this.streamReadyCallback_ = undefined;
    }
  }

  /**
   * Cleans up resources, particularly the underlying video element and texture,
   * to prevent memory leaks.
   */
  dispose() {
    this.disposeStreamListener_();

    if (this.video) {
      this.video.pause();
      this.video.removeAttribute('src');
      this.video.load();
      this.video = undefined;
    }
    if (this.texture) {
      this.texture.dispose();
      this.texture = undefined;
    }
    super.dispose();
  }

  /**
   * Updates the layout and scales the video plane to match its aspect ratio.
   * @override
   */
  updateLayout() {
    super.updateLayout();
    if (
      this.mode === 'stretch' ||
      this.videoAspectRatio <= 0 ||
      !this.material.map
    ) {
      return;
    }
    this.mesh.scale.set(
      Math.min(this.rangeX, this.videoAspectRatio * this.rangeY),
      Math.min(this.rangeY, this.rangeX / this.videoAspectRatio),
      1
    );
  }
}
