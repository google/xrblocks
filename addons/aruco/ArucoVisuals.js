import * as THREE from 'three';
import { DEFAULT_ARUCO_MARKER_SIZE_METERS } from './ArucoTypes.js';

/**
 * The standard "the marker is really being tracked" overlay: a set of axes at the
 * marker's origin plus an outline square matching its printed size. Add the
 * returned group as a child of an {@link ArucoTracker} and it rides the
 * anchor for free.
 *
 * Built from SOLID GEOMETRY -- cylinders and bars -- rather than the obvious
 * `THREE.AxesHelper` + `THREE.LineLoop`, for two reasons:
 *
 *  1. **Line primitives cannot be thickened.** WebGL ignores
 *     `LineBasicMaterial.linewidth`; every line draws exactly one pixel wide
 *     whatever the value. At the distance you actually stand from a printed
 *     marker to check whether tracking has locked on, a 1 px overlay is a barely
 *     visible hairline -- the opposite of what a confidence indicator is for.
 *  2. **Line primitives raycast with a 1 METRE default threshold.** An overlay
 *     sitting exactly where the user points would otherwise swallow every
 *     pointer ray within a metre of the marker, stealing clicks from UI behind
 *     it. Meshes have tight bounds, and everything here additionally opts out
 *     of raycasting entirely.
 */
// X red, Y green, Z blue -- AxesHelper's convention, which the demos' legends
// already state. Cylinders are authored along +Y, so Y is the untouched case.
const AXES = [
    [0xff3b30, [0, 0, -Math.PI / 2]],
    [0x34c759, [0, 0, 0]],
    [0x2f7bff, [Math.PI / 2, 0, 0]],
];
/**
 * Builds the axes + outline overlay for a tracked Aruco.
 *
 * @param options - See {@link ArucoAnchorVisualsOptions}.
 * @returns A group to add as a child of an `ArucoTracker`.
 */
function createArucoAnchorVisuals(options = {}) {
    const { markerSizeMeters = DEFAULT_ARUCO_MARKER_SIZE_METERS, axisLengthMeters = 0.12, axisRadiusMeters = 0.005, outlineThicknessMeters = 0.008, outlineColor = 0xffffff, } = options;
    const group = new THREE.Group();
    group.name = 'ArucoAnchorVisuals';
    const geometries = [];
    const materials = [];
    // One shared cylinder pushed up its own length, so it grows FROM the origin
    // rather than straddling it -- each axis is then purely a rotation.
    const armGeometry = new THREE.CylinderGeometry(axisRadiusMeters, axisRadiusMeters, axisLengthMeters, 12);
    armGeometry.translate(0, axisLengthMeters / 2, 0);
    geometries.push(armGeometry);
    for (const [color, rotation] of AXES) {
        // Unlit on purpose: the overlay must read identically under whatever
        // lighting the room happens to have, including none.
        const material = new THREE.MeshBasicMaterial({ color });
        materials.push(material);
        const arm = new THREE.Mesh(armGeometry, material);
        arm.rotation.set(...rotation);
        group.add(arm);
    }
    const half = markerSizeMeters / 2;
    const thickness = outlineThicknessMeters;
    const outlineMaterial = new THREE.MeshBasicMaterial({ color: outlineColor });
    materials.push(outlineMaterial);
    // Each bar overhangs by one thickness so the four corners overlap and close,
    // instead of leaving a notch at every corner.
    const horizontal = new THREE.BoxGeometry(markerSizeMeters + thickness, thickness, thickness);
    const vertical = new THREE.BoxGeometry(thickness, markerSizeMeters + thickness, thickness);
    geometries.push(horizontal, vertical);
    const bars = [
        [horizontal, 0, half],
        [horizontal, 0, -half],
        [vertical, -half, 0],
        [vertical, half, 0],
    ];
    for (const [geometry, x, y] of bars) {
        const bar = new THREE.Mesh(geometry, outlineMaterial);
        bar.position.set(x, y, 0);
        group.add(bar);
    }
    group.traverse((object) => {
        object.raycast = () => { };
    });
    group.dispose = () => {
        for (const geometry of geometries)
            geometry.dispose();
        for (const material of materials)
            material.dispose();
    };
    return group;
}

export { createArucoAnchorVisuals };
