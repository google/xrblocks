/**
 * FaceFit.js — GNM parameters from MediaPipe face landmarks.
 *
 * Two solves share one piece of machinery. `fitIdentity` answers "who is this
 * face" from a single frame; `FaceRetargeter` answers "what is it doing" every
 * frame after that. Both align a tracked point cloud onto the model with a
 * closed-form similarity fit and project whatever is left over onto a PCA
 * basis, ridge-regularized.
 *
 * Ported from https://github.com/edualvarado/gnm-webcam-puppet (Apache-2.0),
 * whose comments record the measurements behind the constants. Three of those
 * findings carry the whole thing:
 *
 * - **The fit is differential.** Landmarks are compared against where the
 *   landmarker puts them on a neutral head (`FACE_CORRESPONDENCE.reference`),
 *   not against the GNM vertices they map to. The two differ by ~11 mm rms in
 *   z, because the landmarker carries its own idea of face shape. Against the
 *   template that constant bias is indistinguishable from a very deep face and
 *   lands in the coefficients; against the reference it cancels exactly.
 * - **Only leading components are solved for.** The normal matrix' eigenvalues
 *   span five orders of magnitude, so no single ridge both frees the head of
 *   the basis and restrains its tail. The basis is ordered by variance
 *   explained, so truncating is the honest cut.
 * - **Depth is damped, not trusted.** MediaPipe's z is not metric and is by far
 *   the noisiest axis, but it still carries real brow and nose projection.
 *
 * Adapted here for this demo's int8-quantized bases: every basis read folds in
 * the component's float32 scale, so solved coefficients come out in the same
 * units `GNMHeadModel.setIdentityVector` expects.
 *
 * Dependency-free (typed arrays only), so it runs under `node --test` as well
 * as in the browser.
 */

import {FACE_CORRESPONDENCE, REQUIRED_LANDMARKS} from './FaceCorrespondence.js';

/**
 * Tuned by the upstream project on synthetic faces with 2 px of landmark jitter
 * and depth error at 2% of face width, scored as whole-mesh rms against the
 * face that generated the frame: the template scores 5.7 mm there, these score
 * about 1.8 mm.
 */
const IDENTITY_DEFAULTS = {
  iterations: 4,
  // 24 leading components. Fewer cannot express the face; more chase noise,
  // and 64 doubles the error at the same ridge.
  components: 24,
  ridge: 0.06,
  // Low, but not zero: dropping depth entirely costs accuracy when z is good,
  // and trusting it costs far more when z is bad.
  depthWeight: 0.1,
  limit: 3,
  rigidOnly: true,
};

const RETARGET_DEFAULTS = {
  // Looser than the identity fit's: expression is what we *want* to move, and
  // it is re-solved every frame rather than committed to once.
  ridge: 0.02,
  depthWeight: 0.1,
  limit: 3,
  smoothing: 0.45,
  gain: 1,
  // The mouth's most important knob, and a *conditioning* limit rather than an
  // expressiveness one. Solving all 150 lower-face components against sparse
  // noisy landmarks spends them fitting noise, in combinations large enough to
  // hit the clamp and wrong enough to invert the gross shape — upstream
  // measured the mouth *closing* as the subject opened theirs. Four components
  // tracked the real aperture with nothing clamped.
  regionBudget: {lower_face_region: 4},
  // Corrects a measured, near-constant shortfall rather than exaggerating:
  // handed MediaPipe's landmarks the mouth solve returns 72–77% of the true
  // aperture over a 3x range of opening. Not licence to tune other regions by
  // eye — they have no equivalent measurement.
  regionGain: {lower_face_region: 1.35},
};

/**
 * Splits ordered PCA names like `lower_face_region_000` into contiguous
 * regions, matching the grouping the parameter sliders use.
 *
 * @param {!Array<string>} names Ordered component names.
 * @return {!Object<string, {start: number, count: number}>} Regions by name.
 */
