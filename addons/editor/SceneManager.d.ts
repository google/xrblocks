import * as THREE from 'three';
import * as xb from 'xrblocks';
import type { CommandHistory } from './CommandHistory';
/** A live spawned instance: the loaded xb.ModelViewer plus editor-only
 * bookkeeping that isn't part of the model file itself. */
export interface SceneInstance {
    id: number;
    fileName: string;
    viewer: xb.ModelViewer;
    /** Auto-fit normalization factor captured at spawn time -- see spawn(). */
    baseScale: THREE.Vector3;
    customName: string | null;
    locked: boolean;
}
export interface SpawnTransform {
    position?: THREE.Vector3;
    scale?: THREE.Vector3;
    quaternion?: THREE.Quaternion;
}
export interface SpawnState {
    customName?: string | null;
    locked?: boolean;
    visible?: boolean;
}
export interface SpawnOptions {
    /** Optional \{position, quaternion, scale\} to apply after load instead of
     * the default spawn placement/auto-fit -- used by undo-of-delete and
     * scene import to restore an exact prior transform. */
    transform?: SpawnTransform | null;
    /** Optional \{customName, locked, visible\} to apply after load -- same
     * purpose as transform, restoring a prior instance's rename/lock/
     * visibility across undo-of-delete, duplicate, and scene import. */
    state?: SpawnState | null;
    /** Don't push an undo/redo command for this spawn (used internally by
     * undo/redo themselves, and by scene import which manages its own bulk
     * command). */
    skipHistory?: boolean;
}
export interface RemoveInstanceOptions {
    skipHistory?: boolean;
}
export interface SceneManagerOptions {
    /** Directory (relative to the page) to load .glb/.gltf files from.
     * Defaults to './Models/' -- the convention is a Models/ folder living
     * next to the consuming app's index.html, so any app using this addon
     * works out of the box without configuring a path. */
    modelsDir?: string;
    commandHistory?: CommandHistory | null;
}
/**
 * Owns every spawned model instance in the scene: loading, placement,
 * lookup, and disposal. Each spawn is an independent xb.ModelViewer with
 * its own transform, so the same source file can be loaded multiple times.
 */
export declare class SceneManager extends xb.Script {
    modelsDir: string;
    commandHistory: CommandHistory | null;
    instances: Map<number, SceneInstance>;
    nextId: number;
    occlusionEnabled: boolean;
    constructor({ modelsDir, commandHistory, }?: SceneManagerOptions);
    spawn(fileName: string, { transform, state, skipHistory }?: SpawnOptions): Promise<SceneInstance | null>;
    removeInstance(id: number, { skipHistory }?: RemoveInstanceOptions): void;
    removeAllInstances(): void;
    has(id: number): boolean;
    update(): void;
    /** Toggles simulator-room occlusion for every current instance, and for
     * every future spawn until toggled again. */
    setOcclusionEnabled(enabled: boolean): void;
    list(): SceneInstance[];
    /** Walks up from a raycast hit to find which spawned instance owns it. */
    getInstanceForObject(object: THREE.Object3D): SceneInstance | undefined;
    /** In front of the camera's current position and horizontal facing
     * direction, at a fixed height. Pitch (looking up/down) is ignored so
     * spawning while looking at the floor/ceiling doesn't place the object
     * far below/above the user. */
    getSpawnPosition(): THREE.Vector3;
    fitViewer(viewer: xb.ModelViewer): void;
    disposeObject(object: THREE.Object3D): void;
}
