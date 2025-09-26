import * as THREE from 'three';
import { Script } from '../core/Script';
/**
 * Enum for video stream states.
 */
export declare enum StreamState {
    IDLE = "idle",
    INITIALIZING = "initializing",
    STREAMING = "streaming",
    ERROR = "error",
    NO_DEVICES_FOUND = "no_devices_found"
}
export type VideoStreamDetails = {
    force?: boolean;
    error?: Error;
};
export interface VideoStreamEventMap<T> extends THREE.Object3DEventMap {
    statechange: {
        state: StreamState;
        details?: T;
    };
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
export declare class VideoStream<T extends VideoStreamDetails = VideoStreamDetails> extends Script<VideoStreamEventMap<T>> {
    loaded: boolean;
    width?: number;
    height?: number;
    aspectRatio?: number;
    texture: THREE.VideoTexture;
    state: StreamState;
    protected stream_: MediaStream | null;
    protected video_: HTMLVideoElement;
    private willCaptureFrequently_;
    private frozenTexture_;
    private canvas_;
    private context_;
    /**
     * @param options - The configuration options.
     */
    constructor({ willCaptureFrequently }?: VideoStreamOptions);
    /**
     * Sets the stream's state and dispatches a 'statechange' event.
     * @param state - The new state.
     * @param details - Additional data for the event payload.
     */
    protected setState_(state: StreamState, details?: VideoStreamDetails | T): void;
    /**
     * Processes video metadata, sets dimensions, and resolves a promise.
     * @param resolve - The resolve function of the wrapping Promise.
     * @param reject - The reject function of the wrapping Promise.
     * @param allowRetry - Whether to allow a retry attempt on failure.
     */
    protected handleVideoStreamLoadedMetadata(resolve: () => void, reject: (_: Error) => void, allowRetry?: boolean): void;
    /**
     * Captures the current video frame.
     * @param options - The options for the snapshot.
     * @returns The captured data.
     */
    getSnapshot({ width, height, outputFormat, mimeType, quality }?: VideoStreamGetSnapshotOptions): string | THREE.Texture | ImageData | null;
    /**
     * Stops the current video stream tracks.
     */
    protected stop_(): void;
    /**
     * Disposes of all resources used by this stream.
     */
    dispose(): void;
}
