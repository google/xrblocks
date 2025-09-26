import { VideoStream, VideoStreamDetails, VideoStreamOptions } from './VideoStream';
type VideoFileStreamDetails = VideoStreamDetails & {
    width?: number;
    height?: number;
    aspectRatio?: number;
    videoFile?: string | File;
};
export type VideoFileStreamOptions = VideoStreamOptions & {
    /** The video file path, URL, or File object. */
    videoFile?: string | File;
};
/**
 * VideoFileStream handles video playback from a file source.
 */
export declare class VideoFileStream extends VideoStream<VideoFileStreamDetails> {
    private videoFile_?;
    /**
     * @param options - Configuration for the file stream.
     */
    constructor({ videoFile, willCaptureFrequently }?: {
        videoFile?: undefined;
        willCaptureFrequently?: boolean | undefined;
    });
    /**
     * Initializes the file stream based on the given video file.
     */
    init(): Promise<void>;
    /**
     * Initializes the video stream from the provided file.
     */
    protected initStream_(): Promise<void>;
    /**
     * Sets a new video file source and re-initializes the stream.
     * @param videoFile - The new video file to play.
     */
    setSource(videoFile: string | File): Promise<void>;
}
export {};
