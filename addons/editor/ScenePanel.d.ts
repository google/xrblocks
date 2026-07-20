import * as xb from 'xrblocks';
import type { SceneManager } from './SceneManager';
import type { SelectionManager } from './SelectionManager';
export interface ScenePanelOptions {
    /** Directory containing complete simulator environment manifests. */
    scenesDir?: string;
    parent?: HTMLElement;
}
/** Imports and exports the simulator's standard environment manifest. */
export declare class ScenePanel extends xb.Script {
    private sceneManager;
    private selectionManager;
    private options;
    sceneFiles: string[];
    pickerIndex: number;
    root: HTMLDivElement;
    nameLabel: HTMLSpanElement;
    statusLabel: HTMLDivElement;
    constructor(sceneManager: SceneManager, selectionManager: SelectionManager, options?: ScenePanelOptions);
    init(): Promise<void>;
    get scenesDir(): string;
    refreshSceneList(): Promise<void>;
    readSceneDirectory(): Promise<string[]>;
    showPrevious(): void;
    showNext(): void;
    updateNameLabel(): void;
    exportManifest(): void;
    importManifest(): Promise<void>;
    setStatus(text: string): void;
}