export function expressionRegions(names) {
  const regions = {};
  let key = null;
  names.forEach((name, index) => {
    const next = name.replace(/_?\d+$/, '').replace(/_mean$/, '');
    if (next !== key) {
      key = next;
      regions[key] = {start: index, count: 0};
    }
    regions[key].count++;
  });
  return regions;
}

/**
 * Converts MediaPipe normalized landmarks into GNM's axis convention.
 *
 * MediaPipe normalizes x by image width and y by image height, so raw values
 * are anisotropic unless the frame is square; its y grows downward and its z
 * away from the camera, both opposite to GNM. The result is defined only up to
 * a global scale — which the similarity fit solves for — so all that matters is
 * that the three axes end up sharing one scale.
 *
 * @param {!Array<{x: number, y: number, z: number}>} landmarks Source frame.
 * @param {!ArrayLike<number>} indices Which of them to take, in order.
 * @param {number} aspect Frame width divided by height.
 * @param {!Float64Array} out Destination, length `indices.length * 3`.
 * @return {!Float64Array} `out`.
 */
export function landmarksToModelAxes(landmarks, indices, aspect, out) {
  for (let i = 0; i < indices.length; ++i) {
    const landmark = landmarks[indices[i]];
    out[i * 3] = landmark.x * aspect;
    out[i * 3 + 1] = -landmark.y;
    // z shares x's normalization, so it takes the same aspect scaling.
    out[i * 3 + 2] = -landmark.z * aspect;
  }
  return out;
}

/**
 * Eigen-decomposition of a small symmetric matrix, by cyclic Jacobi rotations.
 * Only ever called on the 4x4 of `fitSimilarity`.
 *
 * @param {!Float64Array} matrix Row-major symmetric matrix, overwritten.
 * @param {number} n Side length.
 * @return {{values: !Float64Array, vectors: !Float64Array}} Eigenvalues, and
 *     row-major eigenvectors in columns.
 */
function jacobiEigen(matrix, n) {
  const vectors = new Float64Array(n * n);
  for (let i = 0; i < n; ++i) vectors[i * n + i] = 1;

  for (let sweep = 0; sweep < 32; ++sweep) {
    let off = 0;
    for (let p = 0; p < n; ++p) {
      for (let q = p + 1; q < n; ++q) {
        off += matrix[p * n + q] * matrix[p * n + q];
      }
    }
    if (off < 1e-24) break;

    for (let p = 0; p < n; ++p) {
      for (let q = p + 1; q < n; ++q) {
        const apq = matrix[p * n + q];
        if (Math.abs(apq) < 1e-18) continue;

        const theta = (matrix[q * n + q] - matrix[p * n + p]) / (2 * apq);
        const t =
          Math.sign(theta || 1) /
          (Math.abs(theta) + Math.sqrt(theta * theta + 1));
        const c = 1 / Math.sqrt(t * t + 1);
        const s = t * c;

        for (let k = 0; k < n; ++k) {
          const akp = matrix[k * n + p];
          const akq = matrix[k * n + q];
          matrix[k * n + p] = c * akp - s * akq;
          matrix[k * n + q] = s * akp + c * akq;
        }
        for (let k = 0; k < n; ++k) {
          const apk = matrix[p * n + k];
          const aqk = matrix[q * n + k];
          matrix[p * n + k] = c * apk - s * aqk;
          matrix[q * n + k] = s * apk + c * aqk;
        }
        for (let k = 0; k < n; ++k) {
          const vkp = vectors[k * n + p];
          const vkq = vectors[k * n + q];
          vectors[k * n + p] = c * vkp - s * vkq;
          vectors[k * n + q] = s * vkp + c * vkq;
        }
      }
    }
  }

  const values = new Float64Array(n);
  for (let i = 0; i < n; ++i) values[i] = matrix[i * n + i];
  return {values, vectors};
}

