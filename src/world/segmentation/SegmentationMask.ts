/**
 * Per-pixel semantic categories emitted by the selfie multiclass segmentation
 * model. Index `0` is the background; every other index is part of a person,
 * so anything `>= 1` can be treated as foreground.
 */
export enum SegmentCategory {
  Background = 0,
  Hair = 1,
  BodySkin = 2,
  FaceSkin = 3,
  Clothes = 4,
  Others = 5,
}

/**
 * A single-frame segmentation result: a tightly packed, row-major map of
 * per-pixel {@link SegmentCategory} indices at the given resolution.
 */
export interface SegmentationMask {
  /** Row-major per-pixel category indices, length `width * height`. */
  data: Uint8Array;
  /** Mask width in pixels. */
  width: number;
  /** Mask height in pixels. */
  height: number;
}
