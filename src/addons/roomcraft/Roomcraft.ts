import * as THREE from 'three';
import {
  AI,
  Script,
  World,
  disposeObjectTree,
  type ManipulationEvent,
  type SelectEvent,
} from 'xrblocks';

import {createDefaultCatalog} from './Catalog';
import {
  MAX_SCENE_SCALE,
  MIN_SCENE_SCALE,
  applyScenePlan,
  assertPlanFresh,
  buildScenePrompt,
  cloneSceneObject,
  readSceneId,
  readSceneLayout,
  readScenePlan,
} from './ScenePlan';
import {createProceduralContent} from './ProceduralGeometry';
import {placeSceneOnSurface} from './ScenePlacement';
import type {
  RoomcraftEventMap,
  RoomcraftOptions,
  RoomcraftStatus,
  SceneAsset,
  SceneAssetDescription,
  SceneLayout,
  SceneObject,
  ScenePlanner,
} from './SceneTypes';

interface SceneEntity {
  owner: THREE.Group;
  content: THREE.Group;
  description: SceneObject;
}

function disposeContent(content: THREE.Object3D) {
  const textures = new Set<THREE.Texture>();
  const skeletons = new Set<THREE.Skeleton>();
  content.traverse((object) => {
    if (object instanceof THREE.SkinnedMesh) skeletons.add(object.skeleton);
    if (
      object instanceof THREE.Mesh ||
      object instanceof THREE.Line ||
      object instanceof THREE.Points ||
      object instanceof THREE.Sprite
    ) {
      const materials = Array.isArray(object.material)
        ? object.material
        : [object.material];
      for (const material of materials) {
        for (const value of Object.values(material)) {
          if (value instanceof THREE.Texture) textures.add(value);
        }
      }
    }
  });
  textures.forEach((texture) => texture.dispose());
  skeletons.forEach((skeleton) => skeleton.dispose());
  disposeObjectTree(content);
}

async function createContent(asset: SceneAsset, color: string) {
  const object = await asset.create(color);
  if (!(object instanceof THREE.Object3D) || object.parent) {
    throw new Error(
      `Asset "${asset.id}" must return a fresh, detached THREE.Object3D.`
    );
  }
  const content = new THREE.Group();
  content.add(object);
  let ready = false;
  try {
    const bounds = new THREE.Box3().setFromObject(content);
    const size = bounds.getSize(new THREE.Vector3());
    if (
      bounds.isEmpty() ||
      ![...bounds.min.toArray(), ...bounds.max.toArray()].every(
        Number.isFinite
      ) ||
      size.toArray().some((component) => component <= 0)
    ) {
      throw new Error(
        `Asset "${asset.id}" has no finite, three-dimensional bounds.`
      );
    }
    const center = bounds.getCenter(new THREE.Vector3());
    object.position.sub(new THREE.Vector3(center.x, bounds.min.y, center.z));
    object.updateMatrix();
    content.scale.set(
      asset.size[0] / size.x,
      asset.size[1] / size.y,
      asset.size[2] / size.z
    );
    ready = true;
    return content;
  } finally {
    if (!ready) disposeContent(content);
  }
}

/**
 * Composes trusted assets and procedural designs using incremental AI edits.
 * Add it to XR Blocks before initialization, then call `request` or load a
 * hand-authored layout with `applyLayout`. No AI call is made on initialization.
 */
export class Roomcraft extends Script<RoomcraftEventMap> {
  static dependencies = {ai: AI, world: World, camera: THREE.Camera};

  private readonly assets = new Map<string, SceneAsset>();
  private readonly entities = new Map<string, SceneEntity>();
  private readonly ownerIds = new WeakMap<THREE.Object3D, string>();
  private readonly planner?: ScenePlanner;
  private readonly history: SceneLayout[] = [];
  private readonly future: SceneLayout[] = [];
  private redoBase?: string;
  private ai?: AI;
  private world?: World;
  private camera?: THREE.Camera;
  private title = 'Untitled scene';
  private currentStatus: RoomcraftStatus = 'ready';
  private selection: string | null = null;
  private disposed = false;

