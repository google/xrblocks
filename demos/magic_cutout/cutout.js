export const STYLES = ['sticker', 'glow', 'clean'];

const DEFAULT_BORDER_RADIUS_PX = 5;
const MIN_STICKER_METERS = 0.16;
const MAX_STICKER_METERS = 0.85;
const MIN_FOREGROUND_PIXELS = 16;
const MIN_COVERAGE_RATIO = 0.001;
const MAX_COVERAGE_RATIO = 0.92;

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function smoothstep(edge0, edge1, x) {
  const t = clamp((x - edge0) / (edge1 - edge0), 0, 1);
  return t * t * (3 - 2 * t);
}

function sampleNeighborhood(data, width, height, u, v, normalizeValue) {
  const cx = clamp(Math.round(u * (width - 1)), 0, width - 1);
  const cy = clamp(Math.round(v * (height - 1)), 0, height - 1);
  let sum = 0;
  let count = 0;
  for (let dy = -1; dy <= 1; dy++) {
    const y = cy + dy;
    if (y < 0 || y >= height) continue;
    for (let dx = -1; dx <= 1; dx++) {
      const x = cx + dx;
      if (x < 0 || x >= width) continue;
      sum += normalizeValue(data[y * width + x]);
      count++;
    }
  }
  return count > 0 ? sum / count : 0;
}

function sampleCorners(data, width, height, normalizeValue) {
  const corners = [
    [0, 0],
    [width - 1, 0],
    [0, height - 1],
    [width - 1, height - 1],
  ];
  let sum = 0;
  for (const [x, y] of corners) {
    sum += normalizeValue(data[y * width + x]);
  }
  return sum / corners.length;
}

function resampleBilinear(data, srcW, srcH, dstW, dstH, normalizeValue) {
  const out = new Float32Array(dstW * dstH);
  if (srcW === dstW && srcH === dstH) {
    for (let i = 0; i < out.length; i++) {
      out[i] = clamp(normalizeValue(data[i]), 0, 1);
    }
    return out;
  }

  for (let y = 0; y < dstH; y++) {
    const sy = dstH > 1 ? (y * (srcH - 1)) / (dstH - 1) : 0;
    const y0 = Math.floor(sy);
    const y1 = Math.min(y0 + 1, srcH - 1);
    const fy = sy - y0;

    for (let x = 0; x < dstW; x++) {
      const sx = dstW > 1 ? (x * (srcW - 1)) / (dstW - 1) : 0;
      const x0 = Math.floor(sx);
      const x1 = Math.min(x0 + 1, srcW - 1);
      const fx = sx - x0;

      const v00 = normalizeValue(data[y0 * srcW + x0]);
      const v10 = normalizeValue(data[y0 * srcW + x1]);
      const v01 = normalizeValue(data[y1 * srcW + x0]);
      const v11 = normalizeValue(data[y1 * srcW + x1]);

      const top = v00 + (v10 - v00) * fx;
      const bottom = v01 + (v11 - v01) * fx;
      out[y * dstW + x] = clamp(top + (bottom - top) * fy, 0, 1);
    }
  }
  return out;
}

function featherMask(mask, width, height) {
  const out = new Float32Array(width * height);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let sum = 0;
      let count = 0;
      for (let dy = -1; dy <= 1; dy++) {
        const ny = y + dy;
        if (ny < 0 || ny >= height) continue;
        for (let dx = -1; dx <= 1; dx++) {
          const nx = x + dx;
          if (nx < 0 || nx >= width) continue;
          sum += mask[ny * width + nx];
          count++;
        }
      }
      out[y * width + x] = count > 0 ? sum / count : 0;
    }
  }
  return out;
}

function pickConfidenceMask(maskInput, tapPoint) {
  const masks = maskInput?.confidenceMasks?.length
    ? maskInput.confidenceMasks
    : maskInput?.confidenceMask
      ? [maskInput.confidenceMask]
      : [];
  if (masks.length === 0) return null;
  if (masks.length === 1) return masks[0];

  let bestMask = masks[0];
  let bestScore = -Infinity;
  for (const mask of masks) {
    if (!mask?.data?.length || !mask.width || !mask.height) continue;
    const score = sampleNeighborhood(
      mask.data,
      mask.width,
      mask.height,
      tapPoint.u,
      tapPoint.v,
      (v) => v
    );
    if (score > bestScore) {
      bestScore = score;
      bestMask = mask;
    }
  }
  return bestMask;
}

