/**
 * VRMVisemeTarget.js
 *
 * Adapts the lipsync add-on's viseme contract to a VRM model's mouth.
 *
 * `LipsyncMouth` drives any object with `setVisemes(VisemeWeights)`. The add-on
 * ships `xb.StylizedFace` (a flat canvas decal), but here we want the VRM model's
 * own mouth to move, so this adapter maps the 6-channel viseme record
 * `{jawOpen, aa, oo, oh, ee, consonant}` onto the VRM 1.0 vowel expression presets
 * (`aa`, `ih`, `ou`, `ee`, `oh`).
 *
 * Values are written to `vrm.expressionManager` here and applied when
 * `VRMAvatar.update()` calls `vrm.update()` each frame. Missing presets are
 * silently skipped, so a model without a full viseme set still animates whatever
 * shapes it has.
 *
 * Note: the heuristic `FormantVisemeMapper` always emits `oh: 0` (only a future ML
 * mapper sets it), so jaw openness is folded into `aa` to keep the mouth lively.
 */

const clamp01 = (x) => Math.min(1, Math.max(0, x));

export class VRMVisemeTarget {
  /**
   * @param {object} vrm The loaded VRM instance (has `expressionManager`).
   */
  constructor(vrm) {
    this.vrm = vrm;
    const em = vrm?.expressionManager;
    // Only drive presets the model actually exposes.
    this._has = (name) => !!em?.getExpression?.(name);
  }

  /**
   * @param {{jawOpen:number, aa:number, oo:number, oh:number, ee:number, consonant:number}} v
   */
  setVisemes(v) {
    const em = this.vrm?.expressionManager;
    if (!em) return;

    // Jaw openness mostly reads as an open "aa" mouth.
    this._set('aa', clamp01(v.aa + v.jawOpen * 0.6));
    this._set('ou', clamp01(v.oo));
    this._set('oh', clamp01(v.oh));
    this._set('ee', clamp01(v.ee));
    // Consonants are a near-closed shape; "ih" is the closest narrow preset.
    this._set('ih', clamp01(v.consonant * 0.4));
  }

  _set(name, weight) {
    if (this._has(name)) {
      this.vrm.expressionManager.setValue(name, weight);
    }
  }
}
