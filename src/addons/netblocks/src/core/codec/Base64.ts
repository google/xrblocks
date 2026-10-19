const B64_CHARS =
  'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

/** Browser-safe base64 encode for Uint8Array. */
export function bytesToBase64(bytes: Uint8Array): string {
  let out = '';
  let i = 0;
  for (; i + 3 <= bytes.length; i += 3) {
    const a = bytes[i];
    const b = bytes[i + 1];
    const c = bytes[i + 2];
    out +=
      B64_CHARS[a >> 2] +
      B64_CHARS[((a & 0x03) << 4) | (b >> 4)] +
      B64_CHARS[((b & 0x0f) << 2) | (c >> 6)] +
      B64_CHARS[c & 0x3f];
  }
  const rem = bytes.length - i;
  if (rem === 1) {
    const a = bytes[i];
    out += B64_CHARS[a >> 2] + B64_CHARS[(a & 0x03) << 4] + '==';
  } else if (rem === 2) {
    const a = bytes[i];
    const b = bytes[i + 1];
    out +=
      B64_CHARS[a >> 2] +
      B64_CHARS[((a & 0x03) << 4) | (b >> 4)] +
      B64_CHARS[(b & 0x0f) << 2] +
      '=';
  }
  return out;
}

const B64_LOOKUP = (() => {
  const t = new Int16Array(128).fill(-1);
  for (let i = 0; i < B64_CHARS.length; i++) t[B64_CHARS.charCodeAt(i)] = i;
  return t;
})();

export function base64ToBytes(b64: string): Uint8Array {
  const clean = b64.replace(/=+$/, '');
  const len = (clean.length * 3) >> 2;
  const bytes = new Uint8Array(len);
  let p = 0;
  for (let i = 0; i < clean.length; i += 4) {
    const a = B64_LOOKUP[clean.charCodeAt(i)];
    const b = B64_LOOKUP[clean.charCodeAt(i + 1)];
    const c = B64_LOOKUP[clean.charCodeAt(i + 2)];
    const d = B64_LOOKUP[clean.charCodeAt(i + 3)];
    // The first two sextets are required for any output byte. If the
    // input contains a non-base64 char in those slots the lookup is -1
    // and we'd silently emit garbage; bail instead so callers can see
    // decode failures.
    if (a === -1 || b === -1) {
      throw new Error('base64ToBytes: invalid character in input.');
    }
    if (p < len) bytes[p++] = (a << 2) | (b >> 4);
    if (p < len && c !== -1) bytes[p++] = ((b & 0x0f) << 4) | (c >> 2);
    if (p < len && d !== -1) bytes[p++] = ((c & 0x03) << 6) | d;
  }
  return bytes;
}
