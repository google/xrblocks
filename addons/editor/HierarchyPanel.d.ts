import * as xb from 'xrblocks';
import type { SceneInstance, SceneManager } from './SceneManager';
import type { SelectionManager } from './SelectionManager';
interface RowEntry {
    row: HTMLDivElement;
    instance: SceneInstance;
    labelEl: HTMLSpanElement;
    visBtn: HTMLButtonElement;
    lockBtn: HTMLButtonElement;
    editing: boolean;
}
export interface HierarchyPanelOptions {
    parent?: HTMLElement;
}
/**
 * Basic outliner: one row per live scene instance, self-contained 2D HTML
 * overlay (builds and injects its own DOM/CSS).
 *
 * Row click selects (replacing the current selection); Shift+click reads
 * the DOM MouseEvent's own shiftKey directly to add/remove from the
 * selection -- unlike 3D-scene clicks (SelectionManager tracks shiftHeld
 * itself there, since SelectEvent carries no modifier info), a real
 * click event already has this for free.
 *
 * Each row also has a persisted visibility toggle, a session-only lock
 * toggle (SelectionManager excludes locked
 * instances from both 3D-click and hierarchy-row selection), and
 * double-click-to-edit the manifest's semantic label. Locks do not enter the
 * manifest or undo stack.
 *
 * Rows are only rebuilt when the instance set actually changes (id list
 * comparison) to avoid recreating DOM nodes every frame; per-row state
 * (selected class, visibility/lock button state, label text) is
 * refreshed every frame so the list stays in sync with 3D-click,
 * gizmo-driven selection, and direct instance mutation alike.
 */
export declare class HierarchyPanel extends xb.Script {
    sceneManager: SceneManager;
    selectionManager: SelectionManager;
    root: HTMLDivElement;
    listEl: HTMLDivElement;
    rowsById: Map<string, RowEntry>;
    lastIdsKey: string | null;
    constructor(sceneManager: SceneManager, selectionManager: SelectionManager, { parent }?: HierarchyPanelOptions);
    update(): void;
    computeFileNameCounts(list: SceneInstance[]): Map<string, number>;
    /** The manifest label wins, then the stable id, then the asset filename. */
    computeLabel(instance: SceneInstance, countByFileName: Map<string, number>): string;
    rebuildRows(list: SceneInstance[]): void;
    beginRename(instance: SceneInstance, labelEl: HTMLSpanElement): void;
    syncRows(countByFileName: Map<string, number>): void;
}
export {};
