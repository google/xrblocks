import * as THREE from 'three';
import { SCENE_SCATTER_STYLES, MAX_LANDSCAPE_SIZE, MAX_SCATTER_HEIGHT, MAX_SCATTER_COUNT, MAX_SCATTER_SEED, MIN_PATH_POINTS, MAX_PATH_POINTS, MAX_PATH_WIDTH, MAX_SCENE_DISTANCE, MAX_BANK_WIDTH, MIN_PATH_SEGMENT } from './SceneTypes.js';

/** Fixed, modest tessellation; a recipe never chooses its own mesh detail. */
const WATER_SEGMENTS = 48;
const WATER_RINGS = 6;
const BED_SEGMENTS = 32;
const BANK_SEGMENTS = 56;
const BLOB_DETAIL = 1;
const COLUMN_SEGMENTS = 7;
const BLADE_SEGMENTS = 5;
const PATH_SAMPLES_PER_SEGMENT = 8;
/** Only collapses numerically coincident samples, never authored corners. */
const MIN_SAMPLE_SPACING = 1e-4;
/**
 * An exactly authored gap such as -10 to -9.98 measures a few ULPs short of
 * 0.02. This guard is deliberately looser than the parser's round-off
 * tolerance so it never rejects a recipe the parser accepted.
 */
const SEGMENT_EPSILON = 1e-9;
/** Everything rests on the flat ground at Y=0; nothing is excavated. */
const POND_BED_Y = 0.004;
const POND_LIP_Y = 0.012;
const POND_WATER_Y = 0.028;
const RIPPLE_AMPLITUDE = 0.006;
const RIPPLE_RINGS = 2.5;
const PATH_SHOULDER_Y = 0.004;
const PATH_SURFACE_Y = 0.016;
/** Bank profile offsets as a fraction of the authored bank width. */
const BANK_SHALLOWS = 0.12;
const BANK_CREST_OFFSET = 0.48;
const BANK_CREST_RISE = 0.2;
const RIM_STONE_MIN_OFFSET = 0.2;
const RIM_STONE_MAX_OFFSET = 0.7;
const RIM_STONE_MIN_SIZE = 0.35;
const RIM_STONE_MAX_SIZE = 0.85;
const RIM_STONE_FLATTEN = 0.65;
const RIM_STONE_TILT = 0.22;
const MIN_RIM_STONES = 10;
const MAX_RIM_STONES = 64;
/** Stone centers per meter of shoreline, before clamping. */
const RIM_STONE_DENSITY = 0.9;
/** Relative depth of the organic relief on a lo-poly blob. */
const BLOB_RELIEF = 0.34;
const SPECKLE = 0.22;
const WATER_ROUGHNESS = 0.08;
const STONE_ROUGHNESS = 0.92;
const FOLIAGE_ROUGHNESS = 0.88;
const BANK_STONE_COLOR = '#9c968b';
const POND_BED_COLOR = '#2b332e';
const PATH_SHOULDER_COLOR = '#5d5546';
const TRUNK_COLOR = '#6a4a34';
const STEM_COLOR = '#4f7a3a';
const UP = new THREE.Vector3(0, 1, 0);
const UNIT_SCALE = new THREE.Vector3(1, 1, 1);
/** Independent random channels, so one refined field never reshuffles others. */
const CHANNEL_X = 0;
const CHANNEL_Z = 1;
const CHANNEL_HEIGHT = 2;
const CHANNEL_YAW = 3;
const CHANNEL_LEAN = 4;
const CHANNEL_LEAN_AXIS = 5;
const CHANNEL_TONE = 6;
const CHANNEL_PART = 8;
const CHANNEL_PART_STRIDE = 4;
/** A fixed sequence for features whose recipe carries no seed. */
const RIM_STONE_SEED = 0x5eed;
const SPECKLE_SEED = 0x9a71;
/** Whatever a build has allocated so far, disposed together on failure. */
function track(owned, resource) {
    owned.push(resource);
    return resource;
}
/**
 * A stable value in `[0, 1)` for one seed, specimen index, and channel. It is
 * pure integer mixing, so a rebuilt feature is identical in any session.
 */
