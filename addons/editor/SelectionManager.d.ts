import * as THREE from 'three';
import * as xb from 'xrblocks';
import type { SelectEvent } from 'xrblocks';
import type { SceneInstance, SceneManager } from './SceneManager';
import type { TransformGizmo } from './TransformGizmo';
export type ToolMode = 'select' | 'translate' | 'rotate' | 'scale';
export type TransformSpace = 'world' | 'local';
/**
 * Tracks which spawned instance(s) are selected (multi-select via
 * Shift+click, both in the 3D scene and the hierarchy panel), shows a
 * per-object bounding-box highlight, and exposes the active gizmo tool
 * mode + coordinate space via keyboard shortcuts (digits 1-4, Esc, F,
 * Ctrl+A). Desktop mouse only -- real XR controller selection is
 * permanently out of scope for this addon.
 */
export declare class SelectionManager extends xb.Script {
    sceneManager: SceneManager;
    selectedSet: Set<SceneInstance>;
    primary: SceneInstance | null;
    mode: ToolMode;
    space: TransformSpace;
    shiftHeld: boolean;
    onSelectionChange: ((selected: SceneInstance[]) => void) | null;
    transformGizmo: TransformGizmo | null;
    /** Set every frame by SceneEditor: true only while the simulator is
     * running, its interaction mode is Editor, and no real XR session is
     * active. Gates 3D-click selection, keyboard shortcuts, and highlight
     * visibility -- false doesn't clear the selection (so switching back to
     * Editor mode restores exactly where you left off), it just makes the
     * editor visually and interactively inert everywhere else. */
    editorActive: boolean;
    highlights: Map<SceneInstance, THREE.Box3Helper>;
    constructor(sceneManager: SceneManager);
    selectedList(): SceneInstance[];
    isSelected(instance: SceneInstance): boolean;
    select(instance: SceneInstance | null, { additive }?: {
        additive?: boolean;
    }): void;
    clearSelection(): void;
    syncHighlights(): void;
    update(): void;
    onSelectStart(event: SelectEvent): void;
    hasUserDataFlag(object: THREE.Object3D, flag: string): boolean;
    frameSelected(): void;
    selectAll(): void;
    onKeyDown(event: KeyboardEvent): void;
    onKeyUp(event: KeyboardEvent): void;
}
