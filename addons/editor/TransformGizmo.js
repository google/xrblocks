import * as THREE from 'three';
import * as xb from 'xrblocks';

const AXIS_DEFS = [
    { name: 'x', color: 0xef4444, dir: new THREE.Vector3(1, 0, 0) },
    { name: 'y', color: 0x22c55e, dir: new THREE.Vector3(0, 1, 0) },
    { name: 'z', color: 0x3b82f6, dir: new THREE.Vector3(0, 0, 1) },
];
const PLANE_DEFS = [
    { name: 'xy', color: 0x3b82f6, normal: new THREE.Vector3(0, 0, 1) },
    { name: 'yz', color: 0xef4444, normal: new THREE.Vector3(1, 0, 0) },
    { name: 'xz', color: 0x22c55e, normal: new THREE.Vector3(0, 1, 0) },
];
const AXIS_DIR_BY_NAME = Object.fromEntries(AXIS_DEFS.map((d) => [d.name, d.dir]));
const PLANE_NORMAL_BY_NAME = Object.fromEntries(PLANE_DEFS.map((d) => [d.name, d.normal]));
const PLANE_AXIS_LETTERS = {
    xy: ['x', 'y'],
    yz: ['y', 'z'],
    xz: ['x', 'z'],
};
// Perpendicular in-plane basis for measuring a rotation ring's drag angle,
// per axis. Only needs to be internally consistent frame-to-frame, not
// globally "correct" -- it's recomputed fresh via atan2 every frame rather
// than accumulated, so there's no drift regardless of basis choice.
const RING_BASIS_BY_AXIS = {
    x: { u: new THREE.Vector3(0, 1, 0), v: new THREE.Vector3(0, 0, 1) },
    y: { u: new THREE.Vector3(0, 0, 1), v: new THREE.Vector3(1, 0, 0) },
    z: { u: new THREE.Vector3(1, 0, 0), v: new THREE.Vector3(0, 1, 0) },
};
const SHAFT_LENGTH = 0.14;
const SHAFT_RADIUS = 0.004;
const HEAD_LENGTH = 0.045;
const HEAD_RADIUS = 0.014;
const PICK_RADIUS_SCALE = 4;
const PLANE_SIZE = 0.05;
const PLANE_INSET = 0.035;
const PLANE_BASE_OPACITY = 0.35;
const PLANE_HOVER_OPACITY = 0.85;
const HOVER_COLOR = 0xfacc15;
const RING_RADIUS = 0.11;
const RING_TUBE_RADIUS = 0.003;
const RING_PICK_TUBE_SCALE = 5;
const RING_SEGMENTS = 48;
const SCALE_SHAFT_LENGTH = 0.12;
const SCALE_CUBE_SIZE = 0.022;
const SCALE_CENTER_CUBE_SIZE = 0.028;
const SCALE_PICK_MARGIN = 1.8;
const SCALE_CENTER_COLOR = 0xe5e7eb;
const MIN_SCALE_DENOMINATOR = 0.02;
const MIN_SCALE_COMPONENT = 0.02;
const MAX_SCALE_RATIO = 8;
function buildAxisHandle(def) {
    const group = new THREE.Group();
    const material = new THREE.MeshBasicMaterial({
        color: def.color,
        depthTest: false,
        transparent: true,
    });
    const shaft = new THREE.Mesh(new THREE.CylinderGeometry(SHAFT_RADIUS, SHAFT_RADIUS, SHAFT_LENGTH, 8), material);
    shaft.position.y = SHAFT_LENGTH / 2;
    shaft.renderOrder = 999;
    shaft.raycast = () => { };
    const head = new THREE.Mesh(new THREE.ConeGeometry(HEAD_RADIUS, HEAD_LENGTH, 10), material);
    head.position.y = SHAFT_LENGTH + HEAD_LENGTH / 2;
    head.renderOrder = 999;
    head.raycast = () => { };
    // A fatter invisible mesh makes the thin arrow easy to click precisely.
    const pick = new THREE.Mesh(new THREE.CylinderGeometry(SHAFT_RADIUS * PICK_RADIUS_SCALE, SHAFT_RADIUS * PICK_RADIUS_SCALE, SHAFT_LENGTH + HEAD_LENGTH, 8), new THREE.MeshBasicMaterial({ visible: false }));
    pick.position.y = (SHAFT_LENGTH + HEAD_LENGTH) / 2;
    const handleData = { kind: 'axis', axis: def.name };
    pick.userData = handleData;
    group.add(shaft, head, pick);
    group.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), def.dir);
    // Color-only highlight, same reasoning as rings/scale handles: growing
    // the arrow shifts its own pick geometry away from the cursor mid-hover,
    // fighting the hover detection instead of helping it.
    const record = {
        pick,
        material,
        baseColor: def.color,
    };
    return { object: group, record };
}
function buildPlaneHandle(def) {
    const material = new THREE.MeshBasicMaterial({
        color: def.color,
        transparent: true,
        opacity: PLANE_BASE_OPACITY,
        side: THREE.DoubleSide,
        depthTest: false,
    });
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(PLANE_SIZE, PLANE_SIZE), material);
    mesh.renderOrder = 999;
    mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), def.normal);
    const u = new THREE.Vector3(1, 0, 0).applyQuaternion(mesh.quaternion);
    const v = new THREE.Vector3(0, 1, 0).applyQuaternion(mesh.quaternion);
    mesh.position.addScaledVector(u, PLANE_INSET).addScaledVector(v, PLANE_INSET);
    const handleData = { kind: 'plane', plane: def.name };
    mesh.userData = handleData;
    const record = {
        pick: mesh,
        material,
        baseColor: def.color,
        baseOpacity: PLANE_BASE_OPACITY,
        hoverOpacity: PLANE_HOVER_OPACITY,
    };
    return { object: mesh, record };
}
function buildRingHandle(def) {
    const material = new THREE.MeshBasicMaterial({
        color: def.color,
        depthTest: false,
        transparent: true,
        side: THREE.DoubleSide,
    });
    const visual = new THREE.Mesh(new THREE.TorusGeometry(RING_RADIUS, RING_TUBE_RADIUS, 8, RING_SEGMENTS), material);
    visual.renderOrder = 999;
    visual.raycast = () => { };
    // A fatter invisible torus makes the thin ring easy to click precisely.
    const pick = new THREE.Mesh(new THREE.TorusGeometry(RING_RADIUS, RING_TUBE_RADIUS * RING_PICK_TUBE_SCALE, 8, RING_SEGMENTS), new THREE.MeshBasicMaterial({ visible: false }));
    const handleData = { kind: 'ring', axis: def.name };
    pick.userData = handleData;
    const group = new THREE.Group();
    group.add(visual, pick);
    // A ring for rotation about `dir` lies in the plane perpendicular to
    // `dir` -- same orientation concept as a translate plane handle's normal.
    group.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), def.dir);
    // Unlike axis/plane handles, rings don't scale on hover: growing a
    // ring's radius shifts its pick geometry away from the cursor, which
    // fights the hover detection and makes the ring hard to grab reliably.
    // Color-only highlight (like plane handles) avoids that feedback loop.
    const record = {
        pick,
        material,
        baseColor: def.color,
    };
    return { object: group, record };
}
function buildScaleAxisHandle(def) {
    const group = new THREE.Group();
    const material = new THREE.MeshBasicMaterial({
        color: def.color,
        depthTest: false,
        transparent: true,
    });
    const shaft = new THREE.Mesh(new THREE.CylinderGeometry(SHAFT_RADIUS, SHAFT_RADIUS, SCALE_SHAFT_LENGTH, 8), material);
    shaft.position.y = SCALE_SHAFT_LENGTH / 2;
    shaft.renderOrder = 999;
    shaft.raycast = () => { };
    // Cube tip (vs. translate's cone) so scale handles read as visually
    // distinct from translate arrows at a glance.
    const tip = new THREE.Mesh(new THREE.BoxGeometry(SCALE_CUBE_SIZE, SCALE_CUBE_SIZE, SCALE_CUBE_SIZE), material);
    tip.position.y = SCALE_SHAFT_LENGTH + SCALE_CUBE_SIZE / 2;
    tip.renderOrder = 999;
    tip.raycast = () => { };
    const pick = new THREE.Mesh(new THREE.CylinderGeometry(SHAFT_RADIUS * PICK_RADIUS_SCALE, SHAFT_RADIUS * PICK_RADIUS_SCALE, SCALE_SHAFT_LENGTH + SCALE_CUBE_SIZE, 8), new THREE.MeshBasicMaterial({ visible: false }));
    pick.position.y = (SCALE_SHAFT_LENGTH + SCALE_CUBE_SIZE) / 2;
    const handleData = { kind: 'scale-axis', axis: def.name };
    pick.userData = handleData;
    group.add(shaft, tip, pick);
    group.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), def.dir);
    // Color-only highlight, same reasoning as rings: growing a scale handle
    // shifts its own pick geometry away from the cursor mid-hover, fighting
    // the hover detection instead of helping it.
    const record = {
        pick,
        material,
        baseColor: def.color,
    };
    return { object: group, record };
}
function buildScaleCenterHandle() {
    const material = new THREE.MeshBasicMaterial({
        color: SCALE_CENTER_COLOR,
        depthTest: false,
        transparent: true,
    });
    const visual = new THREE.Mesh(new THREE.BoxGeometry(SCALE_CENTER_CUBE_SIZE, SCALE_CENTER_CUBE_SIZE, SCALE_CENTER_CUBE_SIZE), material);
    visual.renderOrder = 999;
    visual.raycast = () => { };
    const pick = new THREE.Mesh(new THREE.BoxGeometry(SCALE_CENTER_CUBE_SIZE * SCALE_PICK_MARGIN, SCALE_CENTER_CUBE_SIZE * SCALE_PICK_MARGIN, SCALE_CENTER_CUBE_SIZE * SCALE_PICK_MARGIN), new THREE.MeshBasicMaterial({ visible: false }));
    const handleData = { kind: 'scale-uniform' };
    pick.userData = handleData;
    const group = new THREE.Group();
    group.add(visual, pick);
    const record = {
        pick,
        material,
        baseColor: SCALE_CENTER_COLOR,
    };
    return { object: group, record };
}
function clampScaleRatio(ratio) {
    if (!Number.isFinite(ratio))
        return 1;
    return THREE.MathUtils.clamp(ratio, 1 / MAX_SCALE_RATIO, MAX_SCALE_RATIO);
}
function clampScaleVector(vector) {
    vector.x = Math.max(MIN_SCALE_COMPONENT, vector.x);
    vector.y = Math.max(MIN_SCALE_COMPONENT, vector.y);
    vector.z = Math.max(MIN_SCALE_COMPONENT, vector.z);
    return vector;
}
/**
 * Translate + rotate + scale transform gizmo for the current selection.
 * Desktop mouse only: drag math reads xb.core.input.mouseController
 * directly -- real XR controller support is permanently out of scope for
 * this addon. Bespoke drag math throughout -- DragManager's
 * translate/rotate/scale are respectively an unconstrained 6-DOF delta, a
 * hardcoded world-Y yaw, and a two-controller-only gesture, none usable
 * for constrained dragging, arbitrary-axis rotation, or single-pointer
 * scaling.
 */
