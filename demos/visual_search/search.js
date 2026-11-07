/**
 * Pure helpers for open-vocabulary visual search: where to crop the camera
 * frame, how to phrase the text query, and how to turn per-crop CLIP
 * similarities into a location and a confidence.
 */

/** Longest query the card accepts; CLIP's context is 77 tokens anyway. */
export const MAX_QUERY_LENGTH = 60;

/** Crop side as a fraction of the shorter frame side. */
export const CROP_FRACTION = 0.4;
/** Neighboring crops share half their side, so objects between centers are covered. */
export const CROP_OVERLAP = 0.5;

/**
 * Captions averaged into one text embedding per query, the prompt ensembling
 * trick from the CLIP paper. `{}` is replaced by the query.
 */
export const TEMPLATES = Object.freeze([
  'a photo of {}.',
  'a photo of the {}.',
  '{} in a room.',
  'a close-up photo of {}.',
  'a cropped photo of {}.',
]);

/**
 * Generic captions that every crop is also compared with. A crop only counts
 * as the query's location when the query beats these, which stops crops that
 * score high for any text, such as plain walls, from winning.
 */
export const BACKGROUND_LABELS = Object.freeze([
  'a wall',
  'a floor',
  'a ceiling',
  'a room',
  'a window',
  'furniture',
  'an object',
  'a blurry photo',
]);

/**
 * Best-crop cosine similarity at or above this is a confident match, and at
 * or above POSSIBLE_SCORE a tentative one. Calibrated with the default crops
 * and templates on 81 query and image pairs (9 photos plus the simulator's
 * living room): all 19 present objects scored at least 0.259 (16 strong, 3
 * possible), while 2 of 62 absent ones passed as strong and 3 as possible.
 */
export const STRONG_SCORE = 0.265;
export const POSSIBLE_SCORE = 0.255;
/** Crops with at least this share of the best probability help place the match. */
export const NEAR_RATIO = 0.7;
/** ...if they also share at least this fraction of the best crop's area. */
export const NEIGHBOR_AREA = 0.5;
/** CLIP's learned logit scale (exp of the trained temperature, capped at 100). */
export const LOGIT_SCALE = 100;

/**
 * Covers a frame with overlapping square crops of one size.
 *
 * Squares match CLIP's square input, so no crop is stretched. Positions are
 * spread evenly from edge to edge, so the first and last crop in each row and
 * column touch the frame border.
 *
 * @param {number} width Frame width in pixels.
 * @param {number} height Frame height in pixels.
 * @param {{fraction?: number, overlap?: number}} [options] Crop side as a
 *   fraction of the shorter frame side, and the minimum overlap between
 *   neighbors as a fraction of the crop side.
 * @returns {{x: number, y: number, side: number}[]} Integer pixel rectangles.
 */
export function squareGrid(
  width,
  height,
  {fraction = CROP_FRACTION, overlap = CROP_OVERLAP} = {}
) {
  if (!(width >= 1 && height >= 1)) throw new Error('Invalid frame size.');
  if (!(fraction > 0 && fraction <= 1)) throw new Error('Invalid fraction.');
  if (!(overlap >= 0 && overlap < 1)) throw new Error('Invalid overlap.');
  const side = Math.max(1, Math.floor(Math.min(width, height) * fraction));
  const stride = side * (1 - overlap);
  const positions = (length) => {
    const span = length - side;
    const count = span <= 0 ? 1 : Math.ceil(span / stride) + 1;
    return Array.from({length: count}, (_, i) =>
      count === 1 ? Math.floor(span / 2) : Math.round((span * i) / (count - 1))
    );
  };
  const tiles = [];
  for (const y of positions(height)) {
    for (const x of positions(width)) tiles.push({x, y, side});
  }
  return tiles;
}

