import {afterEach, expect, it, vi} from 'vitest';
import {VideoStream} from './VideoStream';
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
it('captures current video data at the requested size and releases owned textures', () => {
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
    drawImage() {},
    getImageData: (_x: number, _y: number, width: number, height: number) => ({
      width,
      height,
      data: new Uint8ClampedArray(width * height * 4),
    }),
  } as never);
  const stream = new VideoStream();
  stream.loaded = true;
  stream.width = 8;
  stream.height = 4;
  let ready = 1;
  Object.defineProperty(stream.video, 'readyState', {get: () => ready});
  try {
    expect(
      stream.getSnapshot({outputFormat: 'imageData', width: 2, height: 1})
    ).toBeNull();
    ready = 2;
    const image = stream.getSnapshot({
      outputFormat: 'imageData',
      width: 2,
      height: 1,
    })!;
    expect([image.width, image.height]).toEqual([2, 1]);
    expect(image.data).toHaveLength(8);
    const texture = stream.getSnapshot({
      outputFormat: 'texture',
      width: 2,
      height: 1,
    })!;
    const released = vi.spyOn(texture, 'dispose');
    stream.dispose();
    expect(released).toHaveBeenCalledOnce();
  } finally {
    stream.dispose();
  }
});