/**
 * Fits the similarity transform taking source onto target, minimizing
 * `|scale * rotation @ source + translation - target|^2` in closed form by
 * Horn's quaternion method. Going through a quaternion rather than an SVD means
 * no reflection case to guard — a unit quaternion is a rotation by
 * construction.
 *
 * @param {!Float64Array} source Points, interleaved xyz.
 * @param {!Float64Array} target Points, interleaved xyz, same length.
 * @return {{scale: number, rotation: !Float64Array, translation:
 *     !Float64Array}} The transform; rotation is row-major 3x3.
 */
export function fitSimilarity(source, target) {
  if (source.length !== target.length) {
    throw new Error(
      `source and target must be the same length, got ${source.length} and ` +
        `${target.length}.`
    );
  }
  const count = source.length / 3;
  if (count < 3)
    throw new Error(`Need at least 3 points to fit, got ${count}.`);

  let sx = 0;
  let sy = 0;
  let sz = 0;
  let tx = 0;
  let ty = 0;
  let tz = 0;
  for (let i = 0; i < count; ++i) {
    sx += source[i * 3];
    sy += source[i * 3 + 1];
    sz += source[i * 3 + 2];
    tx += target[i * 3];
    ty += target[i * 3 + 1];
    tz += target[i * 3 + 2];
  }
  sx /= count;
  sy /= count;
  sz /= count;
  tx /= count;
  ty /= count;
  tz /= count;

  // Cross-covariance of the centred clouds, m[a * 3 + b] = sum(a_source * b_target).
  const m = new Float64Array(9);
  let sourceVariance = 0;
  for (let i = 0; i < count; ++i) {
    const ax = source[i * 3] - sx;
    const ay = source[i * 3 + 1] - sy;
    const az = source[i * 3 + 2] - sz;
    const bx = target[i * 3] - tx;
    const by = target[i * 3 + 1] - ty;
    const bz = target[i * 3 + 2] - tz;
    m[0] += ax * bx;
    m[1] += ax * by;
    m[2] += ax * bz;
    m[3] += ay * bx;
    m[4] += ay * by;
    m[5] += ay * bz;
    m[6] += az * bx;
    m[7] += az * by;
    m[8] += az * bz;
    sourceVariance += ax * ax + ay * ay + az * az;
  }

  const [xx, xy, xz, yx, yy, yz, zx, zy, zz] = m;
  const n = Float64Array.from([
    xx + yy + zz,
    yz - zy,
    zx - xz,
    xy - yx,
    yz - zy,
    xx - yy - zz,
    xy + yx,
    zx + xz,
    zx - xz,
    xy + yx,
    -xx + yy - zz,
    yz + zy,
    xy - yx,
    zx + xz,
    yz + zy,
    -xx - yy + zz,
  ]);

  const {values, vectors} = jacobiEigen(n, 4);
  let best = 0;
  for (let i = 1; i < 4; ++i) if (values[i] > values[best]) best = i;
  const qw = vectors[best];
  const qx = vectors[4 + best];
  const qy = vectors[8 + best];
  const qz = vectors[12 + best];

  const rotation = Float64Array.from([
    1 - 2 * (qy * qy + qz * qz),
    2 * (qx * qy - qw * qz),
    2 * (qx * qz + qw * qy),
    2 * (qx * qy + qw * qz),
    1 - 2 * (qx * qx + qz * qz),
    2 * (qy * qz - qw * qx),
    2 * (qx * qz - qw * qy),
    2 * (qy * qz + qw * qx),
    1 - 2 * (qx * qx + qy * qy),
  ]);

  // With the rotation known, scale is the ratio of aligned covariance to source
  // spread.
  let aligned = 0;
  for (let i = 0; i < count; ++i) {
    const ax = source[i * 3] - sx;
    const ay = source[i * 3 + 1] - sy;
    const az = source[i * 3 + 2] - sz;
    aligned +=
      (target[i * 3] - tx) *
        (rotation[0] * ax + rotation[1] * ay + rotation[2] * az) +
      (target[i * 3 + 1] - ty) *
        (rotation[3] * ax + rotation[4] * ay + rotation[5] * az) +
      (target[i * 3 + 2] - tz) *
        (rotation[6] * ax + rotation[7] * ay + rotation[8] * az);
  }
  const scale = aligned / Math.max(sourceVariance, 1e-12);

  const translation = Float64Array.from([
    tx - scale * (rotation[0] * sx + rotation[1] * sy + rotation[2] * sz),
    ty - scale * (rotation[3] * sx + rotation[4] * sy + rotation[5] * sz),
    tz - scale * (rotation[6] * sx + rotation[7] * sy + rotation[8] * sz),
  ]);

  return {scale, rotation, translation};
}

