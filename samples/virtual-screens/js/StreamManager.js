/**
 * Manages the lifecycle of screen sharing for multiple windows by
 * encoding/decoding video streams using the WebCodecs API and communicating
 * with the server.
 */
export class StreamManager {
  /**
   * @param {WebSocketManager} webSocketManager An instance for communication.
   */
  constructor(webSocketManager) {
    this.webSocketManager = webSocketManager;
    // This map holds the state for each stream, whether sending or receiving.
    this.streams = new Map();
    this.onStreamAvailable = null;
    this.onStreamEnded = null;
    this.pollInterval = null;

    // Bind `this` to ensure the methods have the correct context when called.
    this.webSocketManager.setRequestHandler(
        this.handleServerRequest.bind(this));
    this.webSocketManager.setBinaryHandler(this.onStreamData.bind(this));
  }

  /**
   * Handles a JSON-RPC request from the server.
   * @param {object} request The parsed request object from the server.
   * @private
   */
  async handleServerRequest(request) {
    const {target, func, args} = request.params;
    if (target !== 'streamManager') return;

    if (func === 'onStreamEnded') {
      this._handleStreamEnded(args[0]);
      return;
    }

    if (typeof this[func] === 'function') {
      this[func].apply(this, args);
    }
  }

  /**
   * Sends a JSON-RPC request to the server's StreamManager.
   * @param {string} func The name of the method to call.
   * @param {Array<any>=} args The arguments for the method.
   * @returns {Promise<any>} A promise that resolves with the server's response.
   */
  request(func, args = []) {
    return this.webSocketManager.request('streamManager', func, args);
  }

  // ===================================================================
  // Sender-Side Logic
  // ===================================================================

  /**
   * Starts sharing a screen capture MediaStream.
   * @param {string} streamId A unique identifier for this stream.
   * @param {MediaStream} stream The media stream to be shared.
   * @param {string} displaySurface The type of surface ('window', 'monitor').
   */
  async shareStream(streamId, stream, displaySurface) {
    const videoTrack = stream.getVideoTracks()[0];
    const trackProcessor = new MediaStreamTrackProcessor({track: videoTrack});
    const reader = trackProcessor.readable.getReader();

    const streamState = {
      encoder: null,
      reader,
      isStreaming: true,
      isKeyFrameRequested: true,
      cropRect: null,
      displaySurface: displaySurface,
    };
    this.streams.set(streamId, streamState);

    videoTrack.onended = () => this.stopStream(streamId);
    this.processFrames(streamId, videoTrack);
  }

  /**
   * Stops a specific stream from being shared.
   * @param {string} streamId The ID of the stream to stop.
   */
  async stopStream(streamId) {
    const streamState = this.streams.get(streamId);
    if (!streamState) return;

    streamState.isStreaming = false;
    if (streamState.reader) streamState.reader.cancel();

    if (streamState.encoder && streamState.encoder.state !== 'closed') {
      await streamState.encoder.flush();
      streamState.encoder.close();
    }
    this.streams.delete(streamId);
    await this.request('stop_stream', [streamId]);
  }

  /**
   * Continuously reads frames from a MediaStreamTrack and encodes them.
   * @param {string} streamId The ID of the stream to process frames for.
   * @param {MediaStreamVideoTrack} videoTrack The video track being streamed.
   * @private
   */
  async processFrames(streamId, videoTrack) {
    const streamState = this.streams.get(streamId);
    if (!streamState) return;

    const {reader} = streamState;
    let {encoder} = streamState;

    while (streamState.isStreaming) {
      try {
        const {value: frame, done} = await reader.read();
        if (done) break;

        // On the first frame, configure the encoder with the right dimensions.
        if (!encoder) {
          const trackSettings = videoTrack.getSettings();
          let rect = {
            x: 0,
            y: 0,
            width: frame.codedWidth,
            height: frame.codedHeight,
          };

          // For window captures, the browser may provide a full-screen frame
          // with the window content inside; `visibleRect` gives the true size.
          if (streamState.displaySurface === 'window' && frame.visibleRect) {
            rect = frame.visibleRect;
          }

          // Ensure dimensions are even numbers, as required by many codecs.
          const codedWidth = rect.width - (rect.width % 2);
          const codedHeight = rect.height - (rect.height % 2);

          if (codedWidth === 0 || codedHeight === 0) {
            frame.close();
            this.stopStream(streamId);
            return;
          }

          // This cropRect is used on all subsequent frames for this stream.
          streamState.cropRect =
              {x: rect.x, y: rect.y, width: codedWidth, height: codedHeight};

          encoder = new VideoEncoder({
            output: (chunk) => this._outputHandler(chunk, streamId),
            error: (e) =>
                console.error(`VideoEncoder error for stream ${streamId}:`, e),
          });

          await encoder.configure({
            codec: 'vp8',
            width: codedWidth,
            height: codedHeight,
            bitrate: 2_000_000,
            latencyMode: 'realtime',
          });

          // Now that the true dimensions are known, notify the server.
          await this.request(
              'start_stream',
              [streamId, {width: codedWidth, height: codedHeight}]);
          streamState.encoder = encoder;
        }

        // Clone the frame using the calculated cropRect to ensure only the
        // relevant part of the frame is encoded.
        const frameToEncode = frame.clone({rect: streamState.cropRect});

        if (encoder.encodeQueueSize < 30) {
          const needsKeyFrame = streamState.isKeyFrameRequested;
          if (needsKeyFrame) streamState.isKeyFrameRequested = false;
          encoder.encode(frameToEncode, {keyFrame: needsKeyFrame});
        }

        frame.close();
        frameToEncode.close();
      } catch (e) {
        break;  // Loop will terminate if reader is cancelled.
      }
    }
  }

