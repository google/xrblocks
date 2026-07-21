import * as THREE from 'three';
import * as xb from 'xrblocks';
import type { SelectEvent } from 'xrblocks';
import type { CommandHistory } from './CommandHistory';
import type { SceneInstance } from './SceneManager';
import type { SelectionManager } from './SelectionManager';
type AxisName = 'x' | 'y' | 'z';
type PlaneName = 'xy' | 'yz' | 'xz';
type HandleKind = 'axis' | 'plane' | 'ring' | 'scale-axis' | 'scale-uniform';
interface HandleUserData {
    kind: HandleKind;
    axis?: AxisName;
    plane?: PlaneName;
}
interface HandleRecord {
    pick: THREE.Object3D;
    material: THREE.MeshBasicMaterial;
    baseColor: number;
    baseOpacity?: number;
    hoverOpacity?: number;
}
interface TranslateTarget {
    instance: SceneInstance;
    object: THREE.Object3D;
    startPosition: THREE.Vector3;
}
interface RotateTarget {
    instance: SceneInstance;
    object: THREE.Object3D;
    startPosition: THREE.Vector3;
    startQuaternion: THREE.Quaternion;
    startWorldQuaternion: THREE.Quaternion;
    ownPivot: THREE.Vector3;
}
interface ScaleTarget {
    instance: SceneInstance;
    object: THREE.Object3D;
    startPosition: THREE.Vector3;
    startScale: THREE.Vector3;
    ownPivot: THREE.Vector3;
}
interface TranslateDrag {
    kind: 'translate';
    controller: THREE.Object3D;
    plane: THREE.Plane;
    startPoint: THREE.Vector3;
    handleData: HandleUserData;
    axisDir: THREE.Vector3 | null;
    planeAxes: [THREE.Vector3, THREE.Vector3] | null;
    targets: TranslateTarget[];
}
interface RotateDrag {
    kind: 'rotate';
    controller: THREE.Object3D;
    plane: THREE.Plane;
    pivot: THREE.Vector3;
    axis: AxisName;
    axisDir: THREE.Vector3;
    startAngle: number;
    targets: RotateTarget[];
}
interface ScaleDrag {
    kind: 'scale';
    controller: THREE.Object3D;
    plane: THREE.Plane;
    pivot: THREE.Vector3;
    startPoint: THREE.Vector3;
    handleData: HandleUserData;
    axisDir: THREE.Vector3 | null;
    targets: ScaleTarget[];
}
type DragState = TranslateDrag | RotateDrag | ScaleDrag;
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
export declare class TransformGizmo extends xb.Script {
    selectionManager: SelectionManager;
    commandHistory: CommandHistory | null;
    translateHandles: THREE.Group<THREE.Object3DEventMap>;
    rotateHandles: THREE.Group<THREE.Object3DEventMap>;
    scaleHandles: THREE.Group<THREE.Object3DEventMap>;
    handleRecords: HandleRecord[];
    drag: DragState | null;
    hoveredRecord: HandleRecord | null;
    constructor(selectionManager: SelectionManager, commandHistory?: CommandHistory | null);
    update(): void;
    /** In local space, aligns the gizmo's own orientation with the primary
     * (active) object's current content quaternion -- since every handle
     * (axis/plane/ring) is built parent-relative to this object already,
     * this alone reorients all of them at once for both rendering and
     * raycasting, no per-handle changes needed. Identity in world space. */
    syncOrientation(): void;
    /** Axis directions in world space for the current space mode -- world
     * axes in 'world' space, or the primary object's own (rotated) axes in
     * 'local' space. Derived from this.quaternion (kept in sync by
     * syncOrientation() every frame) rather than re-reading the primary's
     * quaternion directly, so it's consistent with whatever the gizmo is
     * currently displaying. */
    getAxisDirections(): Record<AxisName, THREE.Vector3>;
    getPlaneNormals(): Record<PlaneName, THREE.Vector3>;
    getPlaneAxisPair(planeName: PlaneName, axisDirections: Record<AxisName, THREE.Vector3>): [THREE.Vector3, THREE.Vector3];
    /** World-space center of the object's bounding box, not its base/origin -
     * Uses rendered world-space bounds rather than assuming an asset's origin
     * is its visual center. */
    getPivotWorldPosition(object: THREE.Object3D): THREE.Vector3;
    /** Centroid of every selected instance's own pivot. For a single
     * selection this is exactly that instance's own pivot, which is what
     * makes the group translate/rotate/scale math below reduce to today's
     * single-object behavior automatically -- see the drag update methods. */
    computeGroupPivot(selectedList: SceneInstance[]): THREE.Vector3;
    getActiveHandles(): THREE.Object3D[];
    updateHover(): void;
    findRecord(pickObject: THREE.Object3D): HandleRecord | null;
    setHoveredRecord(record: HandleRecord | null): void;
    applyHighlight(record: HandleRecord, highlighted: boolean): void;
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
    hitTestActiveHandle(controller: THREE.Object3D): THREE.Intersection | null;
    onSelectStart(event: SelectEvent): void;
    onSelectEnd(event: SelectEvent): void;
    beginDrag(selectedList: SceneInstance[], handleData: HandleUserData, controller: THREE.Object3D): void;
    beginRotateDrag(selectedList: SceneInstance[], pivot: THREE.Vector3, handleData: HandleUserData, controller: THREE.Object3D): void;
    beginScaleDrag(selectedList: SceneInstance[], pivot: THREE.Vector3, handleData: HandleUserData, controller: THREE.Object3D): void;
    computeDragPlane(worldPosition: THREE.Vector3, handleData: HandleUserData, axisDirections: Record<AxisName, THREE.Vector3>, planeNormals: Record<PlaneName, THREE.Vector3>): THREE.Plane;
    /** Signed angle (radians) of the current mouse-ray/plane intersection
     * around `pivot`, measured in the ring's own in-plane basis. Recomputed
     * fresh via atan2 every call rather than accumulated, so it can't drift. */
    computeRingAngle(plane: THREE.Plane, pivot: THREE.Vector3, axisName: AxisName): number | null;
    updateDrag(): void;
    /** How far `point` (relative to `pivot`) ends up after applying
     * `transformFn` to it, expressed as a delta. Used to carry each
     * target's own pivot displacement over to its object position --
     * see updateRotateDrag/updateScaleDrag. Zero whenever `point` already
     * equals `pivot`, which is what makes group rotate/scale reduce exactly
     * to single-object behavior when there's only one target. */
    computeOrbitDelta(point: THREE.Vector3, pivot: THREE.Vector3, transformFn: (relative: THREE.Vector3) => THREE.Vector3): THREE.Vector3;
    applyWorldOffset(object: THREE.Object3D, startPosition: THREE.Vector3, offset: THREE.Vector3): void;
    applyWorldQuaternion(object: THREE.Object3D, quaternion: THREE.Quaternion): void;
    updateRotateDrag(drag: RotateDrag): void;
    updateTranslateDrag(drag: TranslateDrag): void;
    updateScaleDrag(drag: ScaleDrag): void;
    endDrag(): void;
    pushDragCommand(drag: DragState): void;
    dispose(): void;
}
export {};