function hashUnit(seed, index, channel) {
    let value = (seed | 0) ^
        Math.imul(index + 1, 0x27d4eb2d) ^
        Math.imul(channel + 1, 0x9e3779b1);
    value = Math.imul(value ^ (value >>> 15), 0x2c1b3c6d);
    value ^= value >>> 12;
    value = Math.imul(value ^ (value >>> 13), 0x297a2d39);
    value ^= value >>> 16;
    return (value >>> 0) / 4294967296;
}
function assertFinite(values, message) {
    for (const value of values) {
        if (typeof value !== 'number' || !Number.isFinite(value)) {
            throw new Error(message);
        }
    }
}
function readVector2(value, message) {
    if (!Array.isArray(value) || value.length !== 2)
        throw new Error(message);
    assertFinite(value, message);
    return [value[0], value[1]];
}
function assertPond(definition) {
    const [width, depth] = readVector2(definition.size, 'A pond needs a finite water width and depth.');
    assertFinite([definition.bankWidth], 'A pond needs a finite bank width.');
    if (width <= 0 ||
        depth <= 0 ||
        width > MAX_LANDSCAPE_SIZE ||
        depth > MAX_LANDSCAPE_SIZE) {
        throw new Error(`A pond needs a water size up to ${MAX_LANDSCAPE_SIZE} meters.`);
    }
    if (definition.bankWidth <= 0 || definition.bankWidth > MAX_BANK_WIDTH) {
        throw new Error(`A pond bank must be wider than 0 and at most ${MAX_BANK_WIDTH} meters.`);
    }
}
function assertPath(definition) {
    const points = definition.points;
    if (!Array.isArray(points) ||
        points.length < MIN_PATH_POINTS ||
        points.length > MAX_PATH_POINTS) {
        throw new Error(`A path needs ${MIN_PATH_POINTS} to ${MAX_PATH_POINTS} points.`);
    }
    assertFinite([definition.width], 'A path needs a finite width.');
    if (definition.width <= 0 || definition.width > MAX_PATH_WIDTH) {
        throw new Error(`A path must be wider than 0 and at most ${MAX_PATH_WIDTH} meters.`);
    }
    let previous;
    for (const point of points) {
        const [x, z] = readVector2(point, 'A path needs finite X/Z points.');
        if (Math.abs(x) > MAX_SCENE_DISTANCE || Math.abs(z) > MAX_SCENE_DISTANCE) {
            throw new Error(`A path stays within ${MAX_SCENE_DISTANCE} meters of its origin.`);
        }
        if (previous &&
            Math.hypot(x - previous[0], z - previous[1]) <
                MIN_PATH_SEGMENT - SEGMENT_EPSILON) {
            throw new Error(`A path needs adjacent points at least ${MIN_PATH_SEGMENT} meters apart.`);
        }
        previous = [x, z];
    }
}
function assertScatter(definition) {
    if (!SCENE_SCATTER_STYLES.includes(definition.style)) {
        throw new Error(`Unsupported scatter style "${definition.style}".`);
    }
    const [width, depth] = readVector2(definition.size, 'A scatter needs a finite planting width and depth.');
    assertFinite([definition.height], 'A scatter needs a finite height.');
    if (width <= 0 ||
        depth <= 0 ||
        width > MAX_LANDSCAPE_SIZE ||
        depth > MAX_LANDSCAPE_SIZE) {
        throw new Error(`A scatter needs a planting area up to ${MAX_LANDSCAPE_SIZE} meters.`);
    }
    if (definition.height <= 0 || definition.height > MAX_SCATTER_HEIGHT) {
        throw new Error(`A scatter specimen must be taller than 0 and at most ${MAX_SCATTER_HEIGHT} meters.`);
    }
    if (!Number.isInteger(definition.count) ||
        definition.count < 1 ||
        definition.count > MAX_SCATTER_COUNT) {
        throw new Error(`A scatter needs a whole count from 1 to ${MAX_SCATTER_COUNT}.`);
    }
    if (!Number.isInteger(definition.seed) ||
        definition.seed < 0 ||
        definition.seed > MAX_SCATTER_SEED) {
        throw new Error(`A scatter needs a whole seed from 0 to ${MAX_SCATTER_SEED}.`);
    }
}
/** Validates one recipe before it is measured or built. */
function assertLandscape(definition) {
    if (!definition || typeof definition !== 'object') {
        throw new Error('A landscape feature needs a recipe.');
    }
    switch (definition.kind) {
        case 'pond':
            return assertPond(definition);
        case 'path':
            return assertPath(definition);
        case 'scatter':
            return assertScatter(definition);
        default:
            throw new Error(`Unsupported landscape kind "${definition.kind}".`);
    }
}
function clampColor(color) {
    return color.setRGB(THREE.MathUtils.clamp(color.r, 0, 1), THREE.MathUtils.clamp(color.g, 0, 1), THREE.MathUtils.clamp(color.b, 0, 1));
}
/** Blends the object's primary color toward a fixed natural tone. */
function blend(base, toward, amount, shade = 1) {
    return clampColor(base.clone().lerp(new THREE.Color(toward), amount).multiplyScalar(shade));
}
/**
 * A lo-poly organic lump inscribed in a sphere of radius 0.5. Relief is a
 * continuous function of the undisplaced position, so the duplicated vertices
 * of a non-indexed icosahedron stay welded, and the result is renormalized so
 * an instance scale is also the instance's exact extent.
 */
