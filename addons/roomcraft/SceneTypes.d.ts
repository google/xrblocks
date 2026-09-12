import type * as THREE from 'three';
/** Maximum instruction length, in UTF-16 code units like HTML maxlength. */
export declare const MAX_SCENE_REQUEST_CHARACTERS = 4000;
export declare const MAX_SCENE_OBJECTS = 48;
export declare const MAX_SCENE_DISTANCE = 10;
export declare const MIN_SCENE_SCALE = 0.05;
export declare const MAX_SCENE_SCALE = 5;
export declare const MAX_OBJECT_PARTS = 48;
export declare const MAX_SCENE_PARTS = 384;
export declare const MAX_PART_DEPTH = 8;
export declare const MAX_PART_DISTANCE = 5;
export declare const MIN_PART_SIZE = 0.01;
export declare const MAX_PART_SIZE = 5;
export declare const MIN_MOTION_PERIOD = 0.25;
export declare const MAX_MOTION_PERIOD = 60;
export declare const MAX_MOTION_AMPLITUDE: number;
export declare const MAX_MOTION_SPEED: number;
export declare const MIN_ENVIRONMENT_SIZE = 4;
export declare const MAX_ENVIRONMENT_SIZE = 20;
export declare const MIN_LANDSCAPE_SIZE = 0.2;
export declare const MAX_LANDSCAPE_SIZE = 20;
export declare const MIN_BANK_WIDTH = 0.05;
export declare const MAX_BANK_WIDTH = 1;
export declare const MIN_PATH_POINTS = 2;
export declare const MAX_PATH_POINTS = 12;
export declare const MIN_PATH_SEGMENT = 0.02;
export declare const MIN_PATH_WIDTH = 0.15;
export declare const MAX_PATH_WIDTH = 3;
export declare const MAX_SCATTER_COUNT = 128;
export declare const MAX_SCENE_SCATTER_COUNT = 1024;
export declare const MIN_SCATTER_HEIGHT = 0.1;
export declare const MAX_SCATTER_HEIGHT = 6;
export declare const MAX_SCATTER_SEED = 2147483647;
export declare const SCENE_PART_SHAPES: readonly ["box", "sphere", "cylinder", "cone", "capsule", "torus"];
export type SceneVector2 = [number, number];
export type SceneVector3 = [number, number, number];
export type ScenePartShape = (typeof SCENE_PART_SHAPES)[number];
export declare const SCENE_MOTION_AXES: readonly ["x", "y", "z"];
export type SceneMotionAxis = (typeof SCENE_MOTION_AXES)[number];
interface SceneMotionBase {
    /** Axis in the part's authored local coordinates. */
    axis: SceneMotionAxis;
    /** Hinge or axle in part-local meters, relative to its authored center. */
    pivot: SceneVector3;
    /** Starting fraction of a full cycle, from 0 to 1. Defaults to 0. */
    phase?: number;
}
export interface SceneSwingMotion extends SceneMotionBase {
    kind: 'swing';
    /** Angular travel on either side of the authored pose, in radians. */
    amplitude: number;
    /** Seconds per complete back-and-forth cycle. */
    period: number;
}
export interface SceneSpinMotion extends SceneMotionBase {
    kind: 'spin';
    /** Signed angular velocity in radians per second. */
    speed: number;
}
export type ScenePartMotion = SceneSwingMotion | SceneSpinMotion;
export declare const SCENE_TIMES_OF_DAY: readonly ["moonlight", "sunrise", "daylight", "sunset"];
export type SceneTimeOfDay = (typeof SCENE_TIMES_OF_DAY)[number];
/** A bounded virtual setting, independent of its editable objects. */
export interface SceneEnvironment {
    /** Width and depth of the ground in scene-local meters, centered at the origin. */
    size: SceneVector2;
    groundColor: string;
    /** Controls the owned sky and lighting, not the saved colors of scene objects. */
    timeOfDay: SceneTimeOfDay;
}
export interface ScenePond {
    kind: 'pond';
    /** Width and depth of the elliptical water surface, in local meters. */
    size: SceneVector2;
    bankWidth: number;
}
export interface ScenePath {
    kind: 'path';
    /** Ordered local X/Z center-line coordinates. */
    points: SceneVector2[];
    width: number;
}
export declare const SCENE_SCATTER_STYLES: readonly ["tree", "shrub", "rock", "grass", "flower"];
export type SceneScatterStyle = (typeof SCENE_SCATTER_STYLES)[number];
export interface SceneScatter {
    kind: 'scatter';
    style: SceneScatterStyle;
    /** Width and depth of the planting area; foliage may overhang its edges. */
    size: SceneVector2;
    count: number;
    /** A deterministic seed. Keep it unchanged when refining an existing planting. */
    seed: number;
    /** Maximum specimen height in meters. */
    height: number;
}
export type SceneLandscape = ScenePond | ScenePath | SceneScatter;
export interface ScenePart {
    /** Stable within this object, including across design refinements. */
    id: string;
    name: string;
    shape: ScenePartShape;
    /** Parent part ID, or null for a part relative to the object's origin. */
    parent: string | null;
    /** Authored center in parent-local meters. Parent size does not scale children. */
    position: SceneVector3;
    /** Authored rest-pose Euler angles in radians, applied in XYZ order. */
    rotation: SceneVector3;
    /** Physical width, height, and depth, not scale multipliers. */
    size: SceneVector3;
    /** A six-digit hexadecimal material color, multiplied by the object tint. */
    color: string;
    /** Optional local motion. Descendants move with this part; no code is executed. */
    motion?: ScenePartMotion;
}
export type ScenePartChanges = Partial<Omit<ScenePart, 'id' | 'motion'>> & {
    /** Replace the motion definition, or use null to return to the authored pose. */
    motion?: ScenePartMotion | null;
};
export type ScenePartEdit = {
    op: 'add';
    part: ScenePart;
} | {
    op: 'update';
    id: string;
    changes: ScenePartChanges;
} | {
    op: 'remove';
    id: string;
};
export interface SceneAssetDescription {
    id: string;
    description: string;
    /** Unscaled width, height, and depth in meters. */
    size: SceneVector3;
}
/**
 * A trusted, application-owned asset, not a URL supplied by a model.
 * Each factory must return a fresh, detached object with owned resources.
 * Roomcraft normalizes its bounds to `size`, centered in X/Z with its base at Y=0.
 */
