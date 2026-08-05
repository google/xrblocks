import * as THREE from 'three';

/**
 * Debug box-group builder and label sprite helpers.
 *
 * These helpers depend on the DOM (`document.createElement`) and are therefore
 * excluded from unit tests. They are only called when `showDebugBoxes` is
 * enabled on {@link Object3DDetector}.
 */
/**
 * Per-category edge colours for debug visualisation.
 * Flat (paintings/TV) = orange, furniture = green, small (cup/remote) = cyan,
 * light = yellow.
 */
const CAT_COLOR = {
    flat: 0xff9f0a,
    furniture: 0x4cd964,
    small: 0x64d2ff,
    light: 0xffd60a,
};
/**
 * Build a canvas-based {@link THREE.Sprite} that displays `text` with a pill
 * background coloured to match `lineColor`. The sprite billboards toward the
 * camera automatically and scales with viewer distance so it reads at a
 * consistent visual size.
 *
 * @param text - Label string to render.
 * @param lineColor - Hex colour integer for the pill border (e.g. `0x4cd964`).
 * @returns A fully configured {@link THREE.Sprite} ready to add to the scene.
 */
function makeLabelSprite(text, lineColor) {
    const padX = 24;
    const padY = 14;
    const fontPx = 64;
    const measureCanvas = document.createElement('canvas');
    const measureCtx = measureCanvas.getContext('2d');
    measureCtx.font = `bold ${fontPx}px sans-serif`;
    const textW = Math.ceil(measureCtx.measureText(text).width);
    const w = textW + padX * 2;
    const h = fontPx + padY * 2;
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    const r = h / 2;
    ctx.fillStyle = 'rgba(0,0,0,0.78)';
    ctx.beginPath();
    ctx.moveTo(r, 0);
    ctx.lineTo(w - r, 0);
    ctx.arc(w - r, r, r, -Math.PI / 2, Math.PI / 2);
    ctx.lineTo(r, h);
    ctx.arc(r, r, r, Math.PI / 2, -Math.PI / 2);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = '#' + lineColor.toString(16).padStart(6, '0');
    ctx.lineWidth = 4;
    ctx.stroke();
    ctx.font = `bold ${fontPx}px sans-serif`;
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'center';
    ctx.fillStyle = '#ffffff';
    ctx.fillText(text, w / 2, h / 2 + 2);
    const tex = new THREE.CanvasTexture(canvas);
    tex.anisotropy = 8;
    tex.minFilter = THREE.LinearFilter;
    tex.magFilter = THREE.LinearFilter;
    const mat = new THREE.SpriteMaterial({
        map: tex,
        transparent: true,
        depthTest: false,
        depthWrite: false,
    });
    const sprite = new THREE.Sprite(mat);
    const targetH = 0.18;
    const baseW = (targetH * w) / h;
    sprite.scale.set(baseW, targetH, 1);
    const REF_DIST = 2.0;
    const MIN_MUL = 0.55;
    const MAX_MUL = 2.0;
    const _camPos = new THREE.Vector3();
    const _sprPos = new THREE.Vector3();
    sprite.onBeforeRender = (_renderer, _scene, camera) => {
        camera.getWorldPosition(_camPos);
        sprite.getWorldPosition(_sprPos);
        const d = _camPos.distanceTo(_sprPos);
        let mul = d / REF_DIST;
        if (mul < MIN_MUL)
            mul = MIN_MUL;
        else if (mul > MAX_MUL)
            mul = MAX_MUL;
        sprite.scale.set(baseW * mul, targetH * mul, 1);
    };
    // Disable raycasting on label sprites — they are display-only and the
    // xrblocks raycaster crashes on sprites without a camera reference.
    sprite.raycast = () => { };
    return sprite;
}
/**
 * Build a debug box group for the given OBB with edge outlines (two passes:
 * ghost-faint with depth-test off + solid with depth-test on) and a label
 * sprite above the top face.
 *
 * @param obb - Oriented bounding box to visualise.
 * @param label - Text label shown above the box.
 * @param color - Hex colour integer for the edges and label border.
 * @returns A `THREE.Group` positioned and rotated to match `obb`.
 */
function buildBoxGroup(obb, label, color = 0x4cd964) {
    const group = new THREE.Group();
    const geom = new THREE.BoxGeometry(obb.size.x, obb.size.y, obb.size.z);
    const edges = new THREE.EdgesGeometry(geom);
    const ghostLines = new THREE.LineSegments(edges, new THREE.LineBasicMaterial({
        color,
        transparent: true,
        opacity: 0.25,
        depthTest: false,
        depthWrite: false,
    }));
    ghostLines.renderOrder = 1;
    group.add(ghostLines);
    const lines = new THREE.LineSegments(edges, new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.95 }));
    lines.renderOrder = 2;
    group.add(lines);
    const labelSprite = makeLabelSprite(label, color);
    labelSprite.position.set(0, obb.size.y / 2 + 0.06, 0);
    labelSprite.renderOrder = 3;
    group.add(labelSprite);
    group.userData.label =
        labelSprite;
    group.userData.labelText = label;
    group.position.copy(obb.center);
    group.rotation.y = obb.angle;
    geom.dispose();
    return group;
}
/**
 * Rebuild the edge geometry of an existing box group in place after an OBB
 * fusion update, without destroying the label sprite or event listeners.
 *
 * @param group - Box group previously created by {@link buildBoxGroup}.
 * @param obb - New OBB to apply.
 */
function rebuildBoxGroupGeometry(group, obb) {
    const newGeom = new THREE.BoxGeometry(obb.size.x, obb.size.y, obb.size.z);
    const newEdges = new THREE.EdgesGeometry(newGeom);
    group.traverse((o) => {
        if (o.isLineSegments) {
            const ls = o;
            if (ls.geometry)
                ls.geometry.dispose();
            ls.geometry = newEdges.clone();
        }
    });
    newGeom.dispose();
    newEdges.dispose();
    group.position.copy(obb.center);
    group.rotation.y = obb.angle;
    const ud = group.userData;
    if (ud.label) {
        ud.label.position.set(0, obb.size.y / 2 + 0.06, 0);
    }
}

export { CAT_COLOR, buildBoxGroup, makeLabelSprite, rebuildBoxGroupGeometry };
