import * as THREE from 'three';
import { SceneValidationError } from './SceneValidationError.js';
import { readPartMotion, motionAngleRange } from './ProceduralMotion.js';
import { MAX_PART_DEPTH } from './SceneTypes.js';

/** Fixed, modest tessellation; a design never chooses its own segment counts. */
const RADIAL_SEGMENTS = 20;
const SPHERE_SEGMENTS = 20;
const SPHERE_RINGS = 12;
const CAPSULE_RADIAL_SEGMENTS = 16;
const CAPSULE_CAP_SEGMENTS = 6;
const TORUS_RADIAL_SEGMENTS = 12;
const TORUS_TUBULAR_SEGMENTS = 24;
const ROUGHNESS = 0.8;
const METALNESS = 0;
/** Tube diameter / outer diameter; a ratio below 0.5 leaves an opening. */
const MAX_TORUS_TUBE = 0.4;
const UNIT_SCALE = new THREE.Vector3(1, 1, 1);
/** The component pair that turns right-handed about each motion axis. */
const PERPENDICULAR = {
    x: [1, 2],
    y: [2, 0],
    z: [0, 1],
};
const CORNERS = [];
for (const x of [-0.5, 0.5]) {
    for (const y of [-0.5, 0.5]) {
        for (const z of [-0.5, 0.5]) {
            CORNERS.push([x, y, z]);
        }
    }
}
/** A part's own centered pose. Size never transforms a part or its children. */
function localMatrix(part) {
    return new THREE.Matrix4().compose(new THREE.Vector3().fromArray(part.position), new THREE.Quaternion().setFromEuler(new THREE.Euler(part.rotation[0], part.rotation[1], part.rotation[2])), UNIT_SCALE);
}
/**
 * Validates the parts as one forest and accumulates each part's object-local
 * center transform. Parts may appear before their parents. Duplicate IDs,
 * missing parents, cycles, and excessive nesting fail explicitly instead of
 * looping or silently dropping geometry.
 */
function resolveTransforms(parts) {
    if (parts.length === 0) {
        throw new SceneValidationError('A procedural design needs at least one part.');
    }
    const byId = new Map();
    for (const part of parts) {
        if (byId.has(part.id)) {
            throw new SceneValidationError(`Duplicate procedural part "${part.id}".`);
        }
        if ([...part.position, ...part.rotation, ...part.size].some((value) => !Number.isFinite(value)) ||
            part.size.some((value) => value <= 0)) {
            throw new SceneValidationError(`Procedural part "${part.id}" needs a finite pose and positive size.`);
        }
        byId.set(part.id, part);
    }
    const transforms = new Map();
    for (const part of parts) {
        const chain = [];
        const visited = new Set();
        let current = part;
        for (;;) {
            if (visited.has(current.id)) {
                throw new SceneValidationError(`Procedural part "${part.id}" is inside a part cycle.`);
            }
            visited.add(current.id);
            chain.push(current);
            if (chain.length > MAX_PART_DEPTH) {
                throw new SceneValidationError(`Procedural parts can nest at most ${MAX_PART_DEPTH} deep.`);
            }
            if (current.parent === null)
                break;
            const parent = byId.get(current.parent);
            if (!parent) {
                throw new SceneValidationError(`Procedural part "${current.id}" has a missing parent "${current.parent}".`);
            }
            current = parent;
        }
        const matrix = new THREE.Matrix4();
        for (let index = chain.length - 1; index >= 0; index--) {
            matrix.multiply(localMatrix(chain[index]));
        }
        transforms.set(part.id, matrix);
    }
    return transforms;
}
/** Sweep an entire subtree about a part-local hinge or axle. */
function sweepBounds(box, motion) {
    const bounds = new THREE.Box3();
    const point = new THREE.Vector3();
    const [uAxis, vAxis] = PERPENDICULAR[motion.axis];
    const pivotU = motion.pivot.getComponent(uAxis);
    const pivotV = motion.pivot.getComponent(vAxis);
    const [start, end] = motionAngleRange(motion);
    const quarter = Math.PI / 2;
    for (const [x, y, z] of CORNERS) {
        point.set(x < 0 ? box.min.x : box.max.x, y < 0 ? box.min.y : box.max.y, z < 0 ? box.min.z : box.max.z);
        const u = point.getComponent(uAxis) - pivotU;
        const v = point.getComponent(vAxis) - pivotV;
        const include = (angle) => {
            const cos = Math.cos(angle);
            const sin = Math.sin(angle);
            point.setComponent(uAxis, pivotU + u * cos - v * sin);
            point.setComponent(vAxis, pivotV + u * sin + v * cos);
            bounds.expandByPoint(point);
        };
        include(start);
        include(end);
        // Each coordinate reaches its extrema at quarter turns of this corner.
        const offset = Math.atan2(v, u);
        const first = Math.ceil((start + offset) / quarter);
        const last = Math.floor((end + offset) / quarter);
        for (let index = first; index <= last; index++) {
            include(index * quarter - offset);
        }
    }
    return bounds;
}
/** The eight corners of a box, in the same order as `CORNERS`. */
function boxCorners(box) {
    return CORNERS.map(([x, y, z]) => new THREE.Vector3(x < 0 ? box.min.x : box.max.x, y < 0 ? box.min.y : box.max.y, z < 0 ? box.min.z : box.max.z));
}
/**
 * Computes hierarchy bounds from conservative corner sets expressed in the
 * frame of the nearest moving ancestor or of the whole object.
 *
 * A static level keeps one composed transform, so its corners stay exact
 * however deeply it nests. Only a part that actually moves collapses its own
 * subtree to an axis-aligned box, and only that box is swept. A design is
 * therefore measured the same way whether or not some unrelated part moves,
 * and a design with no motion at all is measured exactly as before.
 */
