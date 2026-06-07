/**
 * VisemeWeights: the small mouth-shape vocabulary {@link StylizedFace}
 * consumes. Anything that wants to drive a face — a lipsync addon, an
 * ARKit blendshape feed, a hand-authored animation — produces a value
 * of this shape and passes it to `face.setVisemes(...)`.
 *
 * Lives in core (not in any addon) so addons that produce visemes and
 * addons that consume them never have to depend on each other.
 *
 * Each field is a 0..1 weight; values outside that range are clamped
 * by the consumer. The set is deliberately small — it covers the four
 * cardinal vowel shapes plus a generic consonant/closed lip — so it
 * can be driven cheaply from formants, blendshapes, or simple
 * heuristics without needing the full 15-viseme ARKit set.
 */
export interface VisemeWeights {
  /** Jaw drop, independent of lip rounding. */
  jawOpen: number;
  /** /aa/ as in "father". Wide and open. */
  aa: number;
  /** /oo/ as in "boot". Narrow and rounded. */
  oo: number;
  /** /oh/ as in "go". Mid-round. */
  oh: number;
  /** /ee/ as in "see". Wide and closed. */
  ee: number;
  /** Generic consonant / lips closed. */
  consonant: number;
}

/** Zero-weight viseme set; useful as a rest pose initialiser. */
export const ZERO_VISEME: Readonly<VisemeWeights> = Object.freeze({
  jawOpen: 0,
  aa: 0,
  oo: 0,
  oh: 0,
  ee: 0,
  consonant: 0,
});
