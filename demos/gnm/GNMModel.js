/**
 * GNMModel.js — JavaScript port of the GNM (Generative aNthropometric Model)
 * head forward function, mirroring gnm/shape/gnm_common.py:
 *
 *   bind  = template + identity_basis^T id + expression_basis^T expr
 *   joints = template_joints + joint_identity_basis^T id
 *   world = LinearBlendSkinning(bind + pose_correctives, FK(joints, rotations))
 *
 * The model data is read from a 'GNMW' container produced by
 * tools/export_gnm_web.py. The large PCA bases are int8-quantized with one
 * float32 scale per component; coefficients fold the scale in at accumulation
 * time so dequantization is free.
 *
 * This file is dependency-free (typed arrays only) so it runs in Node for
 * verification as well as in the browser.
 */

const MAGIC = 0x474e4d57; // 'GNMW'
const EPSILON = 1e-8;
// Full re-accumulation after this many incremental slider updates bounds
// float32 drift.
const MAX_INCREMENTAL_UPDATES = 2000;

const DTYPE_CTORS = {
  float32: Float32Array,
  int8: Int8Array,
  uint8: Uint8Array,
  uint16: Uint16Array,
  int32: Int32Array,
};

/** Parses a GNMW container buffer into {meta, sections}. */
export function parseContainer(buffer) {
  const view = new DataView(buffer);
  const magic =
    (view.getUint8(0) << 24) |
    (view.getUint8(1) << 16) |
    (view.getUint8(2) << 8) |
    view.getUint8(3);
  if (magic !== MAGIC) {
    throw new Error('Not a GNMW container.');
  }
  const version = view.getUint32(4, true);
  if (version !== 1) {
    throw new Error(`Unsupported GNMW version ${version}.`);
  }
  const headerLength = view.getUint32(8, true);
  const headerText = new TextDecoder().decode(
    new Uint8Array(buffer, 12, headerLength)
  );
  const header = JSON.parse(headerText);
  const base = 12 + headerLength;
  const sections = {};
  for (const section of header.sections) {
    const Ctor = DTYPE_CTORS[section.dtype];
    sections[section.name] = new Ctor(
      buffer,
      base + section.offset,
      section.byteLength / Ctor.BYTES_PER_ELEMENT
    );
  }
  return {meta: header.meta, sections};
}

