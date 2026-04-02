/**
 * 3D Simplex Noise implementation for curl noise computation.
 * Based on Stefan Gustavson's simplex noise algorithm.
 *
 * MATH: Simplex noise uses a skewed grid (simplex lattice) instead of a
 * hypercubic grid. For 3D, the skew factor is F = 1/3 and unskew G = 1/6.
 * The simplex in 3D is a tetrahedron. Gradient contributions are summed
 * from the 4 corners of the containing tetrahedron.
 */

// Permutation table (doubled to avoid wrapping)
const perm = new Uint8Array(512);
const grad3 = [
  [1, 1, 0],
  [-1, 1, 0],
  [1, -1, 0],
  [-1, -1, 0],
  [1, 0, 1],
  [-1, 0, 1],
  [1, 0, -1],
  [-1, 0, -1],
  [0, 1, 1],
  [0, -1, 1],
  [0, 1, -1],
  [0, -1, -1],
];

// Seed the permutation table
(function initPerm() {
  const p = new Uint8Array(256);
  for (let i = 0; i < 256; i++) p[i] = i;
  // Fisher-Yates shuffle with fixed seed for reproducibility
  let seed = 42;
  for (let i = 255; i > 0; i--) {
    seed = (seed * 16807 + 0) % 2147483647;
    const j = seed % (i + 1);
    [p[i], p[j]] = [p[j], p[i]];
  }
  for (let i = 0; i < 512; i++) perm[i] = p[i & 255];
})();

function dot3(g: number[], x: number, y: number, z: number): number {
  return g[0] * x + g[1] * y + g[2] * z;
}

/**
 * 3D Simplex Noise.
 *
 * MATH HIGHLIGHT:
 * - Skew transform: (x,y,z) -> simplex space using F = (sqrt(4) - 1) / 3 = 1/3
 * - Unskew: G = (1 - 1/sqrt(4)) / 3 = 1/6
 * - Contribution kernel: max(0, 0.6 - dx² - dy² - dz²)^4 * gradient·distance
 * - Returns value in range [-1, 1]
 */
export function simplex3(x: number, y: number, z: number): number {
  const F3 = 1.0 / 3.0;
  const G3 = 1.0 / 6.0;

  // Skew input space to determine which simplex cell we're in
  const s = (x + y + z) * F3;
  const i = Math.floor(x + s);
  const j = Math.floor(y + s);
  const k = Math.floor(z + s);

  const t = (i + j + k) * G3;
  // Unskew back to (x,y,z) space
  const x0 = x - (i - t);
  const y0 = y - (j - t);
  const z0 = z - (k - t);

  // Determine which simplex (tetrahedron) we are in
  let i1: number, j1: number, k1: number;
  let i2: number, j2: number, k2: number;

  if (x0 >= y0) {
    if (y0 >= z0) {
      i1 = 1;
      j1 = 0;
      k1 = 0;
      i2 = 1;
      j2 = 1;
      k2 = 0;
    } else if (x0 >= z0) {
      i1 = 1;
      j1 = 0;
      k1 = 0;
      i2 = 1;
      j2 = 0;
      k2 = 1;
    } else {
      i1 = 0;
      j1 = 0;
      k1 = 1;
      i2 = 1;
      j2 = 0;
      k2 = 1;
    }
  } else {
    if (y0 < z0) {
      i1 = 0;
      j1 = 0;
      k1 = 1;
      i2 = 0;
      j2 = 1;
      k2 = 1;
    } else if (x0 < z0) {
      i1 = 0;
      j1 = 1;
      k1 = 0;
      i2 = 0;
      j2 = 1;
      k2 = 1;
    } else {
      i1 = 0;
      j1 = 1;
      k1 = 0;
      i2 = 1;
      j2 = 1;
      k2 = 0;
    }
  }

  // Offsets for remaining corners
  const x1 = x0 - i1 + G3;
  const y1 = y0 - j1 + G3;
  const z1 = z0 - k1 + G3;
  const x2 = x0 - i2 + 2.0 * G3;
  const y2 = y0 - j2 + 2.0 * G3;
  const z2 = z0 - k2 + 2.0 * G3;
  const x3 = x0 - 1.0 + 3.0 * G3;
  const y3 = y0 - 1.0 + 3.0 * G3;
  const z3 = z0 - 1.0 + 3.0 * G3;

  // Hash coordinates of the 4 simplex corners
  const ii = i & 255;
  const jj = j & 255;
  const kk = k & 255;

  // Calculate contributions from each corner
  let n0 = 0,
    n1 = 0,
    n2 = 0,
    n3 = 0;

  let t0 = 0.6 - x0 * x0 - y0 * y0 - z0 * z0;
  if (t0 > 0) {
    t0 *= t0;
    const gi0 = perm[ii + perm[jj + perm[kk]]] % 12;
    n0 = t0 * t0 * dot3(grad3[gi0], x0, y0, z0);
  }

  let t1 = 0.6 - x1 * x1 - y1 * y1 - z1 * z1;
  if (t1 > 0) {
    t1 *= t1;
    const gi1 = perm[ii + i1 + perm[jj + j1 + perm[kk + k1]]] % 12;
    n1 = t1 * t1 * dot3(grad3[gi1], x1, y1, z1);
  }

  let t2 = 0.6 - x2 * x2 - y2 * y2 - z2 * z2;
  if (t2 > 0) {
    t2 *= t2;
    const gi2 = perm[ii + i2 + perm[jj + j2 + perm[kk + k2]]] % 12;
    n2 = t2 * t2 * dot3(grad3[gi2], x2, y2, z2);
  }

  let t3 = 0.6 - x3 * x3 - y3 * y3 - z3 * z3;
  if (t3 > 0) {
    t3 *= t3;
    const gi3 = perm[ii + 1 + perm[jj + 1 + perm[kk + 1]]] % 12;
    n3 = t3 * t3 * dot3(grad3[gi3], x3, y3, z3);
  }

  // Scale to [-1, 1]
  return 32.0 * (n0 + n1 + n2 + n3);
}

/**
 * Fractal Brownian Motion — layers multiple octaves of simplex noise.
 *
 * MATH: fBm(p) = Σ amplitude^i * noise(frequency^i * p)
 * Each octave doubles frequency (lacunarity=2) and halves amplitude (gain=0.5).
 */
export function fbm3(
  x: number,
  y: number,
  z: number,
  octaves: number = 4,
  lacunarity: number = 2.0,
  gain: number = 0.5
): number {
  let value = 0;
  let amplitude = 1.0;
  let frequency = 1.0;

  for (let i = 0; i < octaves; i++) {
    value += amplitude * simplex3(x * frequency, y * frequency, z * frequency);
    frequency *= lacunarity;
    amplitude *= gain;
  }
  return value;
}
