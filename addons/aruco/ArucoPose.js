/**
 * Pose estimation glue between the js-aruco2 detector and the tracker.
 *
 * js-aruco2 reports the four marker corners at integer-pixel accuracy, and
 * its coplanar POSIT solver assumes a centred principal point, one focal
 * length and a y-up image. The helpers here refine the corners, adapt real
 * pinhole intrinsics to those assumptions, and return the pose in the
 * computer-vision convention the tracker expects: camera +X right, +Y down,
 * +Z forward; marker +X right and +Y down as the print is viewed, +Z into
 * the marker.
 *
 * Everything is pure (no `xrblocks`, DOM or worker dependencies) so it can be
 * unit-tested, and the POSIT solver is injected rather than imported.
 */
/**
 * Maps pixel corners into the image POSIT assumes: origin on the principal
 * point, +Y up, and Y stretched by `fx / fy` so that the single focal length
 * handed to POSIT is exactly `fx`.
 */
function normalizeCorners(corners, intrinsics) {
    const aspect = intrinsics.fx / intrinsics.fy;
    return corners.map((corner) => ({
        x: corner.x - intrinsics.cx,
        y: (intrinsics.cy - corner.y) * aspect,
    }));
}
/**
 * Converts a POSIT pose (y-up camera and marker frames) to computer-vision
 * coordinates by flipping Y on both sides: `R' = S·R·S`, `t' = S·t` with
 * `S = diag(1, -1, 1)`.
 */
function positToCvPose(rotation, translation) {
    return {
        rotation: [
            rotation[0][0],
            -rotation[0][1],
            rotation[0][2],
            -rotation[1][0],
            rotation[1][1],
            -rotation[1][2],
            rotation[2][0],
            -rotation[2][1],
            rotation[2][2],
        ],
        translation: [translation[0], -translation[1], translation[2]],
    };
}
/**
 * Marker corners in its own frame, in detector order: clockwise from the
 * top-left as the print is viewed (+Y down).
 */
function markerCorners(sizeMeters) {
    const half = sizeMeters / 2;
    return [
        [-half, -half],
        [half, -half],
        [half, half],
        [-half, half],
    ];
}
/**
 * RMS pixel distance between observed corners and the marker's corners
 * projected through `pose`. Returns `Infinity` when any corner lands behind
 * the camera.
 */
function reprojectionErrorPx(pose, corners, intrinsics, sizeMeters) {
    const r = pose.rotation;
    const t = pose.translation;
    const model = markerCorners(sizeMeters);
    let sum = 0;
    for (let i = 0; i < 4; ++i) {
        const [mx, my] = model[i];
        const x = r[0] * mx + r[1] * my + t[0];
        const y = r[3] * mx + r[4] * my + t[1];
        const z = r[6] * mx + r[7] * my + t[2];
        if (!(z > 0))
            return Infinity;
        const du = (intrinsics.fx * x) / z + intrinsics.cx - corners[i].x;
        const dv = (intrinsics.fy * y) / z + intrinsics.cy - corners[i].y;
        sum += du * du + dv * dv;
    }
    return Math.sqrt(sum / 4);
}
function isFiniteSolution(rotation, translation) {
    return (rotation.length === 3 &&
        rotation.every((row) => row.length === 3 && row.every(Number.isFinite)) &&
        translation.length === 3 &&
        translation.every(Number.isFinite));
}
/**
 * Solves the camera-from-marker pose of one detected quad.
 *
 * A planar target seen by a perspective camera has two plausible poses.
 * POSIT returns both; rather than trusting its own ranking (made in its
 * normalized image), this keeps whichever reprojects closer to the observed
 * corners in real pixels.
 *
 * @param posit - A `POS.Posit(sizeMeters, intrinsics.fx)` instance.
 * @param corners - Detector corners, clockwise from the top-left, in pixels.
 * @returns The better solution, or `null` when POSIT found none.
 */