function resolveCategoryMapper(categoryMask, tapPoint) {
  const {data, width, height} = categoryMask;
  let maxRaw = 0;
  for (let i = 0; i < data.length; i++) {
    if (data[i] > maxRaw) maxRaw = data[i];
  }
  const tapMean = sampleNeighborhood(
    data,
    width,
    height,
    tapPoint.u,
    tapPoint.v,
    (v) => v
  );
  const cornerMean = sampleCorners(data, width, height, (v) => v);
  if (tapMean < cornerMean - 0.25) {
    const threshold = (tapMean + cornerMean) * 0.5;
    return (v) => (v <= threshold ? 1 : 0);
  }
  if (tapMean > cornerMean + 0.25) {
    const threshold = (tapMean + cornerMean) * 0.5;
    return (v) => (v >= threshold ? 1 : 0);
  }
  // Match MediaPipe InteractiveSegmenter's convention (< 128 is foreground) when
  // corners and tap sample are indistinguishable, or > 0 for 0/1 binary masks.
  return maxRaw <= 1 ? (v) => (v > 0 ? 1 : 0) : (v) => (v < 128 ? 1 : 0);
}

/**
 * Normalizes a MediaPipe category/confidence mask output into a feathered
 * `[0, 1]` foreground alpha array aligned to `(imageWidth, imageHeight)`.
 */
export function extractForegroundMask(
  maskInput,
  imageWidth,
  imageHeight,
  tapPoint = {u: 0.5, v: 0.5}
) {
  if (!imageWidth || !imageHeight) {
    throw new Error('Target mask dimensions must be positive');
  }
  const normalizedTap = {
    u: clamp(tapPoint?.u ?? 0.5, 0, 1),
    v: clamp(tapPoint?.v ?? 0.5, 0, 1),
  };

  let rawMask = null;
  const conf = pickConfidenceMask(maskInput, normalizedTap);
  if (conf?.data?.length && conf.width > 0 && conf.height > 0) {
    let minVal = Infinity;
    let maxVal = -Infinity;
    for (let i = 0; i < conf.data.length; i++) {
      const value = conf.data[i];
      if (value < minVal) minVal = value;
      if (value > maxVal) maxVal = value;
    }
    if (maxVal - minVal >= 1e-4) {
      const tapMean = sampleNeighborhood(
        conf.data,
        conf.width,
        conf.height,
        normalizedTap.u,
        normalizedTap.v,
        (v) => v
      );
      const cornerMean = sampleCorners(
        conf.data,
        conf.width,
        conf.height,
        (v) => v
      );
      const inverted = cornerMean > tapMean + 0.15;
      rawMask = resampleBilinear(
        conf.data,
        conf.width,
        conf.height,
        imageWidth,
        imageHeight,
        (v) => (inverted ? 1 - v : v)
      );
    }
  }

  if (!rawMask) {
    const cat = maskInput?.categoryMask;
    if (!cat?.data?.length || !cat.width || !cat.height) {
      throw new Error(
        'Mask result contains neither confidence nor category data'
      );
    }
    const mapper = resolveCategoryMapper(cat, normalizedTap);
    rawMask = resampleBilinear(
      cat.data,
      cat.width,
      cat.height,
      imageWidth,
      imageHeight,
      mapper
    );
  }

  return featherMask(rawMask, imageWidth, imageHeight);
}

/**
 * Computes tight object bounds from a foreground alpha mask, rejecting empty
 * or full-frame degenerate masks.
 */