/**
 * Applies a similarity transform to interleaved xyz points.
 *
 * @param {!Float64Array} points Source points.
 * @param {{scale: number, rotation: !Float64Array, translation:
 *     !Float64Array}} transform The transform to apply.
 * @param {!Float64Array} out Destination, same length as `points`.
 * @return {!Float64Array} `out`.
 */
export function applySimilarity(points, transform, out) {
  const {scale, rotation: r, translation: t} = transform;
  for (let i = 0; i < points.length; i += 3) {
    const x = points[i];
    const y = points[i + 1];
    const z = points[i + 2];
    out[i] = scale * (r[0] * x + r[1] * y + r[2] * z) + t[0];
    out[i + 1] = scale * (r[3] * x + r[4] * y + r[5] * z) + t[1];
    out[i + 2] = scale * (r[6] * x + r[7] * y + r[8] * z) + t[2];
  }
  return out;
}

/**
 * Solves `matrix @ x = rhs` for a symmetric positive-definite matrix.
 *
 * @param {!Float64Array} matrix Row-major, n x n.
 * @param {!Float64Array} rhs Right-hand side, length n.
 * @param {number} n Side length.
 * @return {!Float64Array} The solution.
 */
export function choleskySolve(matrix, rhs, n) {
  const l = new Float64Array(n * n);
  for (let i = 0; i < n; ++i) {
    for (let j = 0; j <= i; ++j) {
      let sum = matrix[i * n + j];
      for (let k = 0; k < j; ++k) sum -= l[i * n + k] * l[j * n + k];
      if (i === j) {
        if (sum <= 0)
          throw new Error('Normal matrix is not positive definite.');
        l[i * n + j] = Math.sqrt(sum);
      } else {
        l[i * n + j] = sum / l[j * n + j];
      }
    }
  }

  const y = new Float64Array(n);
  for (let i = 0; i < n; ++i) {
    let sum = rhs[i];
    for (let k = 0; k < i; ++k) sum -= l[i * n + k] * y[k];
    y[i] = sum / l[i * n + i];
  }

  const x = new Float64Array(n);
  for (let i = n - 1; i >= 0; --i) {
    let sum = y[i];
    for (let k = i + 1; k < n; ++k) sum -= l[k * n + i] * x[k];
    x[i] = sum / l[i * n + i];
  }
  return x;
}

/** Row-major 3x3 rotation to axis-angle. */
function matrixToAxisAngle(r, out) {
  // The trace gives the angle; the antisymmetric part gives the axis. Both
  // degenerate near 0 and pi, and a head pose never reaches pi, so only the
  // small-angle case needs handling.
  const trace = r[0] + r[4] + r[8];
  const angle = Math.acos(Math.min(1, Math.max(-1, (trace - 1) / 2)));
  const sin = Math.sin(angle);
  if (Math.abs(sin) < 1e-6) {
    out[0] = 0;
    out[1] = 0;
    out[2] = 0;
    return out;
  }
  const scale = angle / (2 * sin);
  out[0] = (r[7] - r[5]) * scale;
  out[1] = (r[2] - r[6]) * scale;
  out[2] = (r[3] - r[1]) * scale;
  return out;
}

/**
 * Throws unless the frame is long enough for the correspondence to index it.
 *
 * @param {!Array<{x: number, y: number, z: number}>} landmarks One frame.
 */