function getHierarchyBounds(parts, motions) {
    const children = new Map();
    for (const part of parts) {
        const siblings = children.get(part.parent) ?? [];
        siblings.push(part);
        children.set(part.parent, siblings);
    }
    let measured = 0;
    /** @param toAnchor - Maps the part's own local frame into the anchor frame. */
    const appendPart = (part, toAnchor, into) => {
        measured++;
        const motion = motions.get(part.id);
        if (!motion) {
            appendSubtree(part, toAnchor, into);
            return;
        }
        // A moving part carries its descendants, so the subtree collapses to one
        // axis-aligned box in this part's own frame and only that box is swept.
        const local = [];
        appendSubtree(part, new THREE.Matrix4(), local);
        const swept = sweepBounds(new THREE.Box3().setFromPoints(local), motion);
        for (const corner of boxCorners(swept)) {
            into.push(corner.applyMatrix4(toAnchor));
        }
    };
    const appendSubtree = (part, toAnchor, into) => {
        for (const [x, y, z] of CORNERS) {
            into.push(new THREE.Vector3(x * part.size[0], y * part.size[1], z * part.size[2]).applyMatrix4(toAnchor));
        }
        for (const child of children.get(part.id) ?? []) {
            appendPart(child, new THREE.Matrix4().multiplyMatrices(toAnchor, localMatrix(child)), into);
        }
    };
    const points = [];
    for (const root of children.get(null) ?? []) {
        appendPart(root, localMatrix(root), points);
    }
    if (measured !== parts.length) {
        throw new Error('A procedural design left a part unmeasured.');
    }
    const bounds = new THREE.Box3();
    for (const point of points)
        bounds.expandByPoint(point);
    return bounds;
}
/**
 * Computes a conservative object-local bounding box from the physical size of
 * every part and its full motion envelope, transformed through the part
 * hierarchy. Static levels keep their exact composed corners, so a design is
 * measured the same way whether or not some other part moves. It allocates no
 * renderable geometry or materials, so callers can size and place a design
 * without building it.
 *
 * @param parts - The design's parts, in any order.
 * @returns A finite box in the object's authored coordinates. The design is
 *     never recentered, grounded, or rescaled.
 */
