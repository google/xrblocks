import * as xb from 'xrblocks';

import {el} from './dom';
import {serializeActiveManifest} from './SceneManifest';
import type {SceneManager} from './SceneManager';
import type {SelectionManager} from './SelectionManager';
import {injectEditorStyles} from './styles';

const SCENE_EXTENSION = /\.json$/i;

export interface ScenePanelOptions {
  /** Directory containing complete simulator environment manifests. */
  scenesDir?: string;
  parent?: HTMLElement;
}

/** Imports and exports the simulator's standard environment manifest. */
export class ScenePanel extends xb.Script {
  sceneFiles: string[] = [];
  pickerIndex = 0;

  root: HTMLDivElement;
  nameLabel: HTMLSpanElement;
  statusLabel: HTMLDivElement;

  constructor(
    private sceneManager: SceneManager,
    private selectionManager: SelectionManager,
    private options: ScenePanelOptions = {}
  ) {
    super();
    this.options.scenesDir ??= './Scenes/';
    const parent = this.options.parent ?? document.body;
    injectEditorStyles();

    this.nameLabel = el('span', {className: 'xrblocks-editor-name'});
    this.statusLabel = el('div', {className: 'status'});
    const exportBtn = el('button', {
      className: 'accent',
      textContent: 'Export Manifest',
    });
    const prevBtn = el('button', {textContent: 'Prev'});
    const nextBtn = el('button', {textContent: 'Next'});
    const importBtn = el('button', {
      className: 'accent',
      textContent: 'Load Manifest',
    });
    exportBtn.addEventListener('click', () => this.exportManifest());
    prevBtn.addEventListener('click', () => this.showPrevious());
    nextBtn.addEventListener('click', () => this.showNext());
    importBtn.addEventListener('click', () => void this.importManifest());

    this.root = el(
      'div',
      {id: 'xrblocks-editor-scene', className: 'xr-panel'},
      el('div', {className: 'title', textContent: 'Environment Manifest'}),
      el('div', {className: 'row'}, exportBtn),
      el('div', {className: 'row'}, prevBtn, this.nameLabel, nextBtn),
      el('div', {className: 'row'}, importBtn),
      this.statusLabel
    );
    parent.appendChild(this.root);
  }

  override async init() {
    await this.refreshSceneList();
  }

  get scenesDir() {
    return this.options.scenesDir!;
  }

  async refreshSceneList() {
    try {
      this.sceneFiles = await this.readSceneDirectory();
    } catch (error) {
      console.error('[ScenePanel] Failed to read manifest directory:', error);
      this.sceneFiles = [];
    }
    this.pickerIndex = 0;
    this.updateNameLabel();
  }

  async readSceneDirectory(): Promise<string[]> {
    const res = await fetch(`${this.scenesDir}?t=${Date.now()}`, {
      cache: 'no-store',
    });
    if (!res.ok) throw new Error(`Directory request failed: ${res.status}`);
    const doc = new DOMParser().parseFromString(await res.text(), 'text/html');
    const names = new Set<string>();
    for (const link of doc.querySelectorAll('a[href]')) {
      const href = link.getAttribute('href') ?? '';
      const path = decodeURIComponent(href.split(/[?#]/)[0]);
      const name = path.split('/').filter(Boolean).pop() ?? '';
      if (SCENE_EXTENSION.test(name)) names.add(name);
    }
    return [...names].sort((a, b) =>
      a.localeCompare(b, undefined, {numeric: true})
    );
  }

  showPrevious() {
    if (this.sceneFiles.length === 0) return;
    this.pickerIndex =
      (this.pickerIndex - 1 + this.sceneFiles.length) % this.sceneFiles.length;
    this.updateNameLabel();
  }

  showNext() {
    if (this.sceneFiles.length === 0) return;
    this.pickerIndex = (this.pickerIndex + 1) % this.sceneFiles.length;
    this.updateNameLabel();
  }

  updateNameLabel() {
    if (this.sceneFiles.length === 0) {
      this.nameLabel.textContent = '(no manifests)';
      return;
    }
    const fileName = this.sceneFiles[this.pickerIndex];
    this.nameLabel.textContent = `${fileName} (${this.pickerIndex + 1}/${this.sceneFiles.length})`;
  }

  exportManifest() {
    const manifest = xb.core.simulator.activeEnvironmentManifest;
    if (!manifest) {
      this.setStatus('No active simulator environment');
      return;
    }
    const serialized = serializeActiveManifest(
      manifest,
      this.sceneManager,
      this.scenesDir
    );
    const blob = new Blob([JSON.stringify(serialized, null, 2)], {
      type: 'application/json',
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${manifest.name?.replace(/[^a-z0-9-_]+/gi, '-').toLowerCase() || 'simulator-scene'}.json`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    this.setStatus(
      `Exported ${serialized.objects?.length ?? 0} object(s). Move the download into ${this.scenesDir}.`
    );
  }

  async importManifest() {
    if (this.sceneFiles.length === 0) {
      this.setStatus(`No .json manifests found in ${this.scenesDir}`);
      return;
    }
    const fileName = this.sceneFiles[this.pickerIndex];
    const manifestPath = new URL(
      fileName,
      new URL(this.scenesDir, document.baseURI)
    ).href;
    this.setStatus(`Loading ${fileName}...`);
    try {
      await xb.core.simulator.setEnvironment(manifestPath);
      this.selectionManager.clearSelection();
      this.setStatus(`Loaded ${fileName}`);
    } catch (error) {
      console.error(`[ScenePanel] Failed to load ${fileName}:`, error);
      this.setStatus(`Failed to load ${fileName}`);
    }
  }

  setStatus(text: string) {
    this.statusLabel.textContent = text;
  }
}
