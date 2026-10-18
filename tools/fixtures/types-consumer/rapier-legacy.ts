import type RAPIER from 'rapier-simd-legacy';
import {Options} from 'xrblocks';

// Also exercise the SIMD version used by existing samples. Its own raw.d.ts
// references a missing rapier_wasm3d-simd file, so this supplemental assignment
// check skips dependency declarations. TS2322 in this consumer is still checked.
declare const rapier: typeof RAPIER;
const options = new Options();
options.physics.RAPIER = rapier;
