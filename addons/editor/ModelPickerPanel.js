import * as THREE from 'three';
import * as xb from 'xrblocks';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { el } from './dom.js';
import { injectEditorStyles } from './styles.js';

const MODEL_EXTENSIONS = /\.(glb|gltf)$/i;
const PREVIEW_SIZE = 110;
const PREVIEW_ROTATE_SPEED = 0.01;
// Normalizing to exactly a 1-unit box leaves ~no margin at the camera's
// current distance/FOV, so odd-aspect models (tall/thin, wide/flat) were
// clipping at the frame edges. Scaling to 85% of that leaves headroom.
const PREVIEW_FIT_SCALE = 0.85;
// How often to re-poll the models directory for files added/removed while
// the app is running. A plain HTTP directory listing has no push/watch
// API, so this is just periodic re-fetching -- cheap enough at this
// interval.
const DIRECTORY_REFRESH_INTERVAL_MS = 3000;
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
class ModelPickerPanel extends xb.Script {
    constructor(sceneManager, { parent = document.body } = {}) {
        super();
        this.models = [];
        this.pickerIndex = 0;
        this.previewLoadToken = 0;
        this.previewObject = null;
        this.lastDirectoryRefresh = 0;
        this.directoryRefreshInFlight = false;
        this.sceneManager = sceneManager;
        injectEditorStyles();
        this.nameLabel = el('span', { className: 'xrblocks-editor-name' });
        this.statusLabel = el('div', { className: 'status' });
        const previewCanvas = el('canvas', {
            className: 'xrblocks-editor-preview-canvas',
            width: PREVIEW_SIZE,
            height: PREVIEW_SIZE,
        });
        const prevBtn = el('button', { textContent: 'Prev' });
        const spawnBtn = el('button', { className: 'accent', textContent: 'Spawn' });
        const nextBtn = el('button', { textContent: 'Next' });
        prevBtn.addEventListener('click', () => this.showPrevious());
        nextBtn.addEventListener('click', () => this.showNext());
        spawnBtn.addEventListener('click', () => this.spawnCurrent());
        this.root = el('div', { id: 'xrblocks-editor-model-picker', className: 'xr-panel' }, el('div', { className: 'title', textContent: 'Model Picker' }), el('div', { className: 'row' }, this.nameLabel), el('div', { className: 'row' }, previewCanvas), el('div', { className: 'row' }, prevBtn, spawnBtn, nextBtn), this.statusLabel);
        parent.appendChild(this.root);
        this.setupPreview(previewCanvas);
    }
    setupPreview(canvas) {
        this.previewRenderer = new THREE.WebGLRenderer({
            canvas,
            alpha: true,
            antialias: true,
        });
        this.previewRenderer.setPixelRatio(window.devicePixelRatio || 1);
        this.previewRenderer.setSize(PREVIEW_SIZE, PREVIEW_SIZE, false);
        this.previewScene = new THREE.Scene();
        this.previewScene.add(new THREE.HemisphereLight(0xffffff, 0x777777, 3));
        const keyLight = new THREE.DirectionalLight(0xffffff, 2.2);
        keyLight.position.set(1, 3, 2);
        this.previewScene.add(keyLight);
        this.previewCamera = new THREE.PerspectiveCamera(35, 1, 0.05, 10);
        this.previewCamera.position.set(0, 0.55, 1.6);
        this.previewCamera.lookAt(0, 0.35, 0);
        this.previewRoot = new THREE.Group();
        this.previewScene.add(this.previewRoot);
        this.previewLoader = new GLTFLoader();
    }
    async init() {
        this.setStatus('Loading models...');
        try {
            this.models = await this.readModelsDirectory();
        }
        catch (error) {
            console.error('[ModelPickerPanel] Failed to read models directory:', error);
            this.setStatus(`Could not read ${this.sceneManager.modelsDir}`);
            return;
        }
        if (this.models.length === 0) {
            this.setStatus('No .glb or .gltf models found');
        }
        else {
            this.updateNameLabel();
            this.setStatus('');
        }
        this.lastDirectoryRefresh = performance.now();
        this.directoryRefreshInFlight = false;
    }
    update() {
        const now = performance.now();
        if (!this.directoryRefreshInFlight &&
            now - this.lastDirectoryRefresh > DIRECTORY_REFRESH_INTERVAL_MS) {
            this.lastDirectoryRefresh = now;
            this.refreshModelsDirectory();
        }
        if (this.previewObject) {
            this.previewObject.rotation.y += PREVIEW_ROTATE_SPEED;
        }
        this.previewRenderer?.render(this.previewScene, this.previewCamera);
    }
    /** Re-polls the models directory and reconciles the picker with
     * whatever changed, preferring to keep pointing at the currently-
     * browsed file (by name, not index) if it still exists -- adding/
     * removing an unrelated file elsewhere in the list shouldn't yank the
     * picker away from what the user was just looking at, or needlessly
     * reload its preview. */
    async refreshModelsDirectory() {
        this.directoryRefreshInFlight = true;
        let models;
        try {
            models = await this.readModelsDirectory();
        }
        catch (error) {
            console.error('[ModelPickerPanel] Failed to refresh models directory:', error);
            return;
        }
        finally {
            this.directoryRefreshInFlight = false;
        }
        if (this.arraysEqual(models, this.models))
            return;
        const currentFileName = this.models[this.pickerIndex];
        this.models = models;
        if (this.models.length === 0) {
            this.pickerIndex = 0;
            this.updateNameLabelText();
            this.clearPreview();
            this.setStatus('No .glb or .gltf models found');
            return;
        }
        const preservedIndex = currentFileName
            ? this.models.indexOf(currentFileName)
            : -1;
        this.pickerIndex =
            preservedIndex >= 0
                ? preservedIndex
                : Math.min(this.pickerIndex, this.models.length - 1);
        if (this.models[this.pickerIndex] !== currentFileName) {
            // The previously-browsed file is gone -- move on and reload the
            // preview for whatever's now at this index.
            this.updateNameLabel();
        }
        else {
            // Same file, list just grew/shrank elsewhere -- only the "(i/N)"
            // count needs refreshing, not the preview.
            this.updateNameLabelText();
        }
        if (this.statusLabel.textContent === 'No .glb or .gltf models found') {
            this.setStatus('');
        }
    }
    arraysEqual(a, b) {
        if (a.length !== b.length)
            return false;
        return a.every((value, index) => value === b[index]);
    }
    async readModelsDirectory() {
        const res = await fetch(`${this.sceneManager.modelsDir}?t=${Date.now()}`, {
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
            if (MODEL_EXTENSIONS.test(name))
                names.add(name);
        }
        return [...names].sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
    }
    showPrevious() {
        if (this.models.length === 0)
            return;
        this.pickerIndex =
            (this.pickerIndex - 1 + this.models.length) % this.models.length;
        this.updateNameLabel();
    }
    showNext() {
        if (this.models.length === 0)
            return;
        this.pickerIndex = (this.pickerIndex + 1) % this.models.length;
        this.updateNameLabel();
    }
    async spawnCurrent() {
        if (this.models.length === 0)
            return;
        const fileName = this.models[this.pickerIndex];
        const instance = await this.sceneManager.spawn(fileName);
        this.setStatus(instance ? '' : `Failed to spawn ${fileName}`);
    }
    updateNameLabel() {
        this.updateNameLabelText();
        this.loadPreview(this.models[this.pickerIndex]);
    }
    updateNameLabelText() {
        if (this.models.length === 0) {
            this.nameLabel.textContent = '';
            return;
        }
        const fileName = this.models[this.pickerIndex] ?? '';
        this.nameLabel.textContent = `${fileName} (${this.pickerIndex + 1}/${this.models.length})`;
    }
    async loadPreview(fileName) {
        const token = ++this.previewLoadToken;
        this.clearPreview();
        if (!fileName)
            return;
        try {
            const gltf = await this.previewLoader.loadAsync(`${this.sceneManager.modelsDir}${fileName}`);
            if (token !== this.previewLoadToken) {
                this.disposePreviewObject(gltf.scene);
                return;
            }
            this.fitPreviewModel(gltf.scene);
            this.previewRoot.add(gltf.scene);
            this.previewObject = gltf.scene;
        }
        catch (error) {
            console.error(`[ModelPickerPanel] Failed to load preview for ${fileName}:`, error);
        }
    }
    clearPreview() {
        if (!this.previewObject)
            return;
        this.previewRoot.remove(this.previewObject);
        this.disposePreviewObject(this.previewObject);
        this.previewObject = null;
    }
    /** Normalize to a ~1-unit bounding box, base resting on y=0, centered
     * on x/z -- keeps every model framed consistently regardless of its
     * raw scale, matching how SceneManager.fitViewer() normalizes spawned
     * instances (this preview is otherwise fully independent of it). */
    fitPreviewModel(object) {
        const box = new THREE.Box3().setFromObject(object);
        const size = new THREE.Vector3();
        box.getSize(size);
        const maxDim = Math.max(size.x, size.y, size.z);
        if (maxDim > 0) {
            object.scale.setScalar(PREVIEW_FIT_SCALE / maxDim);
        }
        box.setFromObject(object);
        const center = new THREE.Vector3();
        box.getCenter(center);
        object.position.set(-center.x, -box.min.y, -center.z);
    }
    disposePreviewObject(object) {
        object.traverse((child) => {
            const mesh = child;
            if (mesh.geometry)
                mesh.geometry.dispose?.();
            const materials = Array.isArray(mesh.material)
                ? mesh.material
                : mesh.material
                    ? [mesh.material]
                    : [];
            for (const material of materials) {
                for (const value of Object.values(material)) {
                    if (value?.isTexture)
                        value.dispose();
                }
                material.dispose?.();
            }
        });
    }
    setStatus(text) {
        this.statusLabel.textContent = text;
    }
}

export { ModelPickerPanel };
