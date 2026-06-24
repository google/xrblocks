/** A raw RGBA image: `data` is width*height*4 bytes, row-major. */
export interface RgbaImage {
  data: Uint8ClampedArray;
  width: number;
  height: number;
}

/** Options for {@link keyOutBackground}. */
export interface BackgroundKeyOptions {
  /**
   * Maximum Euclidean RGB distance (0-441) from the sampled background color
   * for a pixel to be treated as background and made transparent.
   */
  tolerance?: number;
}

const DEFAULT_TOLERANCE = 48;

/**
 * Estimates the background color of an image by averaging its four corner
 * pixels. Generated images from the default {@link GenerativeOptions}
 * instruction place the subject on a plain, uniform background, so the corners
 * are a reliable sample.
 * @param image - The source RGBA image.
 * @returns The estimated `[r, g, b]` background color (0-255).
 */
export function estimateBackgroundColor(
  image: RgbaImage
): [number, number, number] {
  const {data, width, height} = image;
  const corners = [
    0,
    (width - 1) * 4,
    (height - 1) * width * 4,
    ((height - 1) * width + (width - 1)) * 4,
  ];
  let r = 0;
  let g = 0;
  let b = 0;
  for (const offset of corners) {
    r += data[offset];
    g += data[offset + 1];
    b += data[offset + 2];
  }
  return [r / corners.length, g / corners.length, b / corners.length];
}

/**
 * Makes background-colored pixels transparent, turning a subject-on-a-plain-
 * background image into a clean cutout. Operates on a copy; the input is not
 * mutated.
 * @param image - The source RGBA image.
 * @param options - Keying options.
 * @returns A new {@link RgbaImage} with background pixels set to alpha 0.
 */
export function keyOutBackground(
  image: RgbaImage,
  options: BackgroundKeyOptions = {}
): RgbaImage {
  const tolerance = options.tolerance ?? DEFAULT_TOLERANCE;
  const [bgR, bgG, bgB] = estimateBackgroundColor(image);
  const toleranceSquared = tolerance * tolerance;

  const out = new Uint8ClampedArray(image.data);
  for (let i = 0; i < out.length; i += 4) {
    const dr = out[i] - bgR;
    const dg = out[i + 1] - bgG;
    const db = out[i + 2] - bgB;
    if (dr * dr + dg * dg + db * db <= toleranceSquared) {
      out[i + 3] = 0;
    }
  }
  return {data: out, width: image.width, height: image.height};
}

/**
 * Builds a grayscale displacement map from a keyed image: background pixels
 * (alpha 0) become black (no displacement) and subject pixels become their
 * luminance. Masking by alpha keeps the transparent background from displacing
 * into stray geometry. The result is opaque RGBA.
 * @param image - A keyed RGBA image (background already at alpha 0).
 * @returns A new opaque {@link RgbaImage} usable as a displacement/bump map.
 */
export function buildDisplacementMap(image: RgbaImage): RgbaImage {
  const {data, width, height} = image;
  const out = new Uint8ClampedArray(data.length);
  for (let i = 0; i < data.length; i += 4) {
    const luminance =
      data[i + 3] === 0
        ? 0
        : Math.round(
            0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2]
          );
    out[i] = luminance;
    out[i + 1] = luminance;
    out[i + 2] = luminance;
    out[i + 3] = 255;
  }
  return {data: out, width, height};
}