  /**
   * Handles the output of the video encoder, wrapping chunks with stream
   * metadata before sending them over the WebSocket.
   * @param {EncodedVideoChunk} chunk The encoded video data.
   * @param {string} streamId The ID of the stream this chunk belongs to.
   * @private
   */
  _outputHandler(chunk, streamId) {
    const streamIdBytes = new TextEncoder().encode(streamId);
    // [1 byte for streamId length] + [streamId] + [1 byte for frame type].
    const headerSize = 1 + streamIdBytes.length + 1;
    const buffer = new ArrayBuffer(chunk.byteLength + headerSize);
    const view = new DataView(buffer);
    let offset = 0;

    view.setUint8(offset, streamIdBytes.length);
    offset += 1;
    new Uint8Array(buffer, offset, streamIdBytes.length).set(streamIdBytes);
    offset += streamIdBytes.length;

    // 0 for key frame, 1 for delta frame.
    view.setUint8(offset, chunk.type === 'key' ? 0 : 1);
    offset += 1;

    chunk.copyTo(new Uint8Array(buffer, offset));
    this.webSocketManager.sendBinary(buffer);
  }


  /**
   * Called via RPC from the server to request a key frame.
   * @param {string} streamId The ID of the stream to trigger.
   * @private
   */
  triggerKeyFrame(streamId) {
    const streamState = this.streams.get(streamId);
    if (!streamState) return;
    streamState.isKeyFrameRequested = true;
  }

  // ===================================================================
  // Receiver-Side Logic
  // ===================================================================

  /**
   * Sets up the client to receive incoming window share streams.
   * @param {function(string, MediaStream, object): void} onStreamAvailable
   * Callback for new streams.
   * @param {function(string): void} onStreamEnded Callback for ended streams.
   */
  startReceiving(onStreamAvailable, onStreamEnded) {
    this.onStreamAvailable = onStreamAvailable;
    this.onStreamEnded = onStreamEnded;

    this.pollInterval = setInterval(async () => {
      const activeStreams = await this.request('get_active_streams');
      const activeStreamIds = new Set(Object.keys(activeStreams));

      for (const streamId of activeStreamIds) {
        if (!this.streams.has(streamId)) {
          this._handleNewStream(streamId, activeStreams[streamId]);
        }
      }

      for (const streamId of this.streams.keys()) {
        if (!activeStreamIds.has(streamId)) {
          this._handleStreamEnded(streamId);
        }
      }
    }, 1000);
  }

  /**
   * Cleans up all receiver-side resources for a stream.
   * @param {string} streamId The ID of the stream.
   * @private
   */
  _handleStreamEnded(streamId) {
    const streamState = this.streams.get(streamId);
    if (!streamState) return;

    if (streamState.decoder && streamState.decoder.state !== 'closed') {
      streamState.decoder.close();
    }
    this.streams.delete(streamId);
    if (this.onStreamEnded) this.onStreamEnded(streamId);
  }

  /**
   * Initializes local state for a new stream and tells the server to start
   * sending data.
   * @param {string} streamId The ID of the stream.
   * @param {object} streamInfo Metadata about the stream.
   * @private
   */
  async _handleNewStream(streamId, streamInfo) {
    this.streams.set(streamId, {
      decoder: null,
      streamInfo: streamInfo,
      isWaitingForKeyFrame: true,
    });
    await this.request('subscribe_to_stream', [streamId]);
  }

  /**
   * Handles incoming multiplexed binary video data from the WebSocket.
   * @param {ArrayBuffer} data The raw binary data.
   * @private
   */
  onStreamData(data) {
    try {
      const view = new DataView(data);
      const streamIdLength = view.getUint8(0);
      let offset = 1;
      const streamId = new TextDecoder().decode(
          new Uint8Array(data, offset, streamIdLength));
      offset += streamIdLength;
      const frameType = view.getUint8(offset);
      offset += 1;

      const streamState = this.streams.get(streamId);
      if (!streamState) return;

      const chunk = new EncodedVideoChunk({
        type: frameType === 0 ? 'key' : 'delta',
        timestamp: performance.now(),
        data: data.slice(offset),
      });

      if (streamState.isWaitingForKeyFrame) {
        if (chunk.type === 'key') {
          streamState.isWaitingForKeyFrame = false;
          this.initializeDecoder(streamId);
        } else {
          // Discard delta frames until the first key frame is received.
          return;
        }
      }

      if (streamState.decoder?.state === 'configured') {
        streamState.decoder.decode(chunk);
      }
    } catch (e) {
      console.error('Error processing incoming stream data:', e);
    }
  }

  /**
   * Initializes the video decoder and the canvas for rendering.
   * @param {string} streamId The ID of the stream to initialize.
   * @private
   */
  initializeDecoder(streamId) {
    const streamState = this.streams.get(streamId);
    if (!streamState) return;

    const {streamInfo} = streamState;
    const canvas = document.createElement('canvas');
    canvas.width = streamInfo.width;
    canvas.height = streamInfo.height;
    const ctx = canvas.getContext('2d');

    streamState.decoder = new VideoDecoder({
      output: (frame) => {
        ctx.drawImage(frame, 0, 0);
        frame.close();
      },
      error: (e) =>
          console.error(`VideoDecoder error for stream ${streamId}:`, e),
    });

    streamState.decoder.configure({
      codec: 'vp8',
      width: streamInfo.width,
      height: streamInfo.height,
    });

    const mediaStream = canvas.captureStream();
    this.onStreamAvailable(streamId, mediaStream, streamInfo);
  }
}