function createBlobGeometry(owned, variant) {
    const geometry = track(owned, new THREE.IcosahedronGeometry(0.5, BLOB_DETAIL));
    const position = geometry.getAttribute('position');
    const point = new THREE.Vector3();
    let longest = 0;
    for (let index = 0; index < position.count; index++) {
        point.fromBufferAttribute(position, index);
        const relief = 1 +
            BLOB_RELIEF *
                Math.sin(point.x * 9.7 + variant * 1.3) *
                Math.sin(point.y * 8.3 + variant * 2.1) *
                Math.sin(point.z * 7.1 + variant * 3.7);
        point.multiplyScalar(relief);
        longest = Math.max(longest, point.length());
        position.setXYZ(index, point.x, point.y, point.z);
    }
    if (!(longest > 0)) {
        throw new Error('A landscape blob collapsed to a point.');
    }
    geometry.scale(0.5 / longest, 0.5 / longest, 0.5 / longest);
    geometry.computeVertexNormals();
    return geometry;
}
/** The outward unit normal of an ellipse at one parameter angle. */
function ellipseNormal(radiusX, radiusZ, angle, target) {
    return target
        .set(Math.cos(angle) / radiusX, Math.sin(angle) / radiusZ)
        .normalize();
}
/** Adds a deterministic per-vertex speckle so gravel and stone read as loose. */
function speckle(count, tone) {
    const colors = new Float32Array(count * 3);
    for (let index = 0; index < count; index++) {
        const shade = tone(index) *
            (1 + SPECKLE * (hashUnit(SPECKLE_SEED, index, CHANNEL_TONE) - 0.5));
        colors[index * 3] = shade;
        colors[index * 3 + 1] = shade;
        colors[index * 3 + 2] = shade;
    }
    return new THREE.BufferAttribute(colors, 3);
}
// -------------------------------------------------------------------------
// Pond
// -------------------------------------------------------------------------
/** How far the bank tucks under the water so no seam or ground shows. */
function bankOverlap(radiusX, radiusZ) {
    return Math.min(0.05, 0.2 * Math.min(radiusX, radiusZ));
}
/** The bank cross-section, from submerged shallows out to flat ground. */
function bankProfile(bankWidth, overlap) {
    return [
        { offset: -overlap, y: POND_LIP_Y - 0.006, tone: 0.62 },
        { offset: BANK_SHALLOWS * bankWidth, y: POND_LIP_Y, tone: 0.74 },
        {
            offset: BANK_CREST_OFFSET * bankWidth,
            y: POND_WATER_Y + BANK_CREST_RISE * bankWidth,
            tone: 1,
        },
        { offset: bankWidth, y: 0, tone: 0.88 },
    ];
}
function rimStoneCount(radiusX, radiusZ) {
    const perimeter = Math.PI * 2 * Math.sqrt((radiusX * radiusX + radiusZ * radiusZ) / 2);
    return THREE.MathUtils.clamp(Math.round(perimeter * RIM_STONE_DENSITY), MIN_RIM_STONES, MAX_RIM_STONES);
}
/** Half the vertical and horizontal extent of a rim stone once it is tilted. */
function rimStoneHalfExtent(size, tilt) {
    const halfHeight = (size * RIM_STONE_FLATTEN) / 2;
    const halfWidth = size / 2;
    return {
        up: halfHeight * Math.cos(tilt) + halfWidth * Math.sin(tilt),
        out: halfWidth * Math.cos(tilt) + halfHeight * Math.sin(tilt),
    };
}
/** How far the largest rim stone reaches past the water edge, and how high. */
function rimStoneExtent(bankWidth) {
    const half = rimStoneHalfExtent(RIM_STONE_MAX_SIZE * bankWidth, RIM_STONE_TILT);
    return {
        reach: RIM_STONE_MAX_OFFSET * bankWidth + half.out,
        top: half.up * 2,
    };
}
function getPondBounds(definition) {
    const [width, depth] = definition.size;
    const stones = rimStoneExtent(definition.bankWidth);
    const reach = Math.max(definition.bankWidth, stones.reach);
    const top = Math.max(POND_WATER_Y + RIPPLE_AMPLITUDE, POND_WATER_Y + BANK_CREST_RISE * definition.bankWidth, stones.top);
    return new THREE.Box3(new THREE.Vector3(-width / 2 - reach, 0, -depth / 2 - reach), new THREE.Vector3(width / 2 + reach, top, depth / 2 + reach));
}
/** Concentric static ripples, faded out at the center so it stays flat. */
function createWaterGeometry(owned, radiusX, radiusZ) {
    const geometry = track(owned, new THREE.BufferGeometry());
    const positions = new Float32Array((WATER_RINGS + 1) * WATER_SEGMENTS * 3);
    const indices = [];
    for (let ring = 0; ring <= WATER_RINGS; ring++) {
        const radius = ring / WATER_RINGS;
        for (let step = 0; step < WATER_SEGMENTS; step++) {
            const angle = (step / WATER_SEGMENTS) * Math.PI * 2;
            const vertex = ring * WATER_SEGMENTS + step;
            positions[vertex * 3] = radiusX * radius * Math.cos(angle);
            positions[vertex * 3 + 1] =
                POND_WATER_Y +
                    RIPPLE_AMPLITUDE *
                        radius *
                        Math.sin(radius * RIPPLE_RINGS * Math.PI * 2 + Math.sin(angle * 3));
            positions[vertex * 3 + 2] = radiusZ * radius * Math.sin(angle);
        }
    }
    for (let ring = 0; ring < WATER_RINGS; ring++) {
        for (let step = 0; step < WATER_SEGMENTS; step++) {
            const next = (step + 1) % WATER_SEGMENTS;
            const inner = ring * WATER_SEGMENTS;
            const outer = (ring + 1) * WATER_SEGMENTS;
            indices.push(inner + step, inner + next, outer + step);
            indices.push(inner + next, outer + next, outer + step);
        }
    }
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setIndex(indices);
    geometry.computeVertexNormals();
    return geometry;
}
/** A closed ring of quads swept along the bank cross-section. */
function createBankGeometry(owned, radiusX, radiusZ, bankWidth) {
    const geometry = track(owned, new THREE.BufferGeometry());
    const rings = bankProfile(bankWidth, bankOverlap(radiusX, radiusZ));
    const positions = new Float32Array(rings.length * BANK_SEGMENTS * 3);
    const indices = [];
    const normal = new THREE.Vector2();
    for (const [ringIndex, ring] of rings.entries()) {
        for (let step = 0; step < BANK_SEGMENTS; step++) {
            const angle = (step / BANK_SEGMENTS) * Math.PI * 2;
            ellipseNormal(radiusX, radiusZ, angle, normal);
            const vertex = ringIndex * BANK_SEGMENTS + step;
            positions[vertex * 3] =
                radiusX * Math.cos(angle) + normal.x * ring.offset;
            positions[vertex * 3 + 1] = ring.y;
            positions[vertex * 3 + 2] =
                radiusZ * Math.sin(angle) + normal.y * ring.offset;
        }
    }
    for (let ringIndex = 0; ringIndex < rings.length - 1; ringIndex++) {
        for (let step = 0; step < BANK_SEGMENTS; step++) {
            const next = (step + 1) % BANK_SEGMENTS;
            const inner = ringIndex * BANK_SEGMENTS;
            const outer = (ringIndex + 1) * BANK_SEGMENTS;
            indices.push(inner + step, inner + next, outer + step);
            indices.push(inner + next, outer + next, outer + step);
        }
    }
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setIndex(indices);
    geometry.setAttribute('color', speckle(rings.length * BANK_SEGMENTS, (index) => Math.min(1, rings[Math.floor(index / BANK_SEGMENTS)].tone)));
    geometry.computeVertexNormals();
    return geometry;
}
function buildPond(root, definition, primary, owned) {
    const radiusX = definition.size[0] / 2;
    const radiusZ = definition.size[1] / 2;
    const bankWidth = definition.bankWidth;
    const bed = new THREE.Mesh(track(owned, new THREE.CircleGeometry(0.5, BED_SEGMENTS)
        .rotateX(-Math.PI / 2)
        .scale(definition.size[0], 1, definition.size[1])
        .translate(0, POND_BED_Y, 0)), track(owned, new THREE.MeshStandardMaterial({
        color: blend(primary, POND_BED_COLOR, 0.72, 0.7),
        roughness: STONE_ROUGHNESS,
        metalness: 0,
    })));
    bed.name = 'pond-bed';
    bed.receiveShadow = true;
    root.add(bed);
    const water = new THREE.Mesh(createWaterGeometry(owned, radiusX, radiusZ), track(owned, new THREE.MeshPhysicalMaterial({
        color: primary.clone(),
        roughness: WATER_ROUGHNESS,
        metalness: 0,
        clearcoat: 1,
        clearcoatRoughness: 0.12,
        transparent: true,
        opacity: 0.84,
    })));
    water.name = 'pond-water';
    water.receiveShadow = true;
    root.add(water);
    const bank = new THREE.Mesh(createBankGeometry(owned, radiusX, radiusZ, bankWidth), track(owned, new THREE.MeshStandardMaterial({
        color: blend(primary, BANK_STONE_COLOR, 0.85),
        roughness: STONE_ROUGHNESS,
        metalness: 0,
        vertexColors: true,
    })));
    bank.name = 'pond-bank';
    bank.receiveShadow = true;
    root.add(bank);
    const count = rimStoneCount(radiusX, radiusZ);
    const stones = track(owned, new THREE.InstancedMesh(createBlobGeometry(owned, 1.7), track(owned, new THREE.MeshStandardMaterial({
        color: blend(primary, BANK_STONE_COLOR, 0.9, 0.9),
        roughness: STONE_ROUGHNESS,
        metalness: 0,
        flatShading: true,
    })), count));
    stones.name = 'pond-stones';
    stones.castShadow = true;
    stones.receiveShadow = true;
    const matrix = new THREE.Matrix4();
    const position = new THREE.Vector3();
    const quaternion = new THREE.Quaternion();
    const scale = new THREE.Vector3();
    const axis = new THREE.Vector3();
    const normal = new THREE.Vector2();
    const tone = new THREE.Color();
    for (let index = 0; index < count; index++) {
        const angle = ((index + hashUnit(RIM_STONE_SEED, index, CHANNEL_YAW) * 0.7) / count) *
            Math.PI *
            2;
        const offset = bankWidth *
            (RIM_STONE_MIN_OFFSET +
                (RIM_STONE_MAX_OFFSET - RIM_STONE_MIN_OFFSET) *
                    hashUnit(RIM_STONE_SEED, index, CHANNEL_X));
        const size = bankWidth *
            (RIM_STONE_MIN_SIZE +
                (RIM_STONE_MAX_SIZE - RIM_STONE_MIN_SIZE) *
                    hashUnit(RIM_STONE_SEED, index, CHANNEL_HEIGHT));
        const tilt = RIM_STONE_TILT * hashUnit(RIM_STONE_SEED, index, CHANNEL_LEAN);
        const lean = hashUnit(RIM_STONE_SEED, index, CHANNEL_LEAN_AXIS) * Math.PI * 2;
        ellipseNormal(radiusX, radiusZ, angle, normal);
        // A blob is centered on its own origin, so lift it until its lowest
        // tilted point just touches the ground and the berm hides its base.
        position.set(radiusX * Math.cos(angle) + normal.x * offset, rimStoneHalfExtent(size, tilt).up, radiusZ * Math.sin(angle) + normal.y * offset);
        quaternion
            .setFromAxisAngle(axis.set(Math.sin(lean), 0, -Math.cos(lean)), tilt)
            .multiply(new THREE.Quaternion().setFromAxisAngle(UP, hashUnit(RIM_STONE_SEED, index, CHANNEL_Z) * Math.PI * 2));
        scale.set(size, size * RIM_STONE_FLATTEN, size);
        matrix.compose(position, quaternion, scale);
        stones.setMatrixAt(index, matrix);
        const shade = 0.82 + 0.36 * hashUnit(RIM_STONE_SEED, index, CHANNEL_TONE);
        stones.setColorAt(index, tone.setRGB(shade, shade, shade));
    }
    stones.instanceMatrix.needsUpdate = true;
    if (stones.instanceColor)
        stones.instanceColor.needsUpdate = true;
    stones.computeBoundingSphere();
    root.add(stones);
}
function pathShoulderWidth(width) {
    return THREE.MathUtils.clamp(width * 0.18, 0.05, 0.25);
}
/**
 * Samples the walkway center line once, at a fixed bounded rate, so bounds and
 * geometry always agree about its curves, joins, and shoulder.
 */
