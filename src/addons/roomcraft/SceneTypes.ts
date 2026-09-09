import type * as THREE from 'three';

export const MAX_SCENE_OBJECTS = 48;
export const MAX_SCENE_DISTANCE = 10;
export const MIN_SCENE_SCALE = 0.05;
export const MAX_SCENE_SCALE = 5;

export type SceneVector3 = [number, number, number];

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

export interface SceneObject {
  id: string;
  asset: string;
  name: string;
  /** Base position in scene-local meters. Positive Z faces the viewer. */
  position: SceneVector3;
  /** Upright rotation about Y, in radians. */
  rotation: number;
  /** Multipliers of the catalog asset's physical size. */
  scale: SceneVector3;
  /** A six-digit hexadecimal color. */
  color: string;
}

export interface SceneLayout {
  title: string;
  objects: SceneObject[];
}

export type SceneObjectChanges = Partial<Omit<SceneObject, 'id'>>;

export type SceneEdit =
  | {op: 'add'; object: SceneObject}
  | {op: 'update'; id: string; changes: SceneObjectChanges}
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