export interface SceneAsset extends SceneAssetDescription {
    create(color: string): THREE.Object3D | Promise<THREE.Object3D>;
}
interface SceneObjectBase {
    id: string;
    name: string;
    /** Object origin in scene-local meters. Catalog assets are grounded here. */
    position: SceneVector3;
    /** Upright rotation about Y, in radians. */
    rotation: number;
    /** Multipliers of the asset size, procedural geometry, or landscape recipe. */
    scale: SceneVector3;
    /** Hex color; part tint or a landscape's primary foliage, water, or stone color. */
    color: string;
}
export interface SceneCatalogObject extends SceneObjectBase {
    asset: string;
    parts?: never;
    landscape?: never;
}
/** A new design made from parts, with no catalog entry or generated code. */
export interface SceneProceduralObject extends SceneObjectBase {
    asset?: never;
    parts: ScenePart[];
    landscape?: never;
}
/** A compact recipe for an editable landscape feature, not a catalog preset. */
export interface SceneLandscapeObject extends SceneObjectBase {
    asset?: never;
    parts?: never;
    landscape: SceneLandscape;
}
export type SceneObject = SceneCatalogObject | SceneProceduralObject | SceneLandscapeObject;
export interface SceneLayout {
    title: string;
    objects: SceneObject[];
    environment?: SceneEnvironment;
}
export type SceneObjectChanges = Partial<Omit<SceneObjectBase, 'id'>> & ({
    asset?: string;
    parts?: never;
    landscape?: never;
} | {
    asset?: never;
    parts?: ScenePart[];
    landscape?: never;
} | {
    asset?: never;
    parts?: never;
    landscape?: SceneLandscape;
});
export type SceneEdit = {
    op: 'add';
    object: SceneObject;
} | {
    op: 'update';
    id: string;
    changes: SceneObjectChanges;
    /** Targeted design edits; untouched parts and the object pose are kept. */
    partEdits?: ScenePartEdit[];
} | {
    op: 'remove';
    id: string;
};
export interface ScenePlan {
    title: string;
    edits: SceneEdit[];
    /** Patch scene-level settings, or remove the virtual environment with null. */
    environment?: Partial<SceneEnvironment> | null;
}
export interface SceneRequest {
    prompt: string;
    scene: SceneLayout;
    selectedId: string | null;
    catalog: SceneAssetDescription[];
    /** Local validation feedback, present only on the single correction attempt. */
    repair?: {
        reason: string;
    };
}
/**
 * A planner may call a server-side provider proxy instead of browser Gemini.
 * Its result must be a ScenePlan object or JSON text; it is always validated.
 */
export type ScenePlanner = (request: SceneRequest) => Promise<unknown>;
export interface RoomcraftOptions {
    /** Defaults to the built-in, entirely procedural catalog. */
    catalog?: SceneAsset[];
    /** Defaults to the AI subsystem configured in XR Blocks. */
    planner?: ScenePlanner;
    /**
     * Ask the planner once more when its plan fails local data validation.
     * Defaults to false. Provider, conflict, and asset-loading failures are not retried.
     */
    repairInvalidPlans?: boolean;
}
export type RoomcraftStatus = 'ready' | 'planning' | 'repairing' | 'loading' | 'placing';
export interface RoomcraftEventMap extends THREE.Object3DEventMap {
    change: {
        layout: SceneLayout;
    };
    selectionchange: {
        id: string | null;
    };
    statuschange: {
        status: RoomcraftStatus;
    };
    motionstatechange: {
        paused: boolean;
    };
}
export {};
