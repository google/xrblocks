/**
 * Generates a short, URL-safe random id. Uses crypto.getRandomValues when
 * available, falling back to Math.random for non-secure contexts (samples,
 * tests). The output is alphanumeric and 12 characters by default — short
 * enough to fit comfortably in URLs and chat messages, long enough to avoid
 * collisions inside a typical XR session.
 */
const ALPHABET = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
function makeId(length = 12) {
    const out = new Array(length);
    if (typeof crypto !== 'undefined' &&
        typeof crypto.getRandomValues === 'function') {
        const buf = new Uint8Array(length);
        crypto.getRandomValues(buf);
        for (let i = 0; i < length; i++) {
            out[i] = ALPHABET[buf[i] % ALPHABET.length];
        }
    }
    else {
        for (let i = 0; i < length; i++) {
            out[i] = ALPHABET[Math.floor(Math.random() * ALPHABET.length)];
        }
    }
    return out.join('');
}
/**
 * Deterministic-ish hash used to derive a stable per-peer color from a peer
 * id, so the same remote user always shows up the same color across reloads.
 */
function hashStringToHue(input) {
    let h = 2166136261 >>> 0;
    for (let i = 0; i < input.length; i++) {
        h ^= input.charCodeAt(i);
        h = Math.imul(h, 16777619);
    }
    return (h >>> 0) / 0xffffffff;
}
/**
 * Map a string to a stable index in [0, modulo). Same hash family as
 * `hashStringToHue` so callers get deterministic-across-reloads bucketing
 * (e.g. picking a per-peer color from a fixed palette).
 */
function hashStringToIndex(input, modulo) {
    let h = 2166136261 >>> 0;
    for (let i = 0; i < input.length; i++) {
        h ^= input.charCodeAt(i);
        h = Math.imul(h, 16777619);
    }
    return (h >>> 0) % modulo;
}

export { hashStringToHue, hashStringToIndex, makeId };
