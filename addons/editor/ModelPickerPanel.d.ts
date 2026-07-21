import * as THREE from 'three';
import * as xb from 'xrblocks';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import type { SceneManager } from './SceneManager';
export interface ModelPickerPanelOptions {
    parent?: HTMLElement;
}
/**
 * Browses the files in the models directory and spawns independent copies
 * into the scene via SceneManager. Desktop/simulator-only 2D HTML overlay
 * (self-contained: builds and injects its own DOM/CSS, no markup required
 * from the consuming app) rather than a 3D SpatialPanel -- avoids the
 * spatial UI toolkit's lack of dropdown/list/text-input widgets and its
 * non-intuitive font-sizing behavior. Still an xb.Script purely to get a
 * free per-frame update() tick from the engine; it has no 3D presence of
 * its own.
 *
 * The preview thumbnail is its own tiny, fully independent THREE.js scene
 * + WebGLRenderer bound to its own <canvas> -- unrelated to the main
 * xrblocks scene/renderer. It loads the currently-browsed file via a raw
 * GLTFLoader (not xb.ModelViewer; no platform/drag markers needed for a
 * static thumbnail) each time Prev/Next changes the selection.
 */
export declare class ModelPickerPanel extends xb.Script {
    sceneManager: SceneManager;
    models: string[];
    pickerIndex: number;
    root: HTMLDivElement;
    nameLabel: HTMLSpanElement;
    statusLabel: HTMLDivElement;
    previewRenderer: THREE.WebGLRenderer;
    previewScene: THREE.Scene;
    previewCamera: THREE.PerspectiveCamera;
    previewRoot: THREE.Group;
    previewLoader: GLTFLoader;
    previewLoadToken: number;
    previewObject: THREE.Object3D | null;
    lastDirectoryRefresh: number;
    directoryRefreshInFlight: boolean;
    constructor(sceneManager: SceneManager, { parent }?: ModelPickerPanelOptions);
    setupPreview(canvas: HTMLCanvasElement): void;
    init(): Promise<void>;
    update(): void;
    /** Re-polls the models directory and reconciles the picker with
     * whatever changed, preferring to keep pointing at the currently-
     * browsed file (by name, not index) if it still exists -- adding/
     * removing an unrelated file elsewhere in the list shouldn't yank the
     * picker away from what the user was just looking at, or needlessly
     * reload its preview. */
    refreshModelsDirectory(): Promise<void>;
    arraysEqual(a: string[], b: string[]): boolean;
    readModelsDirectory(): Promise<string[]>;
    showPrevious(): void;
    showNext(): void;
    spawnCurrent(): Promise<void>;
    updateNameLabel(): void;
    updateNameLabelText(): void;
    loadPreview(fileName: string | undefined): Promise<void>;
    clearPreview(): void;
    /** Normalize to a ~1-unit bounding box, base resting on y=0, centered
     * on x/z -- keeps every model framed consistently regardless of its
     * raw scale, matching how SceneManager.fitViewer() normalizes spawned
     * instances (this preview is otherwise fully independent of it). */
    fitPreviewModel(object: THREE.Object3D): void;
    disposePreviewObject(object: THREE.Object3D): void;
    setStatus(text: string): void;
}