function samplePathStrip(definition) {
    const curve = new THREE.CatmullRomCurve3(definition.points.map(([x, z]) => new THREE.Vector3(x, 0, z)), false, 'centripetal');
    const divisions = (definition.points.length - 1) * PATH_SAMPLES_PER_SEGMENT;
    const center = [];
    for (const point of curve.getPoints(divisions)) {
        if (!Number.isFinite(point.x) || !Number.isFinite(point.z)) {
            throw new Error('A path center line produced a non-finite sample.');
        }
        const sample = new THREE.Vector2(point.x, point.z);
        const previous = center[center.length - 1];
        if (previous && previous.distanceTo(sample) < MIN_SAMPLE_SPACING)
            continue;
        center.push(sample);
    }
    if (center.length < 2) {
        throw new Error('A path needs a measurable center line.');
    }
    const normal = [];
    const tangent = new THREE.Vector2();
    for (let index = 0; index < center.length; index++) {
        const back = center[Math.max(0, index - 1)];
        const ahead = center[Math.min(center.length - 1, index + 1)];
        tangent.subVectors(ahead, back);
        if (tangent.lengthSq() <= 0) {
            normal.push(normal[index - 1].clone());
            continue;
        }
        tangent.normalize();
        normal.push(new THREE.Vector2(-tangent.y, tangent.x));
    }
    return { center, normal };
}
/**
 * Both edges of a strip, optionally run past its ends. Bounds and geometry
 * share this, so a shoulder never escapes the measured footprint.
 */
