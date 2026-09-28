/**
 * Drawing on the photo surface: hold select and move the ray to draw.
 *
 * Each frame the ray's hit on the photo mesh is smoothed with a One Euro
 * filter (heavy smoothing when the hand moves slowly, little lag when it
 * moves fast; at 2 m, a hand tremor alone moves the hit by about a
 * centimeter). Points closer than `minSpacing` to the last one are skipped,
 * and a point that only continues a straight run moves the run's end instead
 * of adding a segment; when the stroke ends, Douglas-Peucker simplification
 * removes what is left over. Strokes break where the ray leaves the surface
 * or jumps (a table edge in front of a wall), so no line bridges through the
 * air. A stroke is a flat ribbon lying on the surface, lifted a little along
 * its normal; a tap without movement leaves a dot.
 */
import * as THREE from 'three';

const INK_COLOR = '#ff4081';

/** One Euro filter (Casiez et al., CHI 2012) for a 3D point. */
export class OneEuroFilter3 {
  constructor({minCutoff = 1.0, beta = 2.0, derivativeCutoff = 1.0} = {}) {
    this.minCutoff = minCutoff;
    this.beta = beta;
    this.derivativeCutoff = derivativeCutoff;
    this.reset();
  }

  reset() {
    this.value = null;
    this.derivative = new THREE.Vector3();
    this.lastTime = null;
  }

  static alpha(cutoff, dt) {
    const tau = 1 / (2 * Math.PI * cutoff);
    return 1 / (1 + tau / dt);
  }

  /** Filters `point` observed at `time` (seconds) and returns the result. */
  filter(point, time) {
    if (!this.value || this.lastTime == null || !(time > this.lastTime)) {
      this.value = point.clone();
      this.lastTime = time;
      return this.value.clone();
    }
    const dt = time - this.lastTime;
    this.lastTime = time;
    const rawDerivative = point.clone().sub(this.value).divideScalar(dt);
    this.derivative.lerp(
      rawDerivative,
      OneEuroFilter3.alpha(this.derivativeCutoff, dt)
    );
    const cutoff = this.minCutoff + this.beta * this.derivative.length();
    this.value.lerp(point, OneEuroFilter3.alpha(cutoff, dt));
    return this.value.clone();
  }
}

/** Distance from `p` to the segment `a`-`b`. */
function distanceToSegment(p, a, b) {
  const ab = b.clone().sub(a);
  const lengthSq = ab.lengthSq();
  const t =
    lengthSq > 0
      ? THREE.MathUtils.clamp(p.clone().sub(a).dot(ab) / lengthSq, 0, 1)
      : 0;
  return a.clone().addScaledVector(ab, t).distanceTo(p);
}

/**
 * Douglas-Peucker: the indices of the points to keep so that no dropped
 * point is farther than `tolerance` from the simplified polyline.
 */
export function simplifyPolyline(points, tolerance) {
  if (points.length <= 2) return points.map((_, i) => i);
  const keep = new Uint8Array(points.length);
  keep[0] = keep[points.length - 1] = 1;
  const stack = [[0, points.length - 1]];
  while (stack.length) {
    const [first, last] = stack.pop();
    let worst = -1;
    let worstDistance = tolerance;
    for (let i = first + 1; i < last; i++) {
      const d = distanceToSegment(points[i], points[first], points[last]);
      if (d > worstDistance) {
        worst = i;
        worstDistance = d;
      }
    }
    if (worst >= 0) {
      keep[worst] = 1;
      stack.push([first, worst], [worst, last]);
    }
  }
  const indices = [];
  for (let i = 0; i < points.length; i++) if (keep[i]) indices.push(i);
  return indices;
}

/**
 * Turns the ray hits of one held select into polylines: smoothing, spacing,
 * straight-run merging and breaks (see the module comment).
 */
export class StrokeBuilder {
  constructor({
    minSpacing = 0.005,
    straightTolerance = 0.002,
    maxJump = 0.1,
    filter = {},
  } = {}) {
    this.minSpacing = minSpacing;
    this.straightTolerance = straightTolerance;
    this.maxJump = maxJump;
    this.filter = new OneEuroFilter3(filter);
    /** Finished and current polylines: `{points, normals}`. */
    this.segments = [];
    this.current = null;
    this.lastRaw = null;
  }

  /** The ray missed the surface: the next hit starts a new polyline. */
  gap() {
    this.current = null;
    this.lastRaw = null;
    this.filter.reset();
  }

  /**
   * Adds a ray hit (`time` in seconds).
   * @returns Whether the current polyline changed.
   */
  add(point, normal, time) {
    if (this.lastRaw && this.lastRaw.distanceTo(point) > this.maxJump) {
      this.gap();
    }
    this.lastRaw = point.clone();
    const smoothed = this.filter.filter(point, time);
    if (!this.current) {
      this.current = {points: [smoothed], normals: [normal.clone()]};
      this.segments.push(this.current);
      return true;
    }
    const {points, normals} = this.current;
    const last = points[points.length - 1];
    if (last.distanceTo(smoothed) < this.minSpacing) return false;
    // Continuing a straight run: move its end instead of adding a point.
    if (
      points.length >= 2 &&
      distanceToSegment(last, points[points.length - 2], smoothed) <
        this.straightTolerance
    ) {
      last.copy(smoothed);
      normals[normals.length - 1].copy(normal);
      return true;
    }
    points.push(smoothed);
    normals.push(normal.clone());
    return true;
  }