/** Fetches a URL into an ArrayBuffer, reporting streaming progress. */
export async function fetchWithProgress(url, onProgress) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to fetch ${url}: ${response.status}`);
  }
  const total = Number(response.headers.get('Content-Length')) || 0;
  if (!response.body || !total) {
    return await response.arrayBuffer();
  }
  const reader = response.body.getReader();
  const data = new Uint8Array(total);
  let received = 0;
  for (;;) {
    const {done, value} = await reader.read();
    if (done) break;
    if (received + value.length > total) {
      // Content-Length lied (e.g. proxy); fall back to chunk list.
      const chunks = [data.subarray(0, received), value];
      for (;;) {
        const next = await reader.read();
        if (next.done) break;
        chunks.push(next.value);
      }
      const length = chunks.reduce((n, c) => n + c.length, 0);
      const out = new Uint8Array(length);
      let offset = 0;
      for (const chunk of chunks) {
        out.set(chunk, offset);
        offset += chunk.length;
      }
      return out.buffer;
    }
    data.set(value, received);
    received += value.length;
    if (onProgress) onProgress(received / total);
  }
  return data.buffer.byteLength === received
    ? data.buffer
    : data.slice(0, received).buffer;
}

/** Rodrigues' formula matching gnm_common.axis_angle_to_rotation_matrix. */
export function axisAngleToMatrix(x, y, z, out, offset = 0) {
  const normSquared = x * x + y * y + z * z;
  const angle = Math.sqrt(Math.max(normSquared, EPSILON));
  const ax = x / angle;
  const ay = y / angle;
  const az = z / angle;
  const s = Math.sin(angle);
  const c = Math.cos(angle);
  const t = 1 - c;
  out[offset + 0] = c + t * ax * ax;
  out[offset + 1] = t * ax * ay - s * az;
  out[offset + 2] = t * ax * az + s * ay;
  out[offset + 3] = t * ax * ay + s * az;
  out[offset + 4] = c + t * ay * ay;
  out[offset + 5] = t * ay * az - s * ax;
  out[offset + 6] = t * ax * az - s * ay;
  out[offset + 7] = t * ay * az + s * ax;
  out[offset + 8] = c + t * az * az;
}

export class GNMHeadModel {
  constructor(meta, sections) {
    this.meta = meta;
    this.numVertices = meta.numVertices;
    this.numJoints = meta.numJoints;
    this.identityDim = meta.identityDim;
    this.expressionDim = meta.expressionDim;

    this.template = sections.template;
    this.triangles = sections.triangles;
    this.quads = sections.quads;
    this.templateJoints = sections.template_joints;
    this.jointParents = sections.joint_parents;
    this.skinningWeights = sections.skinning_weights;
    this.jointIdentityBasis = sections.joint_identity_basis;
    this.identityBasis = sections.identity_basis;
    this.identityScales = sections.identity_scales;
    this.expressionBasis = sections.expression_basis;
    this.expressionScales = sections.expression_scales;
    this.componentId = sections.component_id;
    this.materialId = sections.material_id;
    this.regionId = sections.region_id;
    this.landmarkIndices = sections.landmark_indices;
    this.landmarkWeights = sections.landmark_weights;

    const v3 = this.numVertices * 3;
    // Parameters.
    this.identity = new Float32Array(this.identityDim);
    this.expression = new Float32Array(this.expressionDim);
    this.rotations = new Float32Array(this.numJoints * 3);
    this.translation = new Float32Array(3);

    // Cached linear-basis sums (bind-pose displacements).
    this._idSum = new Float32Array(v3);
    this._exprSum = new Float32Array(v3);
    this._incrementalUpdates = 0;

    // Blend states (null when inactive).
    this._idBlend = null;
    this._exprBlend = null;

    // Scratch buffers for the pose pipeline.
    this._bind = new Float32Array(v3);
    this._jointsBind = new Float32Array(this.numJoints * 3);
    this._rotWorld = new Float32Array(this.numJoints * 9);
    this._skinTrans = new Float32Array(this.numJoints * 3);
    this.jointsWorld = new Float32Array(this.numJoints * 3);

    this.dirty = true;
  }

  static async load(url, onProgress) {
    const buffer = await fetchWithProgress(url, onProgress);
    const {meta, sections} = parseContainer(buffer);
    return new GNMHeadModel(meta, sections);
  }

  // ---------------------------------------------------------------- params --

  /** Adds `factor` times basis component `index` into `sum`. */
  _addComponent(sum, basis, index, factor) {
    if (factor === 0) return;
    const offset = index * sum.length;
    for (let j = 0, n = sum.length; j < n; ++j) {
      sum[j] += basis[offset + j] * factor;
    }
  }

  _accumulate(sum, basis, scales, coefficients) {
    sum.fill(0);
    for (let i = 0; i < coefficients.length; ++i) {
      const c = coefficients[i];
      if (c !== 0) this._addComponent(sum, basis, i, c * scales[i]);
    }
  }

  _maybeReaccumulate() {
    if (++this._incrementalUpdates < MAX_INCREMENTAL_UPDATES) return;
    this._incrementalUpdates = 0;
    this._accumulate(
      this._idSum,
      this.identityBasis,
      this.identityScales,
      this.identity
    );
    this._accumulate(
      this._exprSum,
      this.expressionBasis,
      this.expressionScales,
      this.expression
    );
  }

  setIdentityParam(index, value) {
    const delta = value - this.identity[index];
    if (delta === 0) return;
    this.identity[index] = value;
    this._addComponent(
      this._idSum,
      this.identityBasis,
      index,
      delta * this.identityScales[index]
    );
    this._maybeReaccumulate();
    this.dirty = true;
  }

  setExpressionParam(index, value) {
    const delta = value - this.expression[index];
    if (delta === 0) return;
    this.expression[index] = value;
    this._addComponent(
      this._exprSum,
      this.expressionBasis,
      index,
      delta * this.expressionScales[index]
    );
    this._maybeReaccumulate();
    this.dirty = true;
  }

  setIdentityVector(values) {
    this.identity.set(values.subarray ? values : Float32Array.from(values));
    this._accumulate(
      this._idSum,
      this.identityBasis,
      this.identityScales,
      this.identity
    );
    this._idBlend = null;
    this.dirty = true;
  }

  setExpressionVector(values) {
    this.expression.set(values.subarray ? values : Float32Array.from(values));
    this._accumulate(
      this._exprSum,
      this.expressionBasis,
      this.expressionScales,
      this.expression
    );
    this._exprBlend = null;
    this.dirty = true;
  }

  resetIdentity() {
    this.setIdentityVector(new Float32Array(this.identityDim));
  }

  resetExpression() {
    this.setExpressionVector(new Float32Array(this.expressionDim));
  }

  setJointRotation(jointIndex, x, y, z) {
    const o = jointIndex * 3;
    this.rotations[o] = x;
    this.rotations[o + 1] = y;
    this.rotations[o + 2] = z;
    this.dirty = true;
  }

  setTranslation(x, y, z) {
    this.translation[0] = x;
    this.translation[1] = y;
    this.translation[2] = z;
    this.dirty = true;
  }

  resetPose() {
    this.rotations.fill(0);
    this.translation.fill(0);
    this.dirty = true;
  }

  // ---------------------------------------------------------------- blends --
  // Blending exploits linearity: sum(lerp(a, b, t)) == lerp(sumA, sumB, t),
  // so a full-vector crossfade costs one lerp over V*3 floats per frame
  // instead of a (dim × V × 3) re-accumulation.

  _beginBlend(kind, target, basis, scales, current, currentSum) {
    const targetArray = Float32Array.from(target);
    const sumB = new Float32Array(currentSum.length);
    this._accumulate(sumB, basis, scales, targetArray);
    this[kind] = {
      coeffA: Float32Array.from(current),
      coeffB: targetArray,
      sumA: Float32Array.from(currentSum),
      sumB,
    };
  }

  beginIdentityBlend(target) {
    this._beginBlend(
      '_idBlend',
      target,
      this.identityBasis,
      this.identityScales,
      this.identity,
      this._idSum
    );
  }

  beginExpressionBlend(target) {
    this._beginBlend(
      '_exprBlend',
      target,
      this.expressionBasis,
      this.expressionScales,
      this.expression,
      this._exprSum
    );
  }

  _applyBlend(blend, coefficients, sum, t) {
    const s = 1 - t;
    const {coeffA, coeffB, sumA, sumB} = blend;
    for (let i = 0; i < coefficients.length; ++i) {
      coefficients[i] = coeffA[i] * s + coeffB[i] * t;
    }
    for (let j = 0, n = sum.length; j < n; ++j) {
      sum[j] = sumA[j] * s + sumB[j] * t;
    }
    this.dirty = true;
  }

  setIdentityBlend(t) {
    if (this._idBlend) {
      this._applyBlend(this._idBlend, this.identity, this._idSum, t);
    }
  }

  setExpressionBlend(t) {
    if (this._exprBlend) {
      this._applyBlend(this._exprBlend, this.expression, this._exprSum, t);
    }
  }

  // --------------------------------------------------------------- forward --

  _computeJointsBind() {
    const out = this._jointsBind;
    out.set(this.templateJoints);
    const basis = this.jointIdentityBasis;
    const stride = this.numJoints * 3;
    for (let i = 0; i < this.identityDim; ++i) {
      const c = this.identity[i];
      if (c === 0) continue;
      const offset = i * stride;
      for (let k = 0; k < stride; ++k) {
        out[k] += basis[offset + k] * c;
      }
    }
  }

  /**
   * Forward kinematics matching gnm_common.joint_transforms_world, followed
   * by the skinning-transform construction from linear_blend_skinning:
   * per joint, rotation R_world and translation t_world − R_world·j_bind.
   */
  _computeJointTransforms() {
    const J = this.numJoints;
    const joints = this._jointsBind;
    const parents = this.jointParents;
    const rotWorld = this._rotWorld;
    const localRot = new Float32Array(9);
    const worldTrans = this.jointsWorld;

    for (let j = 0; j < J; ++j) {
      axisAngleToMatrix(
        this.rotations[j * 3],
        this.rotations[j * 3 + 1],
        this.rotations[j * 3 + 2],
        localRot,
        0
      );
      let lx, ly, lz;
      if (j === 0) {
        lx = joints[0] + this.translation[0];
        ly = joints[1] + this.translation[1];
        lz = joints[2] + this.translation[2];
        rotWorld.set(localRot, 0);
        worldTrans[0] = lx;
        worldTrans[1] = ly;
        worldTrans[2] = lz;
      } else {
        const p = parents[j];
        lx = joints[j * 3] - joints[p * 3];
        ly = joints[j * 3 + 1] - joints[p * 3 + 1];
        lz = joints[j * 3 + 2] - joints[p * 3 + 2];
        const po = p * 9;
        const jo = j * 9;
        // rotWorld[j] = rotWorld[p] * localRot
        for (let r = 0; r < 3; ++r) {
          for (let c = 0; c < 3; ++c) {
            rotWorld[jo + r * 3 + c] =
              rotWorld[po + r * 3] * localRot[c] +
              rotWorld[po + r * 3 + 1] * localRot[3 + c] +
              rotWorld[po + r * 3 + 2] * localRot[6 + c];
          }
        }
        // worldTrans[j] = rotWorld[p] * local + worldTrans[p]
        worldTrans[j * 3] =
          rotWorld[po] * lx +
          rotWorld[po + 1] * ly +
          rotWorld[po + 2] * lz +
          worldTrans[p * 3];
        worldTrans[j * 3 + 1] =
          rotWorld[po + 3] * lx +
          rotWorld[po + 4] * ly +
          rotWorld[po + 5] * lz +
          worldTrans[p * 3 + 1];
        worldTrans[j * 3 + 2] =
          rotWorld[po + 6] * lx +
          rotWorld[po + 7] * ly +
          rotWorld[po + 8] * lz +
          worldTrans[p * 3 + 2];
      }
    }

    // Skinning translation: t_world − R_world · j_bind.
    const skinTrans = this._skinTrans;
    for (let j = 0; j < J; ++j) {
      const jo = j * 9;
      const bx = joints[j * 3];
      const by = joints[j * 3 + 1];
      const bz = joints[j * 3 + 2];
      skinTrans[j * 3] =
        worldTrans[j * 3] -
        (rotWorld[jo] * bx + rotWorld[jo + 1] * by + rotWorld[jo + 2] * bz);
      skinTrans[j * 3 + 1] =
        worldTrans[j * 3 + 1] -
        (rotWorld[jo + 3] * bx + rotWorld[jo + 4] * by + rotWorld[jo + 5] * bz);
      skinTrans[j * 3 + 2] =
        worldTrans[j * 3 + 2] -
        (rotWorld[jo + 6] * bx + rotWorld[jo + 7] * by + rotWorld[jo + 8] * bz);
    }
  }

  /**
   * Runs the full forward pass and writes world-space vertices into `out`
   * (Float32Array of length numVertices*3). Also refreshes `jointsWorld`.
   */
  computeVertices(out) {
    const V = this.numVertices;
    const bind = this._bind;
    const template = this.template;
    const idSum = this._idSum;
    const exprSum = this._exprSum;
    for (let j = 0, n = V * 3; j < n; ++j) {
      bind[j] = template[j] + idSum[j] + exprSum[j];
    }

    this._computeJointsBind();
    this._computeJointTransforms();

    const weights = this.skinningWeights;
    const rotWorld = this._rotWorld;
    const skinTrans = this._skinTrans;
    const J = this.numJoints;
    for (let v = 0; v < V; ++v) {
      const px = bind[v * 3];
      const py = bind[v * 3 + 1];
      const pz = bind[v * 3 + 2];
      let ox = 0;
      let oy = 0;
      let oz = 0;
      for (let j = 0; j < J; ++j) {
        const w = weights[j * V + v];
        if (w === 0) continue;
        const jo = j * 9;
        ox +=
          w *
          (rotWorld[jo] * px +
            rotWorld[jo + 1] * py +
            rotWorld[jo + 2] * pz +
            skinTrans[j * 3]);
        oy +=
          w *
          (rotWorld[jo + 3] * px +
            rotWorld[jo + 4] * py +
            rotWorld[jo + 5] * pz +
            skinTrans[j * 3 + 1]);
        oz +=
          w *
          (rotWorld[jo + 6] * px +
            rotWorld[jo + 7] * py +
            rotWorld[jo + 8] * pz +
            skinTrans[j * 3 + 2]);
      }
      out[v * 3] = ox;
      out[v * 3 + 1] = oy;
      out[v * 3 + 2] = oz;
    }
    this.dirty = false;
  }

  /** Barycentric landmark extraction (68 × 3 vertices/weights). */
  computeLandmarks(vertices, out) {
    const indices = this.landmarkIndices;
    const weights = this.landmarkWeights;
    const count = indices.length / 3;
    for (let l = 0; l < count; ++l) {
      let x = 0;
      let y = 0;
      let z = 0;
      for (let k = 0; k < 3; ++k) {
        const vi = indices[l * 3 + k] * 3;
        const w = weights[l * 3 + k];
        x += vertices[vi] * w;
        y += vertices[vi + 1] * w;
        z += vertices[vi + 2] * w;
      }
      out[l * 3] = x;
      out[l * 3 + 1] = y;
      out[l * 3 + 2] = z;
    }
    return count;
  }

  /** World-space rotation frame (row-major 3x3) of a joint after FK. */
  getJointWorldRotation(jointIndex) {
    return this._rotWorld.subarray(jointIndex * 9, jointIndex * 9 + 9);
  }
}
