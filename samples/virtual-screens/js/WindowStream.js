import * as xb from 'xrblocks';

/**
 * Handles a remote video stream provided by an external source, rather than
 * capturing from a local device.
 */
export class WindowStream extends xb.VideoStream {
  constructor() {
    // Disabling 'willCaptureFrequently' uses a hardware-accelerated canvas.
    super({willCaptureFrequently: false});
    this.setState_(xb.StreamState.INITIALIZING);
  }

  /**
   * Sets the remote MediaStream as the source for this video stream.
   * @param {MediaStream} stream The remote MediaStream, typically from a
   * canvas rendering decoded video frames.
   */
  setStream(stream) {
    if (!stream) {
      console.error('WindowStream: Provided stream is null or undefined.');
      this.setState_(xb.StreamState.ERROR, {error: 'Invalid stream provided.'});
      return;
    }

    this.stream_ = stream;
    this.video_.srcObject = stream;

    // Must wait for the video metadata to load to get the stream's dimensions.
    this.video_.onloadedmetadata = () => {
      this.handleVideoStreamLoadedMetadata(
          () => {
            // Once metadata is loaded, the stream is ready to be displayed.
            this.setState_(
                xb.StreamState.STREAMING, {aspectRatio: this.aspectRatio});
          },
          (error) => {
            console.error(
                'WindowStream: Failed to load video metadata.', error);
            this.setState_(xb.StreamState.ERROR, {error});
          },
          true);  // Allow one retry.
    };

    this.video_.play().catch(
        (e) => console.warn('WindowStream: Autoplay was prevented.', e));
  }
}
