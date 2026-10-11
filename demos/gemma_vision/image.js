export const MAX_IMAGE_EDGE = 768;

/**
 * Compute bounded capture dimensions without enlarging the source image.
 * Pass these dimensions to the SDK's captureSnapshot rather than resizing again.
 * @param {number} width Source width in pixels.
 * @param {number} height Source height in pixels.
 * @param {number} maxEdge Longest permitted edge in pixels.
 * @returns {{width: number, height: number}}
 */
export function fitSnapshotSize(width, height, maxEdge = MAX_IMAGE_EDGE) {
  assertDimension(width);
  assertDimension(height);
  assertDimension(maxEdge);
  const scale = Math.min(1, maxEdge / Math.max(width, height));
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
}

/**
 * Copy bounded RGBA bytes into a dedicated transferable buffer. The source
 * remains owned by the caller, including after the copy is transferred.
 * @param {{width: number, height: number, data: Uint8Array | Uint8ClampedArray}} snapshot
 * @returns {{width: number, height: number, buffer: ArrayBuffer}}
 */
export function packSnapshot({width, height, data}) {
  assertDimension(width);
  assertDimension(height);
  if (width > MAX_IMAGE_EDGE || height > MAX_IMAGE_EDGE) {
    throw new RangeError(`Snapshot edges must not exceed ${MAX_IMAGE_EDGE}.`);
  }
  if (
    !(data instanceof Uint8Array || data instanceof Uint8ClampedArray) ||
    data.length !== width * height * 4
  ) {
    throw new TypeError(
      'Snapshot must contain exactly width × height × 4 RGBA bytes.'
    );
  }
  return {width, height, buffer: new Uint8Array(data).buffer};
}

function assertDimension(value) {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new RangeError('Image dimensions must be positive integers.');
  }
}
