import * as THREE from 'three';
import { AI, Script, World, type ManipulationEvent, type SelectEvent } from 'xrblocks';
import { type RoomcraftEventMap, type RoomcraftOptions, type RoomcraftStatus, type SceneAssetDescription, type SceneLayout } from './SceneTypes';
/**
 * Composes trusted assets, procedural designs, and environments using AI edits.
 * Add it to XR Blocks before initialization, then call `request` or load a
 * hand-authored layout with `applyLayout`. No AI call is made on initialization.
 */
export declare class Roomcraft extends Script<RoomcraftEventMap> {
    static dependencies: {
        ai: typeof AI;
        world: typeof World;
        camera: typeof THREE.Camera;
        timer: typeof THREE.Timer;
    };
    private readonly assets;
    private readonly entities;
    private readonly ownerIds;
    private readonly planner?;
    private readonly repairInvalidPlans;
    private readonly history;
    private readonly future;
    private redoBase?;
    private ai?;
    private world?;
    private camera?;
    private timer?;
    private motionIsPaused;
    private environment?;
    private environmentContent?;
    private title;
    private currentStatus;
    private selection;
    private disposed;
    constructor(options?: RoomcraftOptions);
    init({ ai, world, camera, timer, }: {
        ai: AI;
        world: World;
        camera: THREE.Camera;
        timer?: THREE.Timer;
    }): void;
    /** Detached metadata only; factories and model URLs never reach the planner. */
    get catalog(): SceneAssetDescription[];
    /** Whether any authored part has a motion definition, including when paused. */
    get hasMotion(): boolean;
    /** Playback inspection state; not part of the saved layout or undo history. */
    get motionPaused(): boolean;
    /** Pause or resume local part motion without changing its authored definition. */
    setMotionPaused(paused: boolean): void;
    update(): void;
    /** A detached snapshot of the setting, live transforms, and authored recipes. */
    get layout(): SceneLayout;
    get status(): RoomcraftStatus;
    get busy(): boolean;
    get canUndo(): boolean;
    /** Redo never overwrites changes made since the last history operation. */
    get canRedo(): boolean;
    get selectedId(): string | null;
    /** The stable manipulation owner. Change its transform, not its hierarchy. */
    getObject(id: string): THREE.Object3D | undefined;
    /**
     * Bounds of the authored objects in world space, including full motion envelopes.
     * Includes virtual ground, but not sky. An empty scene has an empty box.
     *
     * @param id - One object ID, or omit it to include the whole composition.
     */
    getWorldBounds(id?: string): THREE.Box3;
    select(id: string | null): void;
    /** Replace the scene explicitly, for curated examples or saved layouts. */
    applyLayout(value: unknown): Promise<SceneLayout>;
    /** Apply explicit add/update/remove operations without invoking AI. */
    applyPlan(value: unknown): Promise<SceneLayout>;
    /** Refine the current scene; selection and actual transforms are sent as context. */
    request(prompt: string): Promise<SceneLayout>;
    private requestPlan;
    /** Undo the last successful scene edit, including explicit scene replacements. */
    undo(): Promise<SceneLayout>;
    /** Reapply an undone scene edit without asking the planner again. */
    redo(): Promise<SceneLayout>;
    /**
     * Place the whole composition on a detected horizontal surface that fits it.
     * Returns false without moving the scene if no suitable surface is available.
     * Virtual environments already own a ground plane and cannot use this placement.
     * This is session-local placement, not a persistent spatial anchor.
     */
    placeOnSurface(): Promise<boolean>;
    onObjectSelectStart(event: SelectEvent): void;
    onObjectManipulate(event: ManipulationEvent): void;
    dispose(): void;
    private commitLayout;
    private run;
    private setStatus;
    private assertAlive;
    private findOwner;
}
