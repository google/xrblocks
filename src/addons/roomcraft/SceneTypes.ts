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

export interface ScenePart {
  /** Stable within this object, including across design refinements. */
  id: string;
  name: string;
  shape: ScenePartShape;
  /** Parent part ID, or null for a part relative to the object's origin. */
  parent: string | null;
  /** Center in parent-local meters. Parent size does not scale its children. */
  position: SceneVector3;
  /** Euler angles in radians, applied in XYZ order. */
  rotation: SceneVector3;
  /** Physical width, height, and depth, not scale multipliers. */
  size: SceneVector3;
  /** A six-digit hexadecimal material color, multiplied by the object tint. */
  color: string;
}

export type ScenePartChanges = Partial<Omit<ScenePart, 'id'>>;

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
}