  constructor(options: RoomcraftOptions = {}) {
    super();
    this.name = 'Roomcraft';
    this.planner = options.planner;
    const catalog = options.catalog ?? createDefaultCatalog();
    if (!Array.isArray(catalog) || catalog.length > 128) {
      throw new Error(
        'Roomcraft needs a catalog containing at most 128 assets.'
      );
    }
    for (const asset of catalog) {
      readSceneId(asset.id);
      if (this.assets.has(asset.id)) {
        throw new Error(`Duplicate catalog asset "${asset.id}".`);
      }
      if (
        typeof asset.description !== 'string' ||
        !asset.description.trim() ||
        asset.description.length > 600 ||
        !Array.isArray(asset.size) ||
        asset.size.length !== 3 ||
        asset.size.some(
          (value) => !Number.isFinite(value) || value <= 0 || value > 10
        ) ||
        typeof asset.create !== 'function'
      ) {
        throw new Error(`Invalid catalog asset "${asset.id}".`);
      }
      this.assets.set(asset.id, {...asset, size: [...asset.size]});
    }
  }

  override init({
    ai,
    world,
    camera,
  }: {
    ai: AI;
    world: World;
    camera: THREE.Camera;
  }) {
    this.assertAlive();
    this.ai = ai;
    this.world = world;
    this.camera = camera;
  }

  /** Detached metadata only; factories and model URLs never reach the planner. */
  get catalog(): SceneAssetDescription[] {
    return [...this.assets.values()].map(({id, description, size}) => ({
      id,
      description,
      size: [...size],
    }));
  }

  /** A portable scene-local snapshot, including current hand-edited transforms. */
  get layout(): SceneLayout {
    return {
      title: this.title,
      objects: [...this.entities.values()].map(({owner, description}) => ({
        ...cloneSceneObject(description),
        name: owner.name,
        position: owner.position.toArray(),
        rotation: new THREE.Euler().setFromQuaternion(owner.quaternion, 'YXZ')
          .y,
        scale: owner.scale.toArray(),
      })),
    };
  }

  get status() {
    return this.currentStatus;
  }

  get busy() {
    return this.currentStatus !== 'ready';
  }

  get canUndo() {
    return this.history.length > 0;
  }

  /** Redo never overwrites changes made since the last history operation. */
  get canRedo() {
    return (
      this.future.length > 0 && this.redoBase === JSON.stringify(this.layout)
    );
  }

  get selectedId() {
    return this.selection;
  }

  /** The stable manipulation owner. Change its transform, not its hierarchy. */
  getObject(id: string): THREE.Object3D | undefined {
    return this.entities.get(id)?.owner;
  }

  select(id: string | null) {
    this.assertAlive();
    if (id !== null && !this.entities.has(id)) {
      throw new Error(`Cannot select missing scene object "${id}".`);
    }
    if (id === this.selection) return;
    this.selection = id;
    this.dispatchEvent({type: 'selectionchange', id});
  }

  /** Replace the scene explicitly, for curated examples or saved layouts. */
  async applyLayout(value: unknown): Promise<SceneLayout> {
    return this.run('loading', async () => {
      const layout = readSceneLayout(value, this.catalog);
      return this.commitLayout(layout);
    });
  }

  /** Apply explicit add/update/remove operations without invoking AI. */
  async applyPlan(value: unknown): Promise<SceneLayout> {
    return this.run('loading', async () => {
      const plan = readScenePlan(value, this.catalog);
      const layout = applyScenePlan(plan, this.layout, this.catalog);
      return this.commitLayout(layout);
    });
  }