export function computeMaskBounds(
  alpha,
  width,
  height,
  threshold = 0.35,
  paddingPx = 8
) {
  let minX = width;
  let minY = height;
  let maxX = -1;
  let maxY = -1;
  let foregroundPixels = 0;
  let sumX = 0;
  let sumY = 0;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (alpha[y * width + x] < threshold) continue;
      foregroundPixels++;
      sumX += x;
      sumY += y;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
  }

  const totalPixels = Math.max(1, width * height);
  const coverageRatio = foregroundPixels / totalPixels;

  if (
    foregroundPixels < MIN_FOREGROUND_PIXELS ||
    coverageRatio < MIN_COVERAGE_RATIO
  ) {
    return {ok: false, reason: 'empty', foregroundPixels, coverageRatio};
  }
  if (coverageRatio > MAX_COVERAGE_RATIO) {
    return {ok: false, reason: 'full_frame', foregroundPixels, coverageRatio};
  }

  const x0 = Math.max(0, minX - paddingPx);
  const y0 = Math.max(0, minY - paddingPx);
  const x1 = Math.min(width - 1, maxX + paddingPx);
  const y1 = Math.min(height - 1, maxY + paddingPx);

  return {
    ok: true,
    bounds: {
      x0,
      y0,
      width: x1 - x0 + 1,
      height: y1 - y0 + 1,
      centerU: foregroundPixels > 0 ? sumX / foregroundPixels / width : 0.5,
      centerV: foregroundPixels > 0 ? sumY / foregroundPixels / height : 0.5,
      foregroundPixels,
      coverageRatio,
    },
  };
}

function readSourceAlpha(alpha, imageWidth, imageHeight, sx, sy) {
  if (sx < 0 || sx >= imageWidth || sy < 0 || sy >= imageHeight) return 0;
  return smoothstep(0.18, 0.72, alpha[sy * imageWidth + sx]);
}

function dilatedBorderAlpha(
  alpha,
  imageWidth,
  imageHeight,
  sx,
  sy,
  radius,
  softFalloff
) {
  let maxVal = 0;
  const r2 = radius * radius;
  for (let dy = -radius; dy <= radius; dy++) {
    for (let dx = -radius; dx <= radius; dx++) {
      const dist2 = dx * dx + dy * dy;
      if (dist2 > r2) continue;
      const sample = readSourceAlpha(
        alpha,
        imageWidth,
        imageHeight,
        sx + dx,
        sy + dy
      );
      if (sample <= 0) continue;
      const weight = softFalloff
        ? sample * (1 - Math.sqrt(dist2) / (radius + 1)) * 0.9
        : sample;
      if (weight > maxVal) maxVal = weight;
    }
  }
  return maxVal;
}

/**
 * Crops the segmented foreground object and renders the requested border style
 * (`'sticker'`, `'glow'`, or `'clean'`) into a straight-alpha RGBA buffer.
 */
export function renderCutout(
  image,
  alpha,
  bounds,
  {style = 'sticker', borderRadiusPx = DEFAULT_BORDER_RADIUS_PX} = {}
) {
  if (!STYLES.includes(style)) {
    throw new Error(`Unsupported cutout style: ${style}`);
  }
  const pad = style === 'clean' ? 0 : borderRadiusPx;
  const outWidth = bounds.width + pad * 2;
  const outHeight = bounds.height + pad * 2;
  const data = new Uint8ClampedArray(outWidth * outHeight * 4);

  const borderRgb = style === 'sticker' ? [248, 250, 252] : [103, 232, 249];
  const softFalloff = style === 'glow';

  for (let oy = 0; oy < outHeight; oy++) {
    const sy = bounds.y0 + oy - pad;
    for (let ox = 0; ox < outWidth; ox++) {
      const sx = bounds.x0 + ox - pad;
      const fgA = readSourceAlpha(alpha, image.width, image.height, sx, sy);
      const borderA =
        style === 'clean'
          ? 0
          : dilatedBorderAlpha(
              alpha,
              image.width,
              image.height,
              sx,
              sy,
              borderRadiusPx,
              softFalloff
            );

      const outA = Math.max(fgA, borderA);
      const dst = (oy * outWidth + ox) * 4;
      if (outA <= 1e-3) {
        data[dst] = 0;
        data[dst + 1] = 0;
        data[dst + 2] = 0;
        data[dst + 3] = 0;
        continue;
      }

      let srcR = borderRgb[0];
      let srcG = borderRgb[1];
      let srcB = borderRgb[2];
      if (sx >= 0 && sx < image.width && sy >= 0 && sy < image.height) {
        const src = (sy * image.width + sx) * 4;
        srcR = image.data[src];
        srcG = image.data[src + 1];
        srcB = image.data[src + 2];
      }

      const premulR = fgA * srcR + (1 - fgA) * borderA * borderRgb[0];
      const premulG = fgA * srcG + (1 - fgA) * borderA * borderRgb[1];
      const premulB = fgA * srcB + (1 - fgA) * borderA * borderRgb[2];

      data[dst] = Math.round(premulR / outA);
      data[dst + 1] = Math.round(premulG / outA);
      data[dst + 2] = Math.round(premulB / outA);
      data[dst + 3] = Math.round(clamp(outA, 0, 1) * 255);
    }
  }

  return {data, width: outWidth, height: outHeight};
}

