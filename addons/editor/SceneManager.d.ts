import * as THREE from 'three';
import * as xb from 'xrblocks';
import type { CommandHistory } from './CommandHistory';
export interface SceneInstance {
    id: string;
    fileName: string;
    assetPath: string;
    object: THREE.Object3D;
    definition: xb.SimulatorObjectDefinition;
    locked: boolean;
}
export interface SpawnTransform {
    position?: THREE.Vector3;
    scale?: THREE.Vector3;
    quaternion?: THREE.Quaternion;
}
export interface SpawnState {
    label?: string | null;
    locked?: boolean;
    visible?: boolean;
    detectObject?: boolean;
    data?: unknown;
    physics?: xb.SimulatorPhysicsMode;
}
export interface SpawnOptions {
    transform?: SpawnTransform | null;
    state?: SpawnState | null;
    id?: string;
    skipHistory?: boolean;
}
export interface RemoveInstanceOptions {
    skipHistory?: boolean;
}
export interface SceneManagerOptions {
    modelsDir?: string;
    commandHistory?: CommandHistory | null;
}
/**
 * Thin editor adapter over the active simulator environment. The simulator
 * owns loading, disposal, physics, sensing, and object identity; this class
 * only adds editor state and undoable authoring operations.
 */
export declare class SceneManager extends xb.Script {
    modelsDir: string;
    commandHistory: CommandHistory | null;
    instances: Map<string, SceneInstance>;
    onEnvironmentChange: (() => void) | null;
    private manifest?;
    private simulatorObjects?;
    constructor({ modelsDir, commandHistory, }?: SceneManagerOptions);
    init(): void;
    update(): void;
    private syncEnvironment;
    spawn(fileName: string, { transform, state, id, skipHistory }?: SpawnOptions): Promise<SceneInstance | null>;
    commitInstances(instances: SceneInstance[]): Promise<void>;
    setLabel(instance: SceneInstance, label: string | null): Promise<void>;
    setVisible(instance: SceneInstance, visible: boolean): Promise<void>;
    removeInstance(id: string, { skipHistory }?: RemoveInstanceOptions): void;
    has(id: string): boolean;
    list(): SceneInstance[];
    getInstanceForObject(object: THREE.Object3D): SceneInstance | undefined;
    getSpawnWorldPosition(): THREE.Vector3;
    private placeInFrontOfCamera;
    private fitObject;
    private snapshot;
    private restore;
    private fileNameFor;
}