  /** Refine the current scene; selection and actual transforms are sent as context. */
  async request(prompt: string): Promise<SceneLayout> {
    return this.run('planning', async () => {
      if (
        typeof prompt !== 'string' ||
        !prompt.trim() ||
        prompt.length > 4000
      ) {
        throw new Error('Describe the scene edit using 1 to 4000 characters.');
      }
      const before = this.layout;
      const request = {
        prompt: prompt.trim(),
        scene: this.layout,
        selectedId: this.selection,
        catalog: this.catalog,
      };
      let response: unknown;
      if (this.planner) {
        response = await this.planner(request);
      } else {
        if (!this.ai) {
          throw new Error(
            'Initialize XR Blocks with AI, or provide a Roomcraft planner.'
          );
        }
        const result = await this.ai.query({prompt: buildScenePrompt(request)});
        response = typeof result === 'string' ? result : result?.text;
        if (typeof response !== 'string' || !response.trim()) {
          throw new Error('AI returned no scene plan. Your scene was kept.');
        }
      }
      this.assertAlive();
      const plan = readScenePlan(response, this.catalog);
      const current = this.layout;
      assertPlanFresh(plan, before, current);
      const layout = applyScenePlan(plan, current, this.catalog);
      this.setStatus('loading');
      return this.commitLayout(layout);
    });
  }

  /** Undo the last successful scene edit, including explicit scene replacements. */
  async undo(): Promise<SceneLayout> {
    return this.run('loading', async () => {
      const previous = this.history.at(-1);
      if (!previous) throw new Error('There is no scene edit to undo.');
      return this.commitLayout(previous, 'undo');
    });
  }

  /** Reapply an undone scene edit without asking the planner again. */
  async redo(): Promise<SceneLayout> {
    return this.run('loading', async () => {
      const next = this.future.at(-1);
      if (!next) throw new Error('There is no scene edit to redo.');
      if (!this.canRedo) {
        throw new Error(
          'The scene changed since undo. Redo was not applied; your scene was kept.'
        );
      }
      return this.commitLayout(next, 'redo');
    });
  }

  /**
   * Place the whole composition on a detected horizontal surface that fits it.
   * Returns false without moving the scene if no suitable surface is available.
   * This is session-local placement, not a persistent spatial anchor.
   */
  async placeOnSurface(): Promise<boolean> {
    return this.run('placing', async () => {
      if (!this.world || !this.camera) {
        throw new Error(
          'Initialize XR Blocks before placing a Roomcraft scene.'
        );
      }
      if (this.entities.size === 0) {
        throw new Error('Create a scene before placing it on a surface.');
      }
      const placed = placeSceneOnSurface(
        this,
        this.layout,
        this.catalog,
        this.world.planes?.get() ?? [],
        this.camera
      );
      if (placed) this.dispatchEvent({type: 'change', layout: this.layout});
      return placed;
    });
  }

  override onObjectSelectStart(event: SelectEvent) {
    const id = this.findOwner(event.target ?? event.surface);
    if (id) this.select(id);
  }

  override onObjectManipulate(event: ManipulationEvent) {
    const id = this.findOwner(event.owner);
    if (!id) return;
    if (event.phase === 'start') this.select(id);
    if (event.phase === 'end' || event.phase === 'cancel') {
      this.dispatchEvent({type: 'change', layout: this.layout});
    }
  }

  override dispose() {
    if (this.disposed) return;
    this.disposed = true;
    for (const entity of this.entities.values()) {
      entity.owner.removeFromParent();
      disposeContent(entity.owner);
    }
    this.entities.clear();
    this.history.length = 0;
    this.future.length = 0;
    this.redoBase = undefined;
    this.selection = null;
    this.currentStatus = 'ready';
  }

