import * as xb from 'xrblocks';
import type { SceneManager } from './SceneManager';
import type { SelectionManager } from './SelectionManager';
export interface ScenePanelOptions {
    /** Directory (relative to the page) to read/save scene .json files.
     * Defaults to './Scenes/' -- same next-to-index.html convention as
     * SceneManager's modelsDir. */
    scenesDir?: string;
    parent?: HTMLElement;
}
/**
 * Exports the current scene (every spawned instance's source file +
 * position/rotation/scale/customName/visible/locked) as a downloadable
 * JSON file, and imports one back via a Prev/Next picker over the .json
 * files found in scenesDir (same HTTP-directory-listing approach as
 * ModelPickerPanel.readModelsDirectory()). Self-contained 2D HTML overlay
 * (builds and injects its own DOM/CSS), not a 3D SpatialPanel -- same
 * reasoning as the picker and inspector panels.
 *
 * Workflow caveat: this is a static file server with no backend, so
 * export can only trigger a normal browser download (to Downloads) --
 * getting a saved scene into scenesDir so the Import picker can see it
 * requires moving/copying the file there once.
 *
 * Import is not undoable (same reasoning as Clear All): it's a bulk
 * clear+respawn, and one undo entry per restored object would flood the
 * history stack.
 */
export declare class ScenePanel extends xb.Script {
    sceneManager: SceneManager;
    selectionManager: SelectionManager;
    scenesDir: string;
    sceneFiles: string[];
    pickerIndex: number;
    root: HTMLDivElement;
    nameLabel: HTMLSpanElement;
    statusLabel: HTMLDivElement;
    occlusionButton: HTMLButtonElement;
    constructor(sceneManager: SceneManager, selectionManager: SelectionManager, { scenesDir, parent }?: ScenePanelOptions);
    toggleOcclusion(): void;
    updateOcclusionButton(): void;
    init(): Promise<void>;
    refreshSceneList(): Promise<void>;
    readSceneDirectory(): Promise<string[]>;
    showPrevious(): void;
    showNext(): void;
    updateNameLabel(): void;
    exportScene(): void;
    importScene(): Promise<void>;
    setStatus(text: string): void;
}
