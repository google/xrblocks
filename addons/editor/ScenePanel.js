import * as THREE from 'three';
import * as xb from 'xrblocks';
import { el } from './dom.js';
import { injectEditorStyles } from './styles.js';

const SCENE_EXTENSION = /\.json$/i;
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
class ScenePanel extends xb.Script {
    constructor(sceneManager, selectionManager, { scenesDir = './Scenes/', parent = document.body } = {}) {
        super();
        this.sceneFiles = [];
        this.pickerIndex = 0;
        this.sceneManager = sceneManager;
        this.selectionManager = selectionManager;
        this.scenesDir = scenesDir;
        injectEditorStyles();
        this.nameLabel = el('span', { className: 'xrblocks-editor-name' });
        this.statusLabel = el('div', { className: 'status' });
        this.occlusionButton = el('button', { className: 'accent' });
        const exportBtn = el('button', {
            className: 'accent',
            textContent: 'Export Scene',
        });
        const prevBtn = el('button', { textContent: 'Prev' });
        const nextBtn = el('button', { textContent: 'Next' });
        const importBtn = el('button', {
            className: 'accent',
            textContent: 'Import Scene',
        });
        exportBtn.addEventListener('click', () => this.exportScene());
        prevBtn.addEventListener('click', () => this.showPrevious());
        nextBtn.addEventListener('click', () => this.showNext());
        importBtn.addEventListener('click', () => this.importScene());
        this.occlusionButton.addEventListener('click', () => this.toggleOcclusion());
        this.root = el('div', { id: 'xrblocks-editor-scene', className: 'xr-panel' }, el('div', { className: 'title', textContent: 'Scene' }), el('div', { className: 'row' }, this.occlusionButton), el('div', { className: 'row' }, exportBtn), el('div', { className: 'row' }, prevBtn, this.nameLabel, nextBtn), el('div', { className: 'row' }, importBtn), this.statusLabel);
        parent.appendChild(this.root);
        this.updateOcclusionButton();
    }
    toggleOcclusion() {
        this.sceneManager.setOcclusionEnabled(!this.sceneManager.occlusionEnabled);
        this.updateOcclusionButton();
    }
    updateOcclusionButton() {
        this.occlusionButton.textContent = `Occlusion: ${this.sceneManager.occlusionEnabled ? 'On' : 'Off'}`;
    }
    async init() {
        await this.refreshSceneList();
    }
    async refreshSceneList() {
        try {
            this.sceneFiles = await this.readSceneDirectory();
        }
        catch (error) {
            console.error('[ScenePanel] Failed to read Scenes directory:', error);
            this.sceneFiles = [];
        }
        this.pickerIndex = 0;
        this.updateNameLabel();
    }
    async readSceneDirectory() {
        const res = await fetch(`${this.scenesDir}?t=${Date.now()}`, {
            cache: 'no-store',
        });
        if (!res.ok) {
            throw new Error(`Directory request failed: ${res.status}`);
        }
        const html = await res.text();
        const doc = new DOMParser().parseFromString(html, 'text/html');
        const names = new Set();
        for (const link of doc.querySelectorAll('a[href]')) {
            const href = link.getAttribute('href') ?? '';
            const path = decodeURIComponent(href.split(/[?#]/)[0]);
            const name = path.split('/').filter(Boolean).pop() ?? '';
            if (SCENE_EXTENSION.test(name))
                names.add(name);
        }
        return [...names].sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
    }
    showPrevious() {
        if (this.sceneFiles.length === 0)
            return;
        this.pickerIndex =
            (this.pickerIndex - 1 + this.sceneFiles.length) % this.sceneFiles.length;
        this.updateNameLabel();
    }
    showNext() {
        if (this.sceneFiles.length === 0)
            return;
        this.pickerIndex = (this.pickerIndex + 1) % this.sceneFiles.length;
        this.updateNameLabel();
    }
    updateNameLabel() {
        if (this.sceneFiles.length === 0) {
            this.nameLabel.textContent = '(no saved scenes)';
            return;
        }
        const fileName = this.sceneFiles[this.pickerIndex];
        this.nameLabel.textContent = `${fileName} (${this.pickerIndex + 1}/${this.sceneFiles.length})`;
    }
    exportScene() {
        const objects = this.sceneManager
            .list()
            .map((instance) => {
            const content = instance.viewer.modelScene;
            const quaternion = content
                ? content.quaternion
                : new THREE.Quaternion();
            return {
                fileName: instance.fileName,
                position: instance.viewer.position.toArray(),
                quaternion: quaternion.toArray(),
                scale: instance.viewer.scale.toArray(),
                customName: instance.customName,
                visible: instance.viewer.visible,
                locked: instance.locked,
            };
        });
        const scene = {
            version: 1,
            savedAt: new Date().toISOString(),
            objects,
        };
        const blob = new Blob([JSON.stringify(scene, null, 2)], {
            type: 'application/json',
        });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `scene-${Date.now()}.json`;
        document.body.appendChild(link);
        link.click();
        link.remove();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
        this.setStatus(`Exported ${objects.length} object(s). Move the download into Scenes/ to import it later.`);
    }
    async importScene() {
        if (this.sceneFiles.length === 0) {
            this.setStatus('No .json files found in Scenes/');
            return;
        }
        const fileName = this.sceneFiles[this.pickerIndex];
        this.setStatus(`Importing ${fileName}...`);
        let scene;
        try {
            const res = await fetch(`${this.scenesDir}${fileName}?t=${Date.now()}`, {
                cache: 'no-store',
            });
            if (!res.ok)
                throw new Error(`Fetch failed: ${res.status}`);
            scene = await res.json();
        }
        catch (error) {
            console.error(`[ScenePanel] Failed to load ${fileName}:`, error);
            this.setStatus(`Failed to load ${fileName}`);
            return;
        }
        this.selectionManager.clearSelection();
        this.sceneManager.removeAllInstances();
        let spawnedCount = 0;
        for (const obj of scene.objects ?? []) {
            const transform = {
                position: new THREE.Vector3().fromArray(obj.position ?? [0, 0, 0]),
                quaternion: new THREE.Quaternion().fromArray(obj.quaternion ?? [0, 0, 0, 1]),
                scale: new THREE.Vector3().fromArray(obj.scale ?? [1, 1, 1]),
            };
            // Older scene files predate customName/visible/locked -- default to
            // unnamed/shown/unlocked so they still import cleanly.
            const state = {
                customName: obj.customName ?? null,
                visible: obj.visible ?? true,
                locked: obj.locked ?? false,
            };
            const instance = await this.sceneManager.spawn(obj.fileName, {
                transform,
                state,
                skipHistory: true,
            });
            if (instance)
                spawnedCount++;
        }
        this.setStatus(`Imported ${spawnedCount} object(s) from ${fileName}`);
    }
    setStatus(text) {
        this.statusLabel.textContent = text;
    }
}

export { ScenePanel };