/** Trims, collapses whitespace and caps the length of a query. */
export function cleanQuery(query) {
  return String(query ?? '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, MAX_QUERY_LENGTH)
    .trim();
}

const DETERMINER =
  /^(a|an|the|my|your|our|his|her|their|this|that|these|those|some|any|one|two|three|four|five|\d+)\b/i;

/**
 * Adds "a" or "an" to a bare singular noun, so "cup" reads "a cup". Queries
 * that already start with a determiner, and simple plurals such as "keys",
 * are left alone.
 */
export function withArticle(query) {
  const text = cleanQuery(query);
  if (!text) return text;
  if (DETERMINER.test(text)) return text;
  const last = text.split(' ').pop().toLowerCase();
  if (/[^s]s$/.test(last)) return text;
  return `${/^[aeiou]/i.test(text) ? 'an' : 'a'} ${text}`;
}

/**
 * The captions for one query, one per template.
 * @param {string} query What the user is looking for, such as "keys".
 * @returns {string[]} For example ["a photo of keys.", ...].
 */
export function promptsFor(query) {
  const subject = withArticle(query);
  if (!subject) throw new Error('Type what to look for.');
  return TEMPLATES.map((template) => template.replace('{}', subject));
}

/**
 * @param {ArrayLike<number>} vector
 * @returns {Float32Array} A unit-length copy.
 */
export function normalize(vector) {
  let sum = 0;
  for (let i = 0; i < vector.length; i++) sum += vector[i] * vector[i];
  const norm = Math.sqrt(sum);
  if (!(norm > 0)) throw new Error('Cannot normalize a zero vector.');
  const out = new Float32Array(vector.length);
  for (let i = 0; i < vector.length; i++) out[i] = vector[i] / norm;
  return out;
}

/**
 * Averages unit embeddings into one unit embedding.
 * @param {ArrayLike<number>[]} vectors
 */
export function meanEmbedding(vectors) {
  if (!vectors.length) throw new Error('No embeddings to average.');
  const sum = new Float32Array(vectors[0].length);
  for (const vector of vectors) {
    if (vector.length !== sum.length) {
      throw new Error('Embedding sizes do not match.');
    }
    const unit = normalize(vector);
    for (let i = 0; i < sum.length; i++) sum[i] += unit[i];
  }
  return normalize(sum);
}

/**
 * Cosine similarity of one text embedding against each image embedding.
 * @param {ArrayLike<number>} text
 * @param {ArrayLike<number>[]} images
 * @returns {number[]}
 */
export function similarities(text, images) {
  const t = normalize(text);
  return images.map((image) => {
    if (image.length !== t.length) {
      throw new Error('Embedding sizes do not match.');
    }
    const v = normalize(image);
    let dot = 0;
    for (let i = 0; i < t.length; i++) dot += t[i] * v[i];
    return dot;
  });
}

/**
 * Per crop, the softmax probability of the query against the background
 * captions, at CLIP's logit scale.
 * @param {number[]} scores Query similarity per crop.
 * @param {number[][]} backgrounds Similarity per background caption, per crop.
 * @returns {number[]}
 */
export function contrast(scores, backgrounds) {
  return scores.map((score, i) => {
    let denominator = 1;
    for (const background of backgrounds) {
      denominator += Math.exp(LOGIT_SCALE * (background[i] - score));
    }
    return 1 / denominator;
  });
}

/**
 * Turns per-crop scores into a match.
 *
 * Confidence comes from the best raw similarity anywhere in the frame. The
 * location comes from the crop where the query most clearly beats the
 * background captions, refined by its direct neighbors that score nearly as
 * well: their probability-weighted center, and the region where they all
 * overlap, which is tighter than any one crop.
 *
 * @param {number[]} scores Query cosine similarity per tile.
 * @param {number[]} probabilities Query-versus-background probability per tile.
 * @param {{x: number, y: number, side: number}[]} tiles
 * @param {number} width Frame width in pixels.
 * @param {number} height Frame height in pixels.
 * @returns {{
 *   confidence: 'strong' | 'possible' | 'none',
 *   score: number,
 *   probability: number,
 *   bestIndex: number,
 *   center: {u: number, v: number},
 *   box: {u0: number, v0: number, u1: number, v1: number},
 * }} Coordinates are normalized to [0, 1] with v pointing down.
 */
export function locate(scores, probabilities, tiles, width, height) {
  if (
    !scores.length ||
    scores.length !== tiles.length ||
    probabilities.length !== tiles.length
  ) {
    throw new Error('Each tile needs exactly one score and probability.');
  }
  const score = Math.max(...scores);
  let bestIndex = 0;
  for (let i = 1; i < probabilities.length; i++) {
    if (probabilities[i] > probabilities[bestIndex]) bestIndex = i;
  }
  const probability = probabilities[bestIndex];
  const confidence =
    score >= STRONG_SCORE
      ? 'strong'
      : score >= POSSIBLE_SCORE
        ? 'possible'
        : 'none';

  // Only direct neighbors of the best crop refine it. Strong crops elsewhere
  // are a second instance of the object, and mixing them in would put the
  // marker between the two.
  const best = tiles[bestIndex];
  let weightSum = 0;
  let cx = 0;
  let cy = 0;
  let x0 = best.x;
  let y0 = best.y;
  let x1 = best.x + best.side;
  let y1 = best.y + best.side;
  for (let i = 0; i < tiles.length; i++) {
    const tile = tiles[i];
    const isNear =
      i === bestIndex ||
      (probabilities[i] >= probability * NEAR_RATIO &&
        overlapArea(tile, best) >= NEIGHBOR_AREA * best.side * best.side);
    if (!isNear) continue;
    // A floor keeps the weights meaningful when every probability is ~0.
    const weight = Math.max(probabilities[i], Number.EPSILON);
    weightSum += weight;
    cx += weight * (tile.x + tile.side / 2);
    cy += weight * (tile.y + tile.side / 2);
    x0 = Math.max(x0, tile.x);
    y0 = Math.max(y0, tile.y);
    x1 = Math.min(x1, tile.x + tile.side);
    y1 = Math.min(y1, tile.y + tile.side);
  }
  // Neighbors on opposite sides meet only at a line: the object spans the
  // best crop, so outline that crop.
  if (x1 - x0 < best.side / 4 || y1 - y0 < best.side / 4) {
    [x0, y0, x1, y1] = [best.x, best.y, best.x + best.side, best.y + best.side];
  }
  const clamp = (value) => Math.min(1, Math.max(0, value));
  return {
    confidence,
    score,
    probability,
    bestIndex,
    center: {
      u: clamp(cx / weightSum / width),
      v: clamp(cy / weightSum / height),
    },
    box: {
      u0: clamp(x0 / width),
      v0: clamp(y0 / height),
      u1: clamp(x1 / width),
      v1: clamp(y1 / height),
    },
  };
}

/** Pixel area shared by two square tiles. */
export function overlapArea(a, b) {
  const w = Math.min(a.x + a.side, b.x + b.side) - Math.max(a.x, b.x);
  const h = Math.min(a.y + a.side, b.y + b.side) - Math.max(a.y, b.y);
  return w > 0 && h > 0 ? w * h : 0;
}

/** Short, human wording for a match. */
export function describe(query, match) {
  const text = cleanQuery(query);
  switch (match.confidence) {
    case 'strong':
      return `Found ${text}.`;
    case 'possible':
      return `Maybe ${text}: best guess marked.`;
    default:
      return `No clear ${text} in view. Try another angle or move closer.`;
  }
}