function solveMarkerPose(posit, corners, intrinsics, sizeMeters) {
    if (corners.length !== 4)
        return null;
    const solved = posit.pose(normalizeCorners(corners, intrinsics));
    let best = null;
    for (const [rotation, translation] of [
        [solved.bestRotation, solved.bestTranslation],
        [solved.alternativeRotation, solved.alternativeTranslation],
    ]) {
        if (!isFiniteSolution(rotation, translation))
            continue;
        const pose = positToCvPose(rotation, translation);
        if (!(pose.translation[2] > 0))
            continue;
        const reprojectionError = reprojectionErrorPx(pose, corners, intrinsics, sizeMeters);
        if (!best || reprojectionError < best.reprojectionError) {
            best = { ...pose, reprojectionError };
        }
    }
    return best && Number.isFinite(best.reprojectionError) ? best : null;
}
/** Mean side length of a quad, in pixels. */
function meanSidePixels(corners) {
    let sum = 0;
    for (let i = 0; i < corners.length; ++i) {
        const next = corners[(i + 1) % corners.length];
        sum += Math.hypot(next.x - corners[i].x, next.y - corners[i].y);
    }
    return sum / corners.length;
}
// A refined corner further than this from the detector's is a jump onto some
// other feature, not a refinement.
const MAX_REFINEMENT_SHIFT_PX = 2;
const REFINEMENT_ITERATIONS = 6;
/**
 * Refines quad corners to sub-pixel accuracy.
 *
 * At a true corner every nearby image gradient is perpendicular to the
 * vector from the corner to that pixel, so the corner is the least-squares
 * solution of `Σ g·gᵀ (q − p) = 0` over a small window (the classic
 * `cornerSubPix` iteration). The window is sized from the quad so that it
 * stays within the marker's one-cell border and never reaches the code cells.
 *
 * @param cellsPerSide - Marker grid size including the border (7 or 8).
 * @returns New corner objects; a corner that cannot be refined is returned
 *   unchanged.
 */
function refineCornersSubpixel(image, corners, cellsPerSide) {
    const cellPixels = meanSidePixels(corners) / cellsPerSide;
    const halfWindow = Math.min(5, Math.floor(cellPixels * 0.75));
    if (halfWindow < 2)
        return corners.map((corner) => ({ ...corner }));
    return corners.map((corner) => refineCorner(image, corner, halfWindow));
}
function refineCorner(image, corner, halfWindow) {
    const { width, height, data } = image;
    const sigma = halfWindow / 2;
    const inverseTwoSigmaSq = 1 / (2 * sigma * sigma);
    let qx = corner.x;
    let qy = corner.y;
    for (let iteration = 0; iteration < REFINEMENT_ITERATIONS; ++iteration) {
        const centreX = Math.round(qx);
        const centreY = Math.round(qy);
        if (centreX - halfWindow < 1 ||
            centreY - halfWindow < 1 ||
            centreX + halfWindow > width - 2 ||
            centreY + halfWindow > height - 2) {
            break;
        }
        let a = 0;
        let b = 0;
        let c = 0;
        let bx = 0;
        let by = 0;
        for (let py = centreY - halfWindow; py <= centreY + halfWindow; ++py) {
            const row = py * width;
            for (let px = centreX - halfWindow; px <= centreX + halfWindow; ++px) {
                const gx = (data[row + px + 1] - data[row + px - 1]) / 2;
                const gy = (data[row + width + px] - data[row - width + px]) / 2;
                const dx = px - qx;
                const dy = py - qy;
                const weight = Math.exp(-(dx * dx + dy * dy) * inverseTwoSigmaSq);
                const gxx = weight * gx * gx;
                const gxy = weight * gx * gy;
                const gyy = weight * gy * gy;
                a += gxx;
                b += gxy;
                c += gyy;
                bx += gxx * px + gxy * py;
                by += gxy * px + gyy * py;
            }
        }
        const determinant = a * c - b * b;
        // Flat or single-edge neighbourhoods do not constrain a corner.
        if (!(Math.abs(determinant) > 1e-6 * (a + c) * (a + c)))
            break;
        const nextX = (c * bx - b * by) / determinant;
        const nextY = (a * by - b * bx) / determinant;
        const step = Math.hypot(nextX - qx, nextY - qy);
        qx = nextX;
        qy = nextY;
        if (step < 0.01)
            break;
    }
    if (!Number.isFinite(qx) ||
        !Number.isFinite(qy) ||
        Math.hypot(qx - corner.x, qy - corner.y) > MAX_REFINEMENT_SHIFT_PX) {
        return { ...corner };
    }
    return { x: qx, y: qy };
}

export { meanSidePixels, normalizeCorners, positToCvPose, refineCornersSubpixel, reprojectionErrorPx, solveMarkerPose };
