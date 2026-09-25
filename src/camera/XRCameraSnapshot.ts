/** Flips RGBA pixels read from WebGL's bottom-left origin into top-left image order. */
export function flipWebGLPixelRows(
  source: Uint8Array | Uint8ClampedArray,
  width: number,
  height: number
) {
  const rowBytes = width * 4;
  const target = new Uint8ClampedArray(source.length);
  for (let y = 0; y < height; y++) {
    const sourceStart = (height - 1 - y) * rowBytes;
    const targetStart = y * rowBytes;
    target.set(
      source.subarray(sourceStart, sourceStart + rowBytes),
      targetStart
    );
  }
  return target;
}