  private async commitLayout(
    layout: SceneLayout,
    historyAction: 'record' | 'undo' | 'redo' = 'record'
  ) {
    const before = this.layout;
    const fingerprint = JSON.stringify(before);
    const staged = new Map<string, THREE.Group>();
    let committed = false;
    try {
      for (const object of layout.objects) {
        const existing = this.entities.get(object.id);
        if (
          !existing ||
          existing.description.asset !== object.asset ||
          existing.description.color !== object.color ||
          JSON.stringify(existing.description.parts) !==
            JSON.stringify(object.parts)
        ) {
          let content: THREE.Group;
          if (object.parts !== undefined) {
            content = createProceduralContent(object.parts, object.color);
          } else {
            const asset = this.assets.get(object.asset);
            if (!asset) {
              throw new Error(`Unknown catalog asset "${object.asset}".`);
            }
            content = await createContent(asset, object.color);
          }
          staged.set(object.id, content);
          this.assertAlive();
        }
      }
      this.assertAlive();
      if (JSON.stringify(this.layout) !== fingerprint) {
        throw new Error(
          'The scene moved while assets were loading. Your scene was kept; retry the edit.'
        );
      }

      const retired: THREE.Object3D[] = [];
      const ids = new Set(layout.objects.map((object) => object.id));
      for (const [id, entity] of this.entities) {
        if (!ids.has(id)) {
          entity.owner.removeFromParent();
          retired.push(entity.owner);
          this.entities.delete(id);
        }
      }
      for (const object of layout.objects) {
        let entity = this.entities.get(object.id);
        const content = staged.get(object.id);
        if (!entity) {
          if (!content) throw new Error(`Missing staged asset "${object.id}".`);
          const owner = new THREE.Group();
          owner.xb = {
            manipulation: {
              actions: {
                translate: true,
                scale: {minScale: MIN_SCENE_SCALE, maxScale: MAX_SCENE_SCALE},
              },
            },
          };
          owner.add(content);
          entity = {owner, content, description: object};
          this.entities.set(object.id, entity);
          this.ownerIds.set(owner, object.id);
          this.add(owner);
        } else if (content) {
          entity.content.removeFromParent();
          retired.push(entity.content);
          entity.owner.add(content);
          entity.content = content;
        }
        entity.owner.name = object.name;
        entity.owner.position.fromArray(object.position);
        const previous = before.objects.find(({id}) => id === object.id);
        // Avoid quaternion/Euler round-trip drift on unchanged rotations.
        if (object.rotation !== previous?.rotation) {
          entity.owner.rotation.set(0, object.rotation, 0);
        }
        entity.owner.scale.fromArray(object.scale);
        entity.description = object;
      }
      this.title = layout.title;
      const after = JSON.stringify(this.layout);
      if (historyAction === 'undo') {
        if (this.redoBase !== fingerprint) this.future.length = 0;
        this.history.pop();
        this.future.push(before);
        this.redoBase = after;
      } else if (historyAction === 'redo') {
        this.future.pop();
        this.history.push(before);
        this.redoBase = this.future.length > 0 ? after : undefined;
      } else if (after !== fingerprint) {
        this.history.push(before);
        this.future.length = 0;
        this.redoBase = undefined;
      }
      if (this.history.length > 20) this.history.shift();
      committed = true;
      retired.forEach(disposeContent);
      if (this.selection && !this.entities.has(this.selection))
        this.select(null);
      this.dispatchEvent({type: 'change', layout: this.layout});
      return this.layout;
    } finally {
      if (!committed) staged.forEach(disposeContent);
    }
  }

  private async run<T>(
    status: RoomcraftStatus,
    operation: () => Promise<T>
  ): Promise<T> {
    this.assertAlive();
    if (this.busy)
      throw new Error('Roomcraft is busy. Wait for the current operation.');
    try {
      this.setStatus(status);
      return await operation();
    } finally {
      if (!this.disposed) this.setStatus('ready');
    }
  }

  private setStatus(status: RoomcraftStatus) {
    this.currentStatus = status;
    this.dispatchEvent({type: 'statuschange', status});
  }

  private assertAlive() {
    if (this.disposed) throw new Error('Roomcraft has been disposed.');
  }

  private findOwner(object?: THREE.Object3D): string | undefined {
    let current = object;
    while (current && current !== this) {
      const id = this.ownerIds.get(current);
      if (id && this.entities.has(id)) return id;
      current = current.parent ?? undefined;
    }
    return undefined;
  }
}
