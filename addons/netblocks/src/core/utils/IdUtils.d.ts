export declare function makeId(length?: number): string;
/**
 * Deterministic-ish hash used to derive a stable per-peer color from a peer
 * id, so the same remote user always shows up the same color across reloads.
 */
export declare function hashStringToHue(input: string): number;
/**
 * Map a string to a stable index in [0, modulo). Same hash family as
 * `hashStringToHue` so callers get deterministic-across-reloads bucketing
 * (e.g. picking a per-peer color from a fixed palette).
 */
export declare function hashStringToIndex(input: string, modulo: number): number;
