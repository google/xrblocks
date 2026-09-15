/**
 * SemanticSampler.js — JavaScript port of gnm/shape/semantic_sampler.py.
 *
 * The identity and expression samplers are conditional-VAE decoders: a small
 * MLP mapping [latent z, one-hot condition] to a GNM parameter vector. The
 * exported weights (tools/export_gnm_web.py) run here as plain typed-array
 * matrix products, enabling live semantic sampling in the browser:
 *
 *   identity:   z(64) + [gender(2), ethnicity(4)]  -> 253 identity params
 *   expression: z(64) + [expression class(20)]     -> 383 expression params
 *
 * Blending mirrors the Python reference: expressions blend per-class latents
 * and one-hots; identities share one latent with blended condition one-hots.
 */

import {fetchWithProgress, parseContainer} from './GNMModel.js';

/** Deterministic 32-bit PRNG (mulberry32) so results are reproducible. */
export function createRng(seed) {
  let state = seed >>> 0;
  return function () {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Standard normal via Box–Muller. */
function gaussian(rng) {
  let u = 0;
  while (u === 0) u = rng();
  const v = rng();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

class MLPDecoder {
  /** @param layers Array of {weights, bias, activation, inputDim, outputDim} */
  constructor(layers) {
    this.layers = layers;
    this.inputDim = layers[0].inputDim;
    this.outputDim = layers[layers.length - 1].outputDim;
    let maxDim = this.inputDim;
    for (const layer of layers) maxDim = Math.max(maxDim, layer.outputDim);
    this._bufferA = new Float32Array(maxDim);
    this._bufferB = new Float32Array(maxDim);
  }

  /** input: Float32Array(inputDim) -> Float32Array(outputDim) (fresh copy). */
  forward(input) {
    let x = this._bufferA;
    let y = this._bufferB;
    x.set(input);
    let currentDim = this.inputDim;
    for (const layer of this.layers) {
      const {weights, bias, activation, outputDim} = layer;
      for (let o = 0; o < outputDim; ++o) {
        let acc = bias[o];
        for (let i = 0; i < currentDim; ++i) {
          acc += x[i] * weights[i * outputDim + o];
        }
        y[o] = activation === 'relu' && acc < 0 ? 0 : acc;
      }
      [x, y] = [y, x];
      currentDim = outputDim;
    }
    return x.slice(0, currentDim);
  }
}

export class GNMSamplers {
  constructor(meta, sections) {
    this.identityMeta = meta.identity;
    this.expressionMeta = meta.expression;
    this.identityDecoder = new MLPDecoder(
      meta.identity.layers.map((l) => ({
        ...l,
        weights: sections[l.weights],
        bias: sections[l.bias],
      }))
    );
    this.expressionDecoder = new MLPDecoder(
      meta.expression.layers.map((l) => ({
        ...l,
        weights: sections[l.weights],
        bias: sections[l.bias],
      }))
    );
    this.genders = meta.identity.genders;
    this.ethnicities = meta.identity.ethnicities;
    this.expressionClasses = meta.expression.labels;
    this._rng = createRng(20260717);
  }

  static async load(url, onProgress) {
    const buffer = await fetchWithProgress(url, onProgress);
    const {meta, sections} = parseContainer(buffer);
    return new GNMSamplers(meta, sections);
  }

  /** Reseeds the internal RNG (useful for reproducible demos). */
  seed(value) {
    this._rng = createRng(value);
  }

  _sampleLatent(dim, sigma) {
    const z = new Float32Array(dim);
    for (let i = 0; i < dim; ++i) z[i] = gaussian(this._rng) * sigma;
    return z;
  }

  /**
   * Samples an identity vector.
   * genderWeights / ethnicityWeights: arrays of non-negative weights (one per
   * class, normalized internally); pass a one-hot for a pure class.
   * sigma scales latent variation (0 = class mean).
   */
  sampleIdentity(genderWeights, ethnicityWeights, sigma = 1) {
    const {latentDim} = this.identityMeta;
    const input = new Float32Array(this.identityDecoder.inputDim);
    input.set(this._sampleLatent(latentDim, sigma), 0);
    normalizeInto(input, latentDim, genderWeights);
    normalizeInto(input, latentDim + genderWeights.length, ethnicityWeights);
    return this.identityDecoder.forward(input);
  }

  /**
   * Samples an expression vector for one class index, or blends several:
   * pass a Map/object of classIndex -> weight. Each class contributes its own
   * latent sample, matching ExpressionSampler.blend_expressions.
   */
  sampleExpression(classWeights, sigma = 1) {
    const {latentDim, conditionDim} = this.expressionMeta;
    const entries =
      typeof classWeights === 'number'
        ? [[classWeights, 1]]
        : Object.entries(classWeights).map(([k, w]) => [Number(k), w]);
    let total = 0;
    for (const [, w] of entries) total += w;
    if (!(total > 0)) total = 1;

    const input = new Float32Array(this.expressionDecoder.inputDim);
    for (const [classIndex, weight] of entries) {
      const w = weight / total;
      if (w === 0) continue;
      const z = this._sampleLatent(latentDim, sigma);
      for (let i = 0; i < latentDim; ++i) input[i] += z[i] * w;
      input[latentDim + classIndex] += w;
    }
    return this.expressionDecoder.forward(input);
  }

  /** Random blended identity, mirroring IdentitySampler.randomize_identities. */
  randomIdentity(sigma = 1) {
    const genderWeights = this.genders.map(() => this._rng());
    const ethnicityWeights = this.ethnicities.map(() => this._rng());
    return this.sampleIdentity(genderWeights, ethnicityWeights, sigma);
  }

  /** Random 2–3 class expression blend, mirroring randomize_expressions. */
  randomExpression(sigma = 1, maxClasses = 3) {
    const count = 2 + Math.floor(this._rng() * (maxClasses - 1));
    const chosen = new Set();
    while (chosen.size < count) {
      chosen.add(Math.floor(this._rng() * this.expressionClasses.length));
    }
    const weights = {};
    for (const c of chosen) weights[c] = this._rng();
    return this.sampleExpression(weights, sigma);
  }
}

function normalizeInto(target, offset, weights) {
  let total = 0;
  for (const w of weights) total += w;
  if (!(total > 0)) total = 1;
  for (let i = 0; i < weights.length; ++i) {
    target[offset + i] = weights[i] / total;
  }
}