function getProceduralBounds(parts) {
    // Reject duplicate IDs, missing parents, cycles, and over-deep nesting, so
    // every part below is reached exactly once from a root.
    resolveTransforms(parts);
    const motions = new Map(parts.map((part) => [part.id, readPartMotion(part)]));
    const bounds = getHierarchyBounds(parts, motions);
    if (bounds.isEmpty() ||
        [...bounds.min.toArray(), ...bounds.max.toArray()].some((coordinate) => !Number.isFinite(coordinate))) {
        throw new Error('A procedural design produced no finite bounds.');
    }
    return bounds;
}
/** Builds one primitive that exactly fills its declared size about its center. */
function createPartGeometry(part) {
    const [width, height, depth] = part.size;
    switch (part.shape) {
        case 'box':
            return new THREE.BoxGeometry(width, height, depth);
        case 'sphere':
            return new THREE.SphereGeometry(0.5, SPHERE_SEGMENTS, SPHERE_RINGS).scale(width, height, depth);
        case 'cylinder':
            return new THREE.CylinderGeometry(0.5, 0.5, 1, RADIAL_SEGMENTS).scale(width, height, depth);
        case 'cone':
            return new THREE.ConeGeometry(0.5, 1, RADIAL_SEGMENTS).scale(width, height, depth);
        case 'capsule': {
            const radius = Math.min(width, depth, height) / 2;
            return new THREE.CapsuleGeometry(radius, height - radius * 2, CAPSULE_CAP_SEGMENTS, CAPSULE_RADIAL_SEGMENTS).scale(width / (radius * 2), 1, depth / (radius * 2));
        }
        case 'torus': {
            const ring = Math.min(width, height);
            const tube = Math.min(depth, ring * MAX_TORUS_TUBE) / 2;
            return new THREE.TorusGeometry(ring / 2 - tube, tube, TORUS_RADIAL_SEGMENTS, TORUS_TUBULAR_SEGMENTS).scale(width / ring, height / ring, depth / (tube * 2));
        }
        default:
            throw new Error(`Unsupported procedural shape "${part.shape}".`);
    }
}
/**
 * Builds a design from primitive parts as one detached group, so an object can
 * be manipulated, refined, and disposed as a whole. Each part becomes a group
 * named after its part ID holding one mesh, and every geometry and material is
 * freshly owned by this result: nothing is cached or shared between builds.
 * The authored origin is preserved, so refining one part never shifts another.
 *
 * @param parts - The design's parts, in any order.
 * @param tint - The object color; `#ffffff` keeps each part's own color.
 * @returns A new group. Failed construction disposes what it built and
 *     rethrows; Roomcraft owns disposal of a successful result.
 */
function createProceduralContent(parts, tint) {
    resolveTransforms(parts);
    const objectTint = new THREE.Color(tint);
    const root = new THREE.Group();
    const groups = new Map();
    const owned = [];
    try {
        for (const part of parts) {
            const geometry = createPartGeometry(part);
            owned.push(geometry);
            const material = new THREE.MeshStandardMaterial({
                color: new THREE.Color(part.color).multiply(objectTint),
                roughness: ROUGHNESS,
                metalness: METALNESS,
            });
            owned.push(material);
            const mesh = new THREE.Mesh(geometry, material);
            mesh.name = part.name;
            const group = new THREE.Group();
            group.name = part.id;
            group.position.fromArray(part.position);
            group.rotation.set(part.rotation[0], part.rotation[1], part.rotation[2]);
            group.add(mesh);
            groups.set(part.id, group);
        }
        for (const part of parts) {
            const group = groups.get(part.id);
            const parent = part.parent === null ? root : groups.get(part.parent);
            if (!group || !parent) {
                throw new Error(`Procedural part "${part.id}" could not be attached.`);
            }
            parent.add(group);
        }
    }
    catch (error) {
        for (const resource of owned)
            resource.dispose();
        throw error;
    }
    return root;
}

export { createProceduralContent, getProceduralBounds };