function stripEdges(strip, halfWidth, extend) {
    const center = [...strip.center];
    const normal = [...strip.normal];
    if (extend > 0) {
        const head = normal[0];
        const tail = normal[normal.length - 1];
        center.unshift(new THREE.Vector2(center[0].x - head.y * extend, center[0].y + head.x * extend));
        normal.unshift(head.clone());
        const last = center[center.length - 1];
        center.push(new THREE.Vector2(last.x + tail.y * extend, last.y - tail.x * extend));
        normal.push(tail.clone());
    }
    const left = [];
    const right = [];
    for (let index = 0; index < center.length; index++) {
        const offset = normal[index].clone().multiplyScalar(halfWidth);
        left.push(center[index].clone().add(offset));
        right.push(center[index].clone().sub(offset));
    }
    return { left, right };
}
function createStripGeometry(owned, strip, halfWidth, extend, y) {
    const { left, right } = stripEdges(strip, halfWidth, extend);
    const geometry = track(owned, new THREE.BufferGeometry());
    const positions = new Float32Array(left.length * 6);
    const normals = new Float32Array(left.length * 6);
    const indices = [];
    for (let index = 0; index < left.length; index++) {
        positions[index * 6] = left[index].x;
        positions[index * 6 + 1] = y;
        positions[index * 6 + 2] = left[index].y;
        positions[index * 6 + 3] = right[index].x;
        positions[index * 6 + 4] = y;
        positions[index * 6 + 5] = right[index].y;
        normals[index * 6 + 1] = 1;
        normals[index * 6 + 4] = 1;
        if (index === left.length - 1)
            continue;
        const base = index * 2;
        indices.push(base, base + 2, base + 1);
        indices.push(base + 1, base + 2, base + 3);
    }
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute('normal', new THREE.BufferAttribute(normals, 3));
    geometry.setIndex(indices);
    geometry.setAttribute('color', speckle(left.length * 2, () => 1));
    return geometry;
}
function getPathBounds(definition) {
    const strip = samplePathStrip(definition);
    const shoulder = pathShoulderWidth(definition.width);
    const { left, right } = stripEdges(strip, definition.width / 2 + shoulder, shoulder);
    const bounds = new THREE.Box3();
    const point = new THREE.Vector3();
    for (const edge of [left, right]) {
        for (const corner of edge) {
            bounds.expandByPoint(point.set(corner.x, 0, corner.y));
            bounds.expandByPoint(point.set(corner.x, PATH_SURFACE_Y, corner.y));
        }
    }
    return bounds;
}
function buildPath(root, definition, primary, owned) {
    const strip = samplePathStrip(definition);
    const shoulder = pathShoulderWidth(definition.width);
    const border = new THREE.Mesh(createStripGeometry(owned, strip, definition.width / 2 + shoulder, shoulder, PATH_SHOULDER_Y), track(owned, new THREE.MeshStandardMaterial({
        color: blend(primary, PATH_SHOULDER_COLOR, 0.7, 0.75),
        roughness: STONE_ROUGHNESS,
        metalness: 0,
        vertexColors: true,
    })));
    border.name = 'path-shoulder';
    border.receiveShadow = true;
    root.add(border);
    const surface = new THREE.Mesh(createStripGeometry(owned, strip, definition.width / 2, 0, PATH_SURFACE_Y), track(owned, new THREE.MeshStandardMaterial({
        color: primary.clone(),
        roughness: STONE_ROUGHNESS,
        metalness: 0,
        vertexColors: true,
    })));
    surface.name = 'path-surface';
    surface.receiveShadow = true;
    root.add(surface);
}
/**
 * Every style is a small stack of instanced components, so a grove reads as
 * trunks with layered canopies rather than one cone per specimen.
 */
