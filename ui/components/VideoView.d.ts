import * as THREE from 'three';
import { VideoStream } from '../../video/VideoStream';
import { View } from '../core/View';
import { ViewOptions } from '../core/ViewOptions';
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
export declare class VideoView extends View {
    /** Default description of this view in Three.js DevTools. */
    name: string;
    /** The display mode for the video ('center' preserves aspect ratio). */
    mode: 'center' | 'stretch';
    /** The underlying HTMLVideoElement being used for playback. */
    video?: HTMLVideoElement;
    /** The URL source of the video, if loaded from a URL. */
    src?: string;
    /** VideoView resides in a panel by default. */
    isRoot: boolean;
    /** If true, the video will be muted. Default is true. */
    muted: boolean;
    /** If true, the video will loop. Default is true. */
    loop: boolean;
    /** If true, the video will attempt to play automatically. Default is true. */
    autoplay: boolean;
    /** If true, the video will play inline on mobile devices. Default is true. */
    playsInline: boolean;
    /** The cross-origin setting for the video element. Default is 'anonymous'. */
    crossOrigin: string;
    /** The material applied to the video plane. */
    material: THREE.MeshBasicMaterial;
    /** The mesh that renders the video texture. */
    mesh: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>;
    private stream_?;
    private streamReadyCallback_?;
    private texture?;
    private videoAspectRatio;
    /**
     * @param options - Configuration options for the VideoView.
     */
    constructor(options?: VideoViewOptions);
    /**
     * Initializes the component, loading from `src` if provided in options.
     */
    init(): void;
    /**
     * Loads a video from various source types. This is the main method for
     * setting the video content.
     * @param source - The video source (URL, HTMLVideoElement, VideoTexture, or
     * VideoStream).
     */
    load(source: string | HTMLVideoElement | THREE.VideoTexture | VideoStream): void;
    /**
     * Loads video content from an VideoStream, handling the 'ready' event
     * to correctly display the stream and set the aspect ratio.
     * @param stream - The VideoStream instance.
     */
    loadFromStream(stream: VideoStream): void;
    /**
     * Creates a video element and loads content from a URL.
     * @param url - The URL of the video file.
     */
    loadFromURL(url: string): void;
    /**
     * Configures the view to use an existing `HTMLVideoElement`.
     * @param videoElement - The video element to use as the source.
     */
    loadFromVideoElement(videoElement: HTMLVideoElement): void;
    /**
     * Configures the view to use an existing `THREE.VideoTexture`.
     * @param videoTextureInstance - The texture to display.
     */
    loadFromVideoTexture(videoTextureInstance: THREE.VideoTexture): void;
    /** Starts video playback. */
    play(): void;
    /** Pauses video playback. */
    pause(): void;
    private disposeStreamListener_;
    /**
     * Cleans up resources, particularly the underlying video element and texture,
     * to prevent memory leaks.
     */
    dispose(): void;
    /**
     * Updates the layout and scales the video plane to match its aspect ratio.
     * @override
     */
    updateLayout(): void;
}
