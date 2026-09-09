import type * as THREE from 'three';

export const MAX_SCENE_OBJECTS = 48;
export const MAX_SCENE_DISTANCE = 10;
export const MIN_SCENE_SCALE = 0.05;
export const MAX_SCENE_SCALE = 5;
export const MAX_OBJECT_PARTS = 48;
export const MAX_SCENE_PARTS = 384;
export const MAX_PART_DEPTH = 8;
export const MAX_PART_DISTANCE = 5;
export const MIN_PART_SIZE = 0.01;
export const MAX_PART_SIZE = 5;
export const MIN_MOTION_PERIOD = 0.25;
export const MAX_MOTION_PERIOD = 60;
export const MAX_MOTION_AMPLITUDE = Math.PI;
export const MAX_MOTION_SPEED = Math.PI * 4;

export const SCENE_PART_SHAPES = [
  'box',
  'sphere',
  'cylinder',
  'cone',
  'capsule',
  'torus',
] as const;

export type SceneVector3 = [number, number, number];
export type ScenePartShape = (typeof SCENE_PART_SHAPES)[number];
export const SCENE_MOTION_AXES = ['x', 'y', 'z'] as const;
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

export type ScenePartEdit =
  | {op: 'add'; part: ScenePart}
  | {op: 'update'; id: string; changes: ScenePartChanges}
  | {op: 'remove'; id: string};

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
  /** Multipliers of the asset size or the authored procedural geometry. */
  scale: SceneVector3;
  /** Hexadecimal color; white preserves individual procedural part colors. */
  color: string;
}

export interface SceneCatalogObject extends SceneObjectBase {
  asset: string;
  parts?: never;
}

/** A new design made from parts, with no catalog entry or generated code. */
export interface SceneProceduralObject extends SceneObjectBase {
  asset?: never;
  parts: ScenePart[];
}

export type SceneObject = SceneCatalogObject | SceneProceduralObject;

export interface SceneLayout {
  title: string;
  objects: SceneObject[];
}

export type SceneObjectChanges = Partial<Omit<SceneObjectBase, 'id'>> &
  ({asset?: string; parts?: never} | {asset?: never; parts?: ScenePart[]});

export type SceneEdit =
  | {op: 'add'; object: SceneObject}
  | {
      op: 'update';
      id: string;
      changes: SceneObjectChanges;
      /** Targeted design edits; untouched parts and the object pose are kept. */
      partEdits?: ScenePartEdit[];
    }
  | {op: 'remove'; id: string};

export interface ScenePlan {
  title: string;
  edits: SceneEdit[];
}

export interface SceneRequest {
  prompt: string;
  scene: SceneLayout;
  selectedId: string | null;
  catalog: SceneAssetDescription[];
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
}

export type RoomcraftStatus = 'ready' | 'planning' | 'loading' | 'placing';

export interface RoomcraftEventMap extends THREE.Object3DEventMap {
  change: {layout: SceneLayout};
  selectionchange: {id: string | null};
  statuschange: {status: RoomcraftStatus};
  motionstatechange: {paused: boolean};
}