const SCATTER_PROFILES = {
    tree: {
        lean: 0.08,
        minHeight: 0.7,
        parts: [
            {
                name: 'trunk',
                shape: 'column',
                palette: 'wood',
                center: 0.26,
                halfHeight: 0.26,
                radius: 0.045,
                jitter: 0,
            },
            {
                name: 'canopy-0',
                shape: 'blob',
                palette: 'primary',
                center: 0.55,
                halfHeight: 0.2,
                radius: 0.3,
                jitter: 0.05,
                spread: 0.12,
                shade: 0.82,
            },
            {
                name: 'canopy-1',
                shape: 'blob',
                palette: 'primary',
                center: 0.71,
                halfHeight: 0.18,
                radius: 0.26,
                jitter: 0.05,
                spread: 0.12,
            },
            {
                name: 'canopy-2',
                shape: 'blob',
                palette: 'primary',
                center: 0.85,
                halfHeight: 0.15,
                radius: 0.19,
                jitter: 0.04,
                spread: 0.12,
                shade: 1.12,
            },
        ],
    },
    shrub: {
        lean: 0.1,
        minHeight: 0.65,
        parts: [
            {
                name: 'mound-0',
                shape: 'blob',
                palette: 'primary',
                center: 0.4,
                halfHeight: 0.4,
                radius: 0.44,
                jitter: 0.08,
                shade: 0.85,
            },
            {
                name: 'mound-1',
                shape: 'blob',
                palette: 'primary',
                center: 0.62,
                halfHeight: 0.38,
                radius: 0.34,
                jitter: 0.12,
                shade: 1.08,
            },
            {
                name: 'mound-2',
                shape: 'blob',
                palette: 'primary',
                center: 0.34,
                halfHeight: 0.3,
                radius: 0.3,
                jitter: 0.2,
            },
        ],
    },
    rock: {
        lean: 0.14,
        minHeight: 0.55,
        parts: [
            {
                name: 'boulder',
                shape: 'blob',
                palette: 'primary',
                center: 0.5,
                halfHeight: 0.5,
                radius: 0.62,
                jitter: 0.04,
                flat: true,
            },
            {
                name: 'cobble',
                shape: 'blob',
                palette: 'primary',
                center: 0.2,
                halfHeight: 0.2,
                radius: 0.3,
                jitter: 0.5,
                shade: 0.86,
                flat: true,
            },
        ],
    },
    grass: {
        lean: 0.18,
        minHeight: 0.5,
        parts: [
            {
                name: 'blade-0',
                shape: 'blade',
                palette: 'primary',
                center: 0.5,
                halfHeight: 0.5,
                radius: 0.1,
                jitter: 0.06,
                spread: 0.14,
            },
            {
                name: 'blade-1',
                shape: 'blade',
                palette: 'primary',
                center: 0.42,
                halfHeight: 0.42,
                radius: 0.09,
                jitter: 0.1,
                spread: 0.26,
                shade: 0.85,
            },
            {
                name: 'blade-2',
                shape: 'blade',
                palette: 'primary',
                center: 0.36,
                halfHeight: 0.36,
                radius: 0.08,
                jitter: 0.13,
                spread: 0.34,
                shade: 1.1,
            },
        ],
    },
    flower: {
        lean: 0.12,
        minHeight: 0.6,
        parts: [
            {
                name: 'stem',
                shape: 'column',
                palette: 'stem',
                center: 0.38,
                halfHeight: 0.38,
                radius: 0.018,
                jitter: 0.02,
            },
            {
                name: 'leaf',
                shape: 'blob',
                palette: 'stem',
                center: 0.32,
                halfHeight: 0.04,
                radius: 0.13,
                jitter: 0.08,
                spread: 0.3,
                shade: 1.12,
            },
            {
                name: 'bloom',
                shape: 'blob',
                palette: 'primary',
                center: 0.86,
                halfHeight: 0.14,
                radius: 0.17,
                jitter: 0.03,
            },
        ],
    },
};
/** The component envelope after its own spread and the specimen's lean. */
function scatterPartExtent(profile, part) {
    const spread = part.spread ?? 0;
    const halfHeight = part.halfHeight * Math.cos(spread) + part.radius * Math.sin(spread);
    const radius = part.radius * Math.cos(spread) + part.halfHeight * Math.sin(spread);
    const localTop = part.center + halfHeight;
    const localBottom = part.center - halfHeight;
    const localRadius = part.jitter + radius;
    const lean = Math.sin(profile.lean);
    const upright = Math.cos(profile.lean);
    return {
        top: localTop * upright + localRadius * lean,
        bottom: Math.min(localBottom, localBottom * upright) - localRadius * lean,
        radius: localRadius * upright +
            Math.max(Math.abs(localTop), Math.abs(localBottom)) * lean,
    };
}
function getScatterBounds(definition) {
    const profile = SCATTER_PROFILES[definition.style];
    let top = 0;
    let bottom = 0;
    let radius = 0;
    for (const part of profile.parts) {
        const extent = scatterPartExtent(profile, part);
        top = Math.max(top, extent.top);
        bottom = Math.min(bottom, extent.bottom);
        radius = Math.max(radius, extent.radius);
    }
    const height = definition.height;
    const overhang = radius * height;
    return new THREE.Box3(new THREE.Vector3(-definition.size[0] / 2 - overhang, bottom * height, -definition.size[1] / 2 - overhang), new THREE.Vector3(definition.size[0] / 2 + overhang, top * height, definition.size[1] / 2 + overhang));
}
function createScatterGeometry(owned, part, variant) {
    switch (part.shape) {
        case 'blob':
            return createBlobGeometry(owned, variant);
        case 'column':
            return track(owned, new THREE.CylinderGeometry(0.32, 0.5, 1, COLUMN_SEGMENTS));
        case 'blade':
            return track(owned, new THREE.ConeGeometry(0.5, 1, BLADE_SEGMENTS));
        default:
            throw new Error(`Unsupported scatter component "${part.shape}".`);
    }
}
function scatterPartColor(part, primary) {
    const shade = part.shade ?? 1;
    switch (part.palette) {
        case 'wood':
            return clampColor(new THREE.Color(TRUNK_COLOR).multiplyScalar(shade));
        case 'stem':
            return clampColor(new THREE.Color(STEM_COLOR).multiplyScalar(shade));
        default:
            return clampColor(primary.clone().multiplyScalar(shade));
    }
}
function buildScatter(root, definition, primary, owned) {
    const profile = SCATTER_PROFILES[definition.style];
    const { count, seed, height, style } = definition;
    const [areaWidth, areaDepth] = definition.size;
    const position = new THREE.Vector3();
    const quaternion = new THREE.Quaternion();
    const spin = new THREE.Quaternion();
    const axis = new THREE.Vector3();
    const scale = new THREE.Vector3();
    const local = new THREE.Matrix4();
    const instance = new THREE.Matrix4();
    const tone = new THREE.Color();
    const specimens = [];
    for (let index = 0; index < count; index++) {
        const lean = profile.lean * hashUnit(seed, index, CHANNEL_LEAN) ** 2;
        const leanAxis = hashUnit(seed, index, CHANNEL_LEAN_AXIS) * Math.PI * 2;
        position.set((hashUnit(seed, index, CHANNEL_X) - 0.5) * areaWidth, 0, (hashUnit(seed, index, CHANNEL_Z) - 0.5) * areaDepth);
        quaternion
            .setFromAxisAngle(axis.set(Math.sin(leanAxis), 0, -Math.cos(leanAxis)), lean)
            .multiply(spin.setFromAxisAngle(UP, hashUnit(seed, index, CHANNEL_YAW) * Math.PI * 2));
        specimens.push({
            matrix: new THREE.Matrix4().compose(position, quaternion, UNIT_SCALE),
            height: height *
                (profile.minHeight +
                    (1 - profile.minHeight) * hashUnit(seed, index, CHANNEL_HEIGHT)),
        });
    }
    for (const [partIndex, part] of profile.parts.entries()) {
        const mesh = track(owned, new THREE.InstancedMesh(createScatterGeometry(owned, part, partIndex + 1), track(owned, new THREE.MeshStandardMaterial({
            color: scatterPartColor(part, primary),
            roughness: FOLIAGE_ROUGHNESS,
            metalness: 0,
            flatShading: part.flat === true,
        })), count));
        mesh.name = `${style}-${part.name}`;
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        const channel = CHANNEL_PART + partIndex * CHANNEL_PART_STRIDE;
        for (let index = 0; index < count; index++) {
            const specimen = specimens[index];
            const size = specimen.height;
            const jitterAngle = hashUnit(seed, index, channel) * Math.PI * 2;
            const jitter = part.jitter * size * hashUnit(seed, index, channel + 1);
            position.set(Math.cos(jitterAngle) * jitter, part.center * size, Math.sin(jitterAngle) * jitter);
            quaternion
                .setFromAxisAngle(axis.set(Math.sin(jitterAngle), 0, -Math.cos(jitterAngle)), part.spread ?? 0)
                .multiply(spin.setFromAxisAngle(UP, hashUnit(seed, index, channel + 2) * Math.PI * 2));
            scale.set(part.radius * 2 * size, part.halfHeight * 2 * size, part.radius * 2 * size);
            local.compose(position, quaternion, scale);
            mesh.setMatrixAt(index, instance.multiplyMatrices(specimen.matrix, local));
            const shade = 0.86 + 0.28 * hashUnit(seed, index, channel + 3);
            mesh.setColorAt(index, tone.setRGB(shade, shade, shade));
        }
        mesh.instanceMatrix.needsUpdate = true;
        if (mesh.instanceColor)
            mesh.instanceColor.needsUpdate = true;
        mesh.computeBoundingSphere();
        root.add(mesh);
    }
}
// -------------------------------------------------------------------------
// Public surface
// -------------------------------------------------------------------------
/**
 * Measures a landscape recipe without building it, so a feature can be sized,
 * placed, and fitted before any GPU resource exists. The box is conservative:
 * it covers the pond's bank and rim stones, the walkway's sampled curves,
 * joins, and shoulder, and the full overhang of scattered foliage beyond its
 * planting area.
 *
 * @param definition - One landscape recipe.
 * @returns A finite box in the feature's authored coordinates. A feature is
 *     never recentered, grounded, or rescaled by measuring it. It allocates no
 *     renderable geometry or materials.
 */