class TransformGizmo extends xb.Script {
    constructor(selectionManager, commandHistory = null) {
        super();
        this.translateHandles = new THREE.Group();
        this.rotateHandles = new THREE.Group();
        this.scaleHandles = new THREE.Group();
        this.handleRecords = [];
        this.drag = null;
        this.hoveredRecord = null;
        this.selectionManager = selectionManager;
        this.commandHistory = commandHistory;
        this.add(this.translateHandles);
        this.add(this.rotateHandles);
        this.add(this.scaleHandles);
        for (const def of AXIS_DEFS) {
            const { object, record } = buildAxisHandle(def);
            this.translateHandles.add(object);
            this.handleRecords.push(record);
        }
        for (const def of PLANE_DEFS) {
            const { object, record } = buildPlaneHandle(def);
            this.translateHandles.add(object);
            this.handleRecords.push(record);
        }
        for (const def of AXIS_DEFS) {
            const { object, record } = buildRingHandle(def);
            this.rotateHandles.add(object);
            this.handleRecords.push(record);
        }
        for (const def of AXIS_DEFS) {
            const { object, record } = buildScaleAxisHandle(def);
            this.scaleHandles.add(object);
            this.handleRecords.push(record);
        }
        {
            const { object, record } = buildScaleCenterHandle();
            this.scaleHandles.add(object);
            this.handleRecords.push(record);
        }
        this.visible = false;
    }
    update() {
        const selectedList = this.selectionManager.selectedList();
        const mode = this.selectionManager.mode;
        const active = this.selectionManager.editorActive &&
            selectedList.length > 0 &&
            (mode === 'translate' || mode === 'rotate' || mode === 'scale');
        this.visible = active;
        this.translateHandles.visible = active && mode === 'translate';
        this.rotateHandles.visible = active && mode === 'rotate';
        this.scaleHandles.visible = active && mode === 'scale';
        if (!active) {
            if (this.drag)
                this.endDrag();
            this.setHoveredRecord(null);
            return;
        }
        this.position.copy(this.computeGroupPivot(selectedList));
        this.syncOrientation();
        this.updateMatrixWorld(true);
        if (this.drag) {
            this.updateDrag();
        }
        else {
            this.updateHover();
        }
    }
    /** In local space, aligns the gizmo's own orientation with the primary
     * (active) object's current content quaternion -- since every handle
     * (axis/plane/ring) is built parent-relative to this object already,
     * this alone reorients all of them at once for both rendering and
     * raycasting, no per-handle changes needed. Identity in world space. */
    syncOrientation() {
        const primary = this.selectionManager.primary;
        const content = this.selectionManager.space === 'local'
            ? primary?.viewer.modelScene
            : null;
        if (content) {
            this.quaternion.copy(content.quaternion);
        }
        else {
            this.quaternion.identity();
        }
    }
    /** Axis directions in world space for the current space mode -- world
     * axes in 'world' space, or the primary object's own (rotated) axes in
     * 'local' space. Derived from this.quaternion (kept in sync by
     * syncOrientation() every frame) rather than re-reading the primary's
     * quaternion directly, so it's consistent with whatever the gizmo is
     * currently displaying. */
    getAxisDirections() {
        return {
            x: AXIS_DIR_BY_NAME.x.clone().applyQuaternion(this.quaternion),
            y: AXIS_DIR_BY_NAME.y.clone().applyQuaternion(this.quaternion),
            z: AXIS_DIR_BY_NAME.z.clone().applyQuaternion(this.quaternion),
        };
    }
    getPlaneNormals() {
        return {
            xy: PLANE_NORMAL_BY_NAME.xy.clone().applyQuaternion(this.quaternion),
            yz: PLANE_NORMAL_BY_NAME.yz.clone().applyQuaternion(this.quaternion),
            xz: PLANE_NORMAL_BY_NAME.xz.clone().applyQuaternion(this.quaternion),
        };
    }
    getPlaneAxisPair(planeName, axisDirections) {
        const [a, b] = PLANE_AXIS_LETTERS[planeName];
        return [axisDirections[a], axisDirections[b]];
    }
    /** World-space center of the object's bounding box, not its base/origin -
     * viewer.position sits at the object's floor, which would otherwise
     * place the gizmo at the object's feet. */
    getPivotWorldPosition(viewer) {
        viewer.updateMatrixWorld();
        const center = new THREE.Vector3();
        viewer.bbox.getCenter(center);
        return center.applyMatrix4(viewer.matrixWorld);
    }
    /** Centroid of every selected instance's own pivot. For a single
     * selection this is exactly that instance's own pivot, which is what
     * makes the group translate/rotate/scale math below reduce to today's
     * single-object behavior automatically -- see the drag update methods. */
    computeGroupPivot(selectedList) {
        const pivot = new THREE.Vector3();
        for (const instance of selectedList) {
            pivot.add(this.getPivotWorldPosition(instance.viewer));
        }
        pivot.divideScalar(selectedList.length);
        return pivot;
    }
    getActiveHandles() {
        const mode = this.selectionManager.mode;
        if (mode === 'rotate')
            return this.rotateHandles.children;
        if (mode === 'scale')
            return this.scaleHandles.children;
        return this.translateHandles.children;
    }
    updateHover() {
        xb.core.input.setRaycasterFromController(xb.core.input.mouseController);
        const hits = xb.core.input.raycaster.intersectObjects(this.getActiveHandles(), true);
        const record = hits.length > 0 ? this.findRecord(hits[0].object) : null;
        this.setHoveredRecord(record);
    }
    findRecord(pickObject) {
        return this.handleRecords.find((r) => r.pick === pickObject) ?? null;
    }
    setHoveredRecord(record) {
        if (this.hoveredRecord === record)
            return;
        if (this.hoveredRecord)
            this.applyHighlight(this.hoveredRecord, false);
        this.hoveredRecord = record;
        if (this.hoveredRecord)
            this.applyHighlight(this.hoveredRecord, true);
    }
    applyHighlight(record, highlighted) {
        // Color-only highlight across every handle type: growing a handle on
        // hover shifts its own pick geometry away from the cursor, fighting
        // the hover detection instead of helping it.
        record.material.color.set(highlighted ? HOVER_COLOR : record.baseColor);
        if (record.hoverOpacity != null) {
            record.material.opacity = highlighted
                ? record.hoverOpacity
                : (record.baseOpacity ?? 1);
        }
    }
    /** Scoped raycast against only the currently active handle group (not
     * the whole scene), so it can't be fooled by a closer non-handle hit --
     * unlike a whole-scene raycast, which can't reliably tell whether the
     * user meant to click a handle or the object underneath it (handles
     * render with depthTest:false so they always look like they're on top,
     * but true ray distance doesn't know that). Exposed publicly so
     * SelectionManager can ask "did this click hit a handle?" and defer to
     * us before running its own scene-wide hit-test at all, instead of the
     * two of us racing independent raycasts against each other -- xrblocks
     * broadcasts onSelectStart to every script unconditionally, with no
     * built-in event priority/stopPropagation. */
    hitTestActiveHandle(controller) {
        if (!this.visible)
            return null;
        if (this.selectionManager.selectedList().length === 0)
            return null;
        xb.core.input.setRaycasterFromController(controller);
        const hits = xb.core.input.raycaster.intersectObjects(this.getActiveHandles(), true);
        return hits.length > 0 ? hits[0] : null;
    }
    onSelectStart(event) {
        const controller = event.target;
        if (controller !== xb.core.input.mouseController)
            return;
        const hit = this.hitTestActiveHandle(controller);
        if (!hit)
            return;
        const selectedList = this.selectionManager.selectedList();
        this.setHoveredRecord(this.findRecord(hit.object));
        this.beginDrag(selectedList, hit.object.userData, controller);
    }
    onSelectEnd(event) {
        if (event.target !== xb.core.input.mouseController)
            return;
        this.endDrag();
    }
    beginDrag(selectedList, handleData, controller) {
        const pivot = this.computeGroupPivot(selectedList);
        if (handleData.kind === 'ring') {
            this.beginRotateDrag(selectedList, pivot, handleData, controller);
            return;
        }
        if (handleData.kind === 'scale-axis' ||
            handleData.kind === 'scale-uniform') {
            this.beginScaleDrag(selectedList, pivot, handleData, controller);
            return;
        }
        const axisDirections = this.getAxisDirections();
        const planeNormals = this.getPlaneNormals();
        const axisDir = handleData.kind === 'axis' ? axisDirections[handleData.axis] : null;
        const plane = this.computeDragPlane(pivot, handleData, axisDirections, planeNormals);
        xb.core.input.setRaycasterFromController(controller);
        const startPoint = new THREE.Vector3();
        if (!xb.core.input.raycaster.ray.intersectPlane(plane, startPoint)) {
            return;
        }
        this.drag = {
            kind: 'translate',
            controller,
            plane,
            startPoint,
            handleData,
            axisDir,
            planeAxes: handleData.kind === 'plane'
                ? this.getPlaneAxisPair(handleData.plane, axisDirections)
                : null,
            targets: selectedList.map((instance) => ({
                instance,
                viewer: instance.viewer,
                startPosition: instance.viewer.position.clone(),
            })),
        };
    }
    beginRotateDrag(selectedList, pivot, handleData, controller) {
        const axisDir = this.getAxisDirections()[handleData.axis];
        const plane = new THREE.Plane().setFromNormalAndCoplanarPoint(axisDir, pivot);
        xb.core.input.setRaycasterFromController(controller);
        const startAngle = this.computeRingAngle(plane, pivot, handleData.axis);
        if (startAngle == null)
            return;
        const targets = selectedList
            .map((instance) => {
            const content = instance.viewer.modelScene;
            if (!content)
                return null;
            return {
                instance,
                viewer: instance.viewer,
                content,
                startPosition: instance.viewer.position.clone(),
                startQuaternion: content.quaternion.clone(),
                ownPivot: this.getPivotWorldPosition(instance.viewer),
            };
        })
            .filter((target) => target !== null);
        if (targets.length === 0)
            return;
        this.drag = {
            kind: 'rotate',
            controller,
            plane,
            pivot,
            axis: handleData.axis,
            axisDir,
            startAngle,
            targets,
        };
    }
    beginScaleDrag(selectedList, pivot, handleData, controller) {
        const axisDirections = this.getAxisDirections();
        let plane;
        let axisDir = null;
        if (handleData.kind === 'scale-axis') {
            axisDir = axisDirections[handleData.axis];
            plane = this.computeDragPlane(pivot, { kind: 'axis', axis: handleData.axis }, axisDirections, this.getPlaneNormals());
        }
        else {
            const eye = new THREE.Vector3().subVectors(xb.core.camera.position, pivot);
            if (eye.lengthSq() < 1e-8)
                eye.set(0, 0, 1);
            eye.normalize();
            plane = new THREE.Plane().setFromNormalAndCoplanarPoint(eye, pivot);
        }
        xb.core.input.setRaycasterFromController(controller);
        const startPoint = new THREE.Vector3();
        if (!xb.core.input.raycaster.ray.intersectPlane(plane, startPoint)) {
            return;
        }
        this.drag = {
            kind: 'scale',
            controller,
            plane,
            pivot,
            startPoint,
            handleData,
            axisDir,
            targets: selectedList.map((instance) => ({
                instance,
                viewer: instance.viewer,
                startPosition: instance.viewer.position.clone(),
                startScale: instance.viewer.scale.clone(),
                ownPivot: this.getPivotWorldPosition(instance.viewer),
            })),
        };
    }
    computeDragPlane(worldPosition, handleData, axisDirections, planeNormals) {
        let normal;
        if (handleData.kind === 'axis') {
            const axisDir = axisDirections[handleData.axis];
            const eye = new THREE.Vector3().subVectors(xb.core.camera.position, worldPosition);
            if (eye.lengthSq() < 1e-8)
                eye.set(0, 0, 1);
            eye.normalize();
            const align = new THREE.Vector3().crossVectors(eye, axisDir);
            if (align.lengthSq() < 1e-8) {
                // Ray nearly parallel to the axis: pick an arbitrary perpendicular.
                align.crossVectors(eye, axisDir.clone().add(new THREE.Vector3(0.1, 0.1, 0.1)));
            }
            normal = new THREE.Vector3().crossVectors(axisDir, align).normalize();
        }
        else {
            normal = planeNormals[handleData.plane].clone();
        }
        return new THREE.Plane().setFromNormalAndCoplanarPoint(normal, worldPosition);
    }
    /** Signed angle (radians) of the current mouse-ray/plane intersection
     * around `pivot`, measured in the ring's own in-plane basis. Recomputed
     * fresh via atan2 every call rather than accumulated, so it can't drift. */
    computeRingAngle(plane, pivot, axisName) {
        const { u, v } = RING_BASIS_BY_AXIS[axisName];
        const hit = new THREE.Vector3();
        if (!xb.core.input.raycaster.ray.intersectPlane(plane, hit))
            return null;
        const rel = hit.sub(pivot);
        return Math.atan2(rel.dot(v), rel.dot(u));
    }
    updateDrag() {
        if (!this.drag)
            return;
        if (this.drag.kind === 'rotate') {
            this.updateRotateDrag(this.drag);
        }
        else if (this.drag.kind === 'scale') {
            this.updateScaleDrag(this.drag);
        }
        else {
            this.updateTranslateDrag(this.drag);
        }
    }
    /** How far `point` (relative to `pivot`) ends up after applying
     * `transformFn` to it, expressed as a delta. Used to carry each
     * target's own pivot displacement over to its actual viewer.position --
     * see updateRotateDrag/updateScaleDrag. Zero whenever `point` already
     * equals `pivot`, which is what makes group rotate/scale reduce exactly
     * to single-object behavior when there's only one target. */
    computeOrbitDelta(point, pivot, transformFn) {
        const relative = point.clone().sub(pivot);
        const transformed = transformFn(relative.clone());
        return transformed.sub(relative);
    }
    updateRotateDrag(drag) {
        const { controller, plane, pivot, axis, axisDir, startAngle, targets } = drag;
        xb.core.input.setRaycasterFromController(controller);
        const currentAngle = this.computeRingAngle(plane, pivot, axis);
        if (currentAngle == null)
            return;
        const deltaAngle = currentAngle - startAngle;
        const deltaQuaternion = new THREE.Quaternion().setFromAxisAngle(axisDir, deltaAngle);
        for (const target of targets) {
            const offset = this.computeOrbitDelta(target.ownPivot, pivot, (relative) => relative.applyQuaternion(deltaQuaternion));
            target.viewer.position.copy(target.startPosition).add(offset);
            target.content.quaternion.multiplyQuaternions(deltaQuaternion, target.startQuaternion);
        }
    }
    updateTranslateDrag(drag) {
        const { controller, plane, startPoint, handleData, axisDir, planeAxes, targets, } = drag;
        xb.core.input.setRaycasterFromController(controller);
        const currentPoint = new THREE.Vector3();
        if (!xb.core.input.raycaster.ray.intersectPlane(plane, currentPoint))
            return;
        // Raw world-space offset on the drag plane, projected onto the
        // handle's own axis/plane basis (world-aligned or, in local space,
        // the primary object's own rotated axes -- see getAxisDirections()).
        // The same offset applies to every selected target -- translating a
        // rigid group moves every member by the same vector.
        const rawOffset = currentPoint.sub(startPoint);
        let offset;
        if (handleData.kind === 'axis' && axisDir) {
            offset = axisDir.clone().multiplyScalar(rawOffset.dot(axisDir));
        }
        else if (planeAxes) {
            const [u, v] = planeAxes;
            offset = u
                .clone()
                .multiplyScalar(rawOffset.dot(u))
                .addScaledVector(v, rawOffset.dot(v));
        }
        else {
            return;
        }
        for (const target of targets) {
            target.viewer.position.copy(target.startPosition).add(offset);
        }
    }
    updateScaleDrag(drag) {
        const { controller, plane, pivot, startPoint, handleData, axisDir, targets } = drag;
        xb.core.input.setRaycasterFromController(controller);
        const currentPoint = new THREE.Vector3();
        if (!xb.core.input.raycaster.ray.intersectPlane(plane, currentPoint))
            return;
        let scaleTransform;
        let axis;
        let ratio;
        if (handleData.kind === 'scale-uniform') {
            const startDist = startPoint.distanceTo(pivot);
            const currentDist = currentPoint.distanceTo(pivot);
            ratio = clampScaleRatio(currentDist / Math.max(startDist, MIN_SCALE_DENOMINATOR));
            scaleTransform = (relative) => relative.multiplyScalar(ratio);
            axis = null;
        }
        else if (axisDir) {
            axis = handleData.axis;
            const startOffset = new THREE.Vector3()
                .subVectors(startPoint, pivot)
                .dot(axisDir);
            const currentOffset = new THREE.Vector3()
                .subVectors(currentPoint, pivot)
                .dot(axisDir);
            const denom = Math.abs(startOffset) < MIN_SCALE_DENOMINATOR
                ? Math.sign(startOffset || 1) * MIN_SCALE_DENOMINATOR
                : startOffset;
            ratio = clampScaleRatio(currentOffset / denom);
            const capturedAxisDir = axisDir;
            scaleTransform = (relative) => relative.addScaledVector(capturedAxisDir, relative.dot(capturedAxisDir) * (ratio - 1));
        }
        else {
            return;
        }
        for (const target of targets) {
            const newScale = target.startScale.clone();
            if (axis == null) {
                newScale.multiplyScalar(ratio);
            }
            else {
                newScale[axis] = target.startScale[axis] * ratio;
            }
            target.viewer.scale.copy(clampScaleVector(newScale));
            const offset = this.computeOrbitDelta(target.ownPivot, pivot, scaleTransform);
            target.viewer.position.copy(target.startPosition).add(offset);
        }
    }
    endDrag() {
        if (this.drag)
            this.pushDragCommand(this.drag);
        this.drag = null;
    }
    pushDragCommand(drag) {
        if (!this.commandHistory)
            return;
        const commands = [];
        for (const target of drag.targets) {
            const viewer = target.viewer;
            const beforePosition = target.startPosition.clone();
            const afterPosition = viewer.position.clone();
            if (drag.kind === 'rotate') {
                const rotateTarget = target;
                const content = rotateTarget.content;
                const beforeQuaternion = rotateTarget.startQuaternion.clone();
                const afterQuaternion = content.quaternion.clone();
                if (beforePosition.equals(afterPosition) &&
                    beforeQuaternion.equals(afterQuaternion)) {
                    continue;
                }
                commands.push({
                    undo: () => {
                        viewer.position.copy(beforePosition);
                        content.quaternion.copy(beforeQuaternion);
                    },
                    redo: () => {
                        viewer.position.copy(afterPosition);
                        content.quaternion.copy(afterQuaternion);
                    },
                });
            }
            else if (drag.kind === 'scale') {
                const scaleTarget = target;
                const beforeScale = scaleTarget.startScale.clone();
                const afterScale = viewer.scale.clone();
                if (beforePosition.equals(afterPosition) &&
                    beforeScale.equals(afterScale))
                    continue;
                commands.push({
                    undo: () => {
                        viewer.position.copy(beforePosition);
                        viewer.scale.copy(beforeScale);
                    },
                    redo: () => {
                        viewer.position.copy(afterPosition);
                        viewer.scale.copy(afterScale);
                    },
                });
            }
            else {
                if (beforePosition.equals(afterPosition))
                    continue;
                commands.push({
                    undo: () => void viewer.position.copy(beforePosition),
                    redo: () => void viewer.position.copy(afterPosition),
                });
            }
        }
        this.commandHistory.pushBatch(commands);
    }
}

export { TransformGizmo };
