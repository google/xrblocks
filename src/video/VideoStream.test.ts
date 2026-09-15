import type {VideoTexture} from 'three';
import {describe, expect, it, vi} from 'vitest';

import {VideoStream} from './VideoStream';

function createReadyStateVideoStream() {
  const stream = new VideoStream();
  let readyState = 0;

  Object.defineProperty(stream.video, 'readyState', {
    configurable: true,
    get: () => readyState,
  });
  Object.defineProperty(stream.video, 'HAVE_CURRENT_DATA', {
    configurable: true,
    value: 2,
  });

  return {
    stream,
    setReadyState: (nextReadyState: number) => {
      readyState = nextReadyState;
    },
  };
}

describe('VideoStream', () => {
  it('does not mark the texture dirty before the video has current data', () => {
    const {stream, setReadyState} = createReadyStateVideoStream();
    const texture = stream.texture as VideoTexture & {update: () => void};
    const initialVersion = texture.version;

    setReadyState(1);
    texture.update();

    expect(texture.version).toBe(initialVersion);
  });

  it('marks the texture dirty when the video has current data', () => {
    const {stream, setReadyState} = createReadyStateVideoStream();
    const texture = stream.texture as VideoTexture & {update: () => void};
    const initialVersion = texture.version;

    setReadyState(2);
    texture.update();

    expect(texture.version).toBeGreaterThan(initialVersion);
  });

  it('stops active tracks and releases textures on dispose', () => {
    const stream = new VideoStream();
    const stop = vi.fn();
    const mediaStream = {
      getTracks: () => [{stop}],
    } as unknown as MediaStream;
    const internal = stream as unknown as {stream_: MediaStream | null};
    internal.stream_ = mediaStream;
    Object.defineProperty(stream.video, 'srcObject', {
      configurable: true,
      writable: true,
      value: mediaStream,
    });
    const disposeTexture = vi.spyOn(stream.texture, 'dispose');

    stream.dispose();

    expect(stop).toHaveBeenCalledOnce();
    expect(stream.video.srcObject).toBeNull();
    expect(disposeTexture).toHaveBeenCalledOnce();
  });
});