function checkFrame(landmarks) {
  if (landmarks.length < REQUIRED_LANDMARKS) {
    throw new Error(
      `The correspondence indexes landmark ${REQUIRED_LANDMARKS - 1}, but the ` +
        `frame has ${landmarks.length}.`
    );
  }
}

/**
 * Fits identity coefficients to one frame of tracked landmarks.
 *
 * Fitting shape needs the head's pose in model space, and estimating that pose
 * needs the shape, so the two alternate: a closed-form similarity fit for the
 * pose, a ridge-regularized linear solve for the shape, repeat. Both halves are
 * exact given the other, and four rounds is well past where either stops
 * moving.
 *
 * Expression is deliberately not attempted — a single frame cannot separate
 * "this face has a wide mouth" from "this face is smiling" — so the solve runs
 * only on the skull-fixed landmarks.
 *
 * @param {!GNMHeadModel} model The loaded head model.
 * @param {!Array<{x: number, y: number, z: number}>} landmarks One frame,
 *     normalized.
 * @param {number} aspect Frame width divided by height.
 * @param {!Object=} options Solver knobs; the defaults are what the UI uses.
 * @return {{identity: !Float32Array, transform: !Object, points: number,
 *     components: number, rmsBefore: number, rmsAfter: number, peak: number}}
 *     The fit, with residuals in mm.
 */
export function fitIdentity(model, landmarks, aspect, options = {}) {
  const correspondence = FACE_CORRESPONDENCE;
  const {iterations, ridge, depthWeight, limit, rigidOnly, components} = {
    ...IDENTITY_DEFAULTS,
    ...options,
  };
  checkFrame(landmarks);

  // Only the skull-fixed landmarks, so an expression on the face at capture
  // time cannot be absorbed into identity.
  const active = [];
  for (let i = 0; i < correspondence.count; ++i) {
    if (!rigidOnly || correspondence.rigid[i]) active.push(i);
  }
  const count = active.length;
  const dim = Math.max(1, Math.min(components, model.identityDim));
  const rows = count * 3;
  const stride = model.numVertices * 3;

  // Where the landmarker puts these points on a neutral face, and the identity
  // basis restricted to the vertices they map to. Both are constant across
  // iterations, so the normal matrix built from them is too — only the
  // right-hand side moves.
  const basePoints = new Float64Array(rows);
  const design = new Float64Array(rows * dim);
  for (let i = 0; i < count; ++i) {
    const vertex = correspondence.vertices[active[i]];
    for (let axis = 0; axis < 3; ++axis) {
      const row = i * 3 + axis;
      basePoints[row] = correspondence.reference[active[i] * 3 + axis];
      for (let k = 0; k < dim; ++k) {
        // int8 basis; the component's scale folds in here, once.
        design[row * dim + k] =
          model.identityBasis[k * stride + vertex * 3 + axis] *
          model.identityScales[k];
      }
    }
  }

  const weights = new Float64Array(rows);
  for (let i = 0; i < count; ++i) {
    weights[i * 3] = 1;
    weights[i * 3 + 1] = 1;
    weights[i * 3 + 2] = depthWeight;
  }

  const normal = new Float64Array(dim * dim);
  for (let row = 0; row < rows; ++row) {
    const w = weights[row];
    if (w === 0) continue;
    const base = row * dim;
    for (let a = 0; a < dim; ++a) {
      const wa = w * design[base + a];
      if (wa === 0) continue;
      for (let b = a; b < dim; ++b)
        normal[a * dim + b] += wa * design[base + b];
    }
  }
  for (let a = 0; a < dim; ++a) {
    for (let b = 0; b < a; ++b) normal[a * dim + b] = normal[b * dim + a];
  }
  let trace = 0;
  for (let a = 0; a < dim; ++a) trace += normal[a * dim + a];
  const lambda = (ridge * trace) / dim;
  for (let a = 0; a < dim; ++a) normal[a * dim + a] += lambda;

  const observed = new Float64Array(rows);
  const indices = new Uint16Array(count);
  for (let i = 0; i < count; ++i) {
    indices[i] = correspondence.landmarks[active[i]];
  }
  landmarksToModelAxes(landmarks, indices, aspect, observed);

  const identity = new Float64Array(dim);
  const current = new Float64Array(rows);
  const aligned = new Float64Array(rows);
  const rhs = new Float64Array(dim);

  const residualRms = (a, b) => {
    let sum = 0;
    for (let i = 0; i < a.length; ++i) {
      const d = (a[i] - b[i]) * 1000;
      sum += d * d;
    }
    // Per point, not per scalar: three squared axis errors make one point.
    return Math.sqrt((sum * 3) / a.length);
  };

  const shapeUnder = (coefficients) => {
    current.set(basePoints);
    for (let k = 0; k < dim; ++k) {
      const c = coefficients[k];
      if (c === 0) continue;
      for (let row = 0; row < rows; ++row)
        current[row] += c * design[row * dim + k];
    }
  };

  let transform = null;
  let rmsBefore = 0;

  for (let iteration = 0; iteration < iterations; ++iteration) {
    shapeUnder(identity);

    // Pose: the transform taking the observed cloud onto that shape.
    transform = fitSimilarity(observed, current);
    applySimilarity(observed, transform, aligned);
    if (iteration === 0) rmsBefore = residualRms(aligned, basePoints);

    // Shape: the ridge-regularized least squares step onto the aligned cloud.
    rhs.fill(0);
    for (let row = 0; row < rows; ++row) {
      const w = weights[row];
      if (w === 0) continue;
      const target = w * (aligned[row] - basePoints[row]);
      const base = row * dim;
      for (let a = 0; a < dim; ++a) rhs[a] += design[base + a] * target;
    }

    const solved = choleskySolve(normal, rhs, dim);
    for (let k = 0; k < dim; ++k) {
      identity[k] = Math.max(-limit, Math.min(limit, solved[k]));
    }
  }

  // Final residual, measured against the shape the returned coefficients give.
  shapeUnder(identity);
  transform = fitSimilarity(observed, current);
  applySimilarity(observed, transform, aligned);
  const rmsAfter = residualRms(aligned, current);

  // The untouched tail stays zero, so the result is always the model's full
  // identity vector regardless of how many components were solved for.
  let peak = 0;
  const result = new Float32Array(model.identityDim);
  for (let k = 0; k < dim; ++k) {
    result[k] = identity[k];
    peak = Math.max(peak, Math.abs(identity[k]));
  }

  return {
    identity: result,
    transform,
    points: count,
    components: dim,
    rmsBefore,
    rmsAfter,
    peak,
  };
}

