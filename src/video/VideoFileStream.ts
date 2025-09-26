import {StreamState, VideoStream, VideoStreamDetails, VideoStreamOptions} from './VideoStream';

type VideoFileStreamDetails = VideoStreamDetails&{
  width?: number;
  height?: number;
  aspectRatio?: number;
  videoFile?: string|File;
}

export type VideoFileStreamOptions = VideoStreamOptions&{
  /** The video file path, URL, or File object. */
  videoFile?: string|File;
};

/**
 * VideoFileStream handles video playback from a file source.
 */
export class VideoFileStream extends VideoStream<VideoFileStreamDetails> {
  private videoFile_?: string|File;

  /**
   * @param options - Configuration for the file stream.
   */
  constructor({videoFile = undefined, willCaptureFrequently = false} = {}) {
    super({willCaptureFrequently});
    this.videoFile_ = videoFile;
  }

  /**
   * Initializes the file stream based on the given video file.
   */
  async init() {
    await super.init();
    if (this.videoFile_) {
      this.setState_(StreamState.INITIALIZING);
      await this.initStream_();
    } else {
      console.warn('VideoFileStream initialized without a video file.');
      this.setState_(StreamState.IDLE);
    }
  }

  /**
   * Initializes the video stream from the provided file.
   */
  protected async initStream_() {
    if (!this.videoFile_) {
      throw new Error('No video file has been provided.');
    }

    this.stop_();

    this.video_.srcObject = null;
    this.video_.src = typeof this.videoFile_ === 'string' ?
        this.videoFile_ :
        URL.createObjectURL(this.videoFile_);
    this.video_.loop = true;
    this.video_.muted = true;

    await new Promise<void>((resolve, reject) => {
      this.video_.onloadedmetadata = () => {
        this.handleVideoStreamLoadedMetadata(resolve, reject);
      };
      this.video_.onerror = () => {
        const error = new Error('Error occurred while loading the video file.');
        this.setState_(StreamState.ERROR, {error});
        reject(error);
      };
      this.video_.play();
    });

    // After metadata is loaded, set the final STREAMING state
    this.setState_(StreamState.STREAMING, {
      width: this.width,
      height: this.height,
      aspectRatio: this.aspectRatio,
      videoFile: this.videoFile_
    });
  }

  /**
   * Sets a new video file source and re-initializes the stream.
   * @param videoFile - The new video file to play.
   */
  async setSource(videoFile: string|File) {
    if (!videoFile) {
      console.warn('setSource called with no file. Stopping stream.');
      this.stop_();
      this.videoFile_ = undefined;
      return;
    }
    this.setState_(StreamState.INITIALIZING);
    this.videoFile_ = videoFile;
    await this.initStream_();
  }
}