/**
 * Renders a dimmed-background viewfinder preview with a cyan contour and tap
 * marker around the segmented object.
 */
export function renderPreviewOverlay(
  image,
  alpha,
  tapPoint = {u: 0.5, v: 0.5},
  threshold = 0.35
) {
  const {width, height, data: src} = image;
  const out = new Uint8ClampedArray(width * height * 4);
  const tapX = clamp(
    Math.round((tapPoint?.u ?? 0.5) * (width - 1)),
    0,
    width - 1
  );
  const tapY = clamp(
    Math.round((tapPoint?.v ?? 0.5) * (height - 1)),
    0,
    height - 1
  );

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = y * width + x;
      const p = idx * 4;
      const fg = alpha[idx] >= threshold;
      const isEdge =
        fg &&
        ((x > 0 && alpha[idx - 1] < threshold) ||
          (x < width - 1 && alpha[idx + 1] < threshold) ||
          (y > 0 && alpha[idx - width] < threshold) ||
          (y < height - 1 && alpha[idx + width] < threshold));

      if (isEdge) {
        out[p] = 103;
        out[p + 1] = 232;
        out[p + 2] = 249;
      } else {
        const shade = fg ? 1.0 : 0.42;
        out[p] = Math.round(src[p] * shade);
        out[p + 1] = Math.round(src[p + 1] * shade);
        out[p + 2] = Math.round(src[p + 2] * shade);
      }
      out[p + 3] = 255;

      const dist2 = (x - tapX) * (x - tapX) + (y - tapY) * (y - tapY);
      if (dist2 <= 25) {
        if (dist2 <= 6) {
          out[p] = 255;
          out[p + 1] = 255;
          out[p + 2] = 255;
        } else {
          out[p] = 103;
          out[p + 1] = 232;
          out[p + 2] = 249;
        }
      }
    }
  }

  return {data: out, width, height};
}

/**
 * Computes physical world dimensions in meters for a 3D cutout sticker at
 * `depthInMeters`, preserving aspect ratio and clamping the longest side to
 * `[0.16, 0.85]` m.
 */
export function computeStickerDimensions(
  cutoutWidth,
  cutoutHeight,
  imageWidth,
  imageHeight,
  depthInMeters,
  clipFromViewElements
) {
  const safeDepth = clamp(
    Number.isFinite(depthInMeters) ? depthInMeters : 1.1,
    0.35,
    8.0
  );
  const rawFocalY = clipFromViewElements?.[5];
  const focalScaleY =
    Number.isFinite(rawFocalY) && Math.abs(rawFocalY) > 0.01
      ? Math.abs(rawFocalY)
      : 1.732;
  const viewHeightAtDepth = (2 * safeDepth) / focalScaleY;
  const aspect = Math.max(1, cutoutWidth) / Math.max(1, cutoutHeight);
  const rawHeight =
    viewHeightAtDepth * (Math.max(1, cutoutHeight) / Math.max(1, imageHeight));
  const rawWidth = rawHeight * aspect;
  const longest = Math.max(rawWidth, rawHeight, 1e-4);
  const clampedLongest = clamp(longest, MIN_STICKER_METERS, MAX_STICKER_METERS);
  const factor = clampedLongest / longest;

  return {
    widthMeters: rawWidth * factor,
    heightMeters: rawHeight * factor,
  };
}