/**
 * Per-frame retarget: tracked landmarks to GNM expression and head pose.
 *
 * The same machinery as the identity fit pointed at a different basis. Align
 * the tracked cloud onto the subject's own neutral face, and whatever is left
 * over is expression; the rotation the alignment removed is the head pose.
 * Because the normal matrix does not depend on the frame, it is built and
 * factored against the subject once, and each frame costs one right-hand side
 * and one back-substitution.
 *
 * Identity must be fit first, or the subject's own face shape is read as a
 * permanent expression — a smirk on anyone whose mouth differs from the
 * template's.
 */
export class FaceRetargeter {
  /**
   * @param {!GNMHeadModel} model The loaded head model.
   * @param {!Object=} options Solver knobs.
   */
  constructor(model, options = {}) {
    const correspondence = FACE_CORRESPONDENCE;
    this.model = model;
    this.options = {...RETARGET_DEFAULTS, ...options};
    this.correspondence = correspondence;

    const count = correspondence.count;
    this._rigid = [];
    for (let i = 0; i < count; ++i) {
      if (correspondence.rigid[i]) this._rigid.push(i);
    }
    this._allLandmarks = correspondence.landmarks;
    this._rigidLandmarks = Uint16Array.from(
      this._rigid.map((i) => correspondence.landmarks[i])
    );

    // Regions are contiguous slices of the basis, so a budget is a prefix of
    // each slice. Anything outside a named region is solved for.
    const regions = expressionRegions(model.meta.expressionNames);
    const budgeted = new Uint8Array(model.expressionDim);
    const componentGain = new Float64Array(model.expressionDim).fill(1);
    for (const [name, region] of Object.entries(regions)) {
      const budget = this.options.regionBudget[name] ?? region.count;
      const keep = Math.min(budget, region.count);
      for (let i = 0; i < keep; ++i) budgeted[region.start + i] = 1;
      for (let i = keep; i < region.count; ++i) budgeted[region.start + i] = 2;
      const gain = this.options.regionGain[name] ?? 1;
      for (let i = 0; i < region.count; ++i) {
        componentGain[region.start + i] = gain;
      }
    }
    const active = [];
    for (let k = 0; k < model.expressionDim; ++k) {
      if (budgeted[k] !== 2) active.push(k);
    }
    this._active = Uint16Array.from(active);
    this._gain = Float64Array.from(
      this._active,
      (k) => componentGain[k] * this.options.gain
    );

    this._dim = this._active.length;
    this._rows = count * 3;
    const stride = model.numVertices * 3;

    // Expression is fit on *all* the correspondences, unlike identity: the
    // mouth and brow are exactly the landmarks that move, so excluding them
    // would leave nothing to solve.
    this._design = new Float64Array(this._rows * this._dim);
    for (let i = 0; i < count; ++i) {
      const vertex = correspondence.vertices[i];
      for (let axis = 0; axis < 3; ++axis) {
        const row = i * 3 + axis;
        for (let k = 0; k < this._dim; ++k) {
          const component = this._active[k];
          this._design[row * this._dim + k] =
            model.expressionBasis[component * stride + vertex * 3 + axis] *
            model.expressionScales[component];
        }
      }
    }

    this._weights = new Float64Array(this._rows);
    for (let i = 0; i < count; ++i) {
      this._weights[i * 3] = 1;
      this._weights[i * 3 + 1] = 1;
      this._weights[i * 3 + 2] = this.options.depthWeight;
    }

    this._normal = new Float64Array(this._dim * this._dim);
    for (let row = 0; row < this._rows; ++row) {
      const w = this._weights[row];
      const base = row * this._dim;
      for (let a = 0; a < this._dim; ++a) {
        const wa = w * this._design[base + a];
        if (wa === 0) continue;
        for (let b = a; b < this._dim; ++b) {
          this._normal[a * this._dim + b] += wa * this._design[base + b];
        }
      }
    }
    for (let a = 0; a < this._dim; ++a) {
      for (let b = 0; b < a; ++b) {
        this._normal[a * this._dim + b] = this._normal[b * this._dim + a];
      }
    }
    let trace = 0;
    for (let a = 0; a < this._dim; ++a)
      trace += this._normal[a * this._dim + a];
    const lambda = (this.options.ridge * trace) / this._dim;
    for (let a = 0; a < this._dim; ++a)
      this._normal[a * this._dim + a] += lambda;

    this._base = new Float64Array(this._rows);
    this._observed = new Float64Array(this._rows);
    this._rigidObserved = new Float64Array(this._rigid.length * 3);
    this._rigidBase = new Float64Array(this._rigid.length * 3);
    this._aligned = new Float64Array(this._rows);
    this._rhs = new Float64Array(this._dim);
    // Full length, so callers still get one coefficient per component; the ones
    // outside the budget simply stay zero.
    this._smoothed = new Float32Array(model.expressionDim);
    this._smoothedRotation = new Float32Array(3);
    this._started = false;

    this.setIdentity(new Float32Array(model.identityDim));
  }