function getLandscapeBounds(definition) {
    assertLandscape(definition);
    let bounds;
    switch (definition.kind) {
        case 'pond':
            bounds = getPondBounds(definition);
            break;
        case 'path':
            bounds = getPathBounds(definition);
            break;
        case 'scatter':
            bounds = getScatterBounds(definition);
            break;
        default:
            throw new Error(`Unsupported landscape kind "${definition.kind}".`);
    }
    if (bounds.isEmpty() ||
        [...bounds.min.toArray(), ...bounds.max.toArray()].some((coordinate) => !Number.isFinite(coordinate))) {
        throw new Error('A landscape recipe produced no finite bounds.');
    }
    return bounds;
}
/**
 * Builds one landscape feature as a single detached group, so a pond, walkway,
 * or whole grove stays one selectable and disposable object. Every geometry
 * and material is freshly owned by this result: nothing is cached, shared
 * between builds, or downloaded. Scattered specimens are instanced from a
 * deterministic per-index sequence, so raising the count keeps the specimens
 * already placed and changing the height keeps their X/Z positions.
 *
 * @param definition - One landscape recipe, which is never modified.
 * @param color - The feature's primary water, walkway, foliage, or stone
 *     color. Trunks and stems keep their own natural tones.
 * @returns A new group whose bases rest at Y=0 in the authored coordinates.
 *     Failed construction disposes what it built and rethrows; the caller owns
 *     disposal of a successful result.
 */
function createLandscapeContent(definition, color) {
    assertLandscape(definition);
    const primary = new THREE.Color(color);
    const root = new THREE.Group();
    root.name = definition.kind;
    const owned = [];
    try {
        switch (definition.kind) {
            case 'pond':
                buildPond(root, definition, primary, owned);
                break;
            case 'path':
                buildPath(root, definition, primary, owned);
                break;
            case 'scatter':
                buildScatter(root, definition, primary, owned);
                break;
            default:
                throw new Error(`Unsupported landscape kind "${definition.kind}".`);
        }
    }
    catch (error) {
        for (const resource of owned)
            resource.dispose();
        root.clear();
        throw error;
    }
    return root;
}

export { createLandscapeContent, getLandscapeBounds };