  /** Simplifies every polyline (call when the select ends). */
  finish(tolerance = this.straightTolerance) {
    for (const segment of this.segments) {
      const keep = simplifyPolyline(segment.points, tolerance);
      segment.points = keep.map((i) => segment.points[i]);
      segment.normals = keep.map((i) => segment.normals[i]);
    }
    this.current = null;
    return this.segments;
  }
}

/**
 * A flat ribbon of `width` along `points`, lying on the surface given by
 * `normals` and lifted `lift` along them; a single point gives a disc.
 */
export function ribbonGeometry(points, normals, {width = 0.01, lift = 0.005}) {
  const half = width / 2;
  const n = points.length;
  const positions = [];
  const indices = [];
  const at = (i) => points[i].clone().addScaledVector(normals[i], lift);
  if (n === 1) {
    const center = at(0);
    const normal = normals[0].clone().normalize();
    const u = new THREE.Vector3(1, 0, 0);
    if (Math.abs(normal.x) > 0.9) u.set(0, 1, 0);
    u.cross(normal).normalize();
    const v = normal.clone().cross(u);
    positions.push(center.x, center.y, center.z);
    const sides = 12;
    for (let k = 0; k < sides; k++) {
      const angle = (k / sides) * Math.PI * 2;
      const p = center
        .clone()
        .addScaledVector(u, Math.cos(angle) * half)
        .addScaledVector(v, Math.sin(angle) * half);
      positions.push(p.x, p.y, p.z);
      indices.push(0, 1 + k, 1 + ((k + 1) % sides));
    }
  } else {
    const tangent = new THREE.Vector3();
    const side = new THREE.Vector3();
    for (let i = 0; i < n; i++) {
      tangent
        .copy(points[Math.min(n - 1, i + 1)])
        .sub(points[Math.max(0, i - 1)])
        .normalize();
      side.crossVectors(normals[i], tangent).normalize().multiplyScalar(half);
      const center = at(i);
      positions.push(
        center.x + side.x,
        center.y + side.y,
        center.z + side.z,
        center.x - side.x,
        center.y - side.y,
        center.z - side.z
      );
      if (i > 0) {
        const a = 2 * (i - 1);
        indices.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
      }
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    'position',
    new THREE.Float32BufferAttribute(positions, 3)
  );
  geometry.setIndex(indices);
  return geometry;
}

/** The drawn strokes, in world space. */
export class Ink extends THREE.Group {
  material = new THREE.MeshBasicMaterial({
    color: INK_COLOR,
    side: THREE.DoubleSide,
  });
  /** Active strokes: key (e.g. the controller) -> {builder, meshes}. */
  active = new Map();

  constructor({width = 0.01, lift = 0.005, filter} = {}) {
    super();
    this.width = width;
    this.lift = lift;
    this.filter = filter;
  }

  /** Number of drawn polylines (dots included). */
  get count() {
    return this.children.length;
  }

  /** Starts a stroke for `key` (one per controller). */
  begin(key) {
    this.end(key);
    this.active.set(key, {
      builder: new StrokeBuilder({filter: this.filter}),
      meshes: [],
    });
  }

  /** Feeds a ray hit (or `null` for a miss) to the stroke of `key`. */
  addHit(key, hit, time) {
    const stroke = this.active.get(key);
    if (!stroke) return;
    if (!hit) {
      stroke.builder.gap();
      return;
    }
    if (stroke.builder.add(hit.point, hit.normal, time)) this.redraw(stroke);
  }

  /** Ends the stroke of `key`, simplifying it. */
  end(key) {
    const stroke = this.active.get(key);
    if (!stroke) return;
    this.active.delete(key);
    stroke.builder.finish();
    this.redraw(stroke);
  }

  /** Rebuilds the ribbons of a stroke's polylines. */
  redraw(stroke) {
    const {segments} = stroke.builder;
    segments.forEach((segment, i) => {
      const geometry = ribbonGeometry(segment.points, segment.normals, this);
      let mesh = stroke.meshes[i];
      if (mesh) {
        mesh.geometry.dispose();
        mesh.geometry = geometry;
      } else {
        mesh = new THREE.Mesh(geometry, this.material);
        mesh.raycast = () => {};
        stroke.meshes.push(mesh);
        this.add(mesh);
      }
    });
  }

  clear() {
    this.active.clear();
    for (const mesh of [...this.children]) {
      mesh.removeFromParent();
      mesh.geometry.dispose();
    }
  }

  dispose() {
    this.clear();
    this.material.dispose();
  }
}