  /**
   * Rebuilds the neutral cloud this subject's expressions are measured from.
   * Call whenever identity changes.
   *
   * @param {!ArrayLike<number>} identity The subject's identity coefficients.
   */
  setIdentity(identity) {
    const correspondence = this.correspondence;
    const stride = this.model.numVertices * 3;
    for (let i = 0; i < correspondence.count; ++i) {
      const vertex = correspondence.vertices[i];
      for (let axis = 0; axis < 3; ++axis) {
        let value = correspondence.reference[i * 3 + axis];
        for (let k = 0; k < identity.length; ++k) {
          const c = identity[k];
          if (c === 0) continue;
          value +=
            c *
            this.model.identityBasis[k * stride + vertex * 3 + axis] *
            this.model.identityScales[k];
        }
        this._base[i * 3 + axis] = value;
      }
    }
    for (let i = 0; i < this._rigid.length; ++i) {
      const source = this._rigid[i] * 3;
      this._rigidBase[i * 3] = this._base[source];
      this._rigidBase[i * 3 + 1] = this._base[source + 1];
      this._rigidBase[i * 3 + 2] = this._base[source + 2];
    }
  }

  /** Drops the smoothing history, so the next frame is taken as-is. */
  reset() {
    this._started = false;
    this._smoothed.fill(0);
    this._smoothedRotation.fill(0);
  }

  /**
   * Solves one frame.
   *
   * @param {!Array<{x: number, y: number, z: number}>} landmarks Normalized
   *     MediaPipe landmarks.
   * @param {number} aspect Frame width divided by height.
   * @return {{expression: !Float32Array, headRotation: !Float32Array,
   *     rms: number, transform: !Object}} The solution, smoothed.
   */
  solve(landmarks, aspect) {
    checkFrame(landmarks);
    landmarksToModelAxes(landmarks, this._allLandmarks, aspect, this._observed);
    landmarksToModelAxes(
      landmarks,
      this._rigidLandmarks,
      aspect,
      this._rigidObserved
    );

    // Align on the skull-fixed points only. Aligning on all of them would let
    // an open mouth drag the head's estimated pose around with it.
    const transform = fitSimilarity(this._rigidObserved, this._rigidBase);
    applySimilarity(this._observed, transform, this._aligned);

    this._rhs.fill(0);
    for (let row = 0; row < this._rows; ++row) {
      const target =
        this._weights[row] * (this._aligned[row] - this._base[row]);
      if (target === 0) continue;
      const base = row * this._dim;
      for (let a = 0; a < this._dim; ++a) {
        this._rhs[a] += this._design[base + a] * target;
      }
    }

    const solved = choleskySolve(this._normal, this._rhs, this._dim);
    const {limit, smoothing} = this.options;
    const alpha = this._started ? 1 - smoothing : 1;
    for (let k = 0; k < this._dim; ++k) {
      const target = this._active[k];
      const value = Math.max(
        -limit,
        Math.min(limit, solved[k] * this._gain[k])
      );
      this._smoothed[target] += (value - this._smoothed[target]) * alpha;
    }

    // The alignment rotates the observed cloud onto the neutral model, so the
    // head's own rotation is its inverse — which for a rotation is the
    // transpose.
    const r = transform.rotation;
    const inverse = Float64Array.from([
      r[0],
      r[3],
      r[6],
      r[1],
      r[4],
      r[7],
      r[2],
      r[5],
      r[8],
    ]);
    const rotation = matrixToAxisAngle(inverse, new Float32Array(3));
    for (let i = 0; i < 3; ++i) {
      this._smoothedRotation[i] +=
        (rotation[i] - this._smoothedRotation[i]) * alpha;
    }
    this._started = true;

    // Residual against the smoothed answer, so the readout reflects what is
    // actually on screen rather than the unsmoothed solve.
    let sum = 0;
    for (let row = 0; row < this._rows; ++row) {
      let predicted = this._base[row];
      const base = row * this._dim;
      for (let k = 0; k < this._dim; ++k) {
        predicted += this._smoothed[this._active[k]] * this._design[base + k];
      }
      const d = (this._aligned[row] - predicted) * 1000;
      sum += d * d;
    }

    return {
      expression: this._smoothed,
      headRotation: this._smoothedRotation,
      rms: Math.sqrt((sum * 3) / this._rows),
      transform,
    };
  }
}
