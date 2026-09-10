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
  cloneSceneEnvironment,
  cloneSceneObject,
  readSceneId,
  readSceneLayout,
  readScenePlan,
} from './ScenePlan';
import {
  createProceduralContent,
  getProceduralBounds,
} from './ProceduralGeometry';
import {ProceduralMotionPlayer} from './ProceduralMotion';
import {SceneValidationError} from './SceneValidationError';
import {createLandscapeContent, getLandscapeBounds} from './LandscapeGeometry';
import {
  createEnvironmentContent,
  getEnvironmentBounds,
} from './EnvironmentGeometry';
import {placeSceneOnSurface} from './ScenePlacement';
import {
  MAX_SCENE_REQUEST_CHARACTERS,
  type RoomcraftEventMap,
  type RoomcraftOptions,
  type RoomcraftStatus,
  type SceneAsset,
  type SceneAssetDescription,
  type SceneEnvironment,
  type SceneLayout,
  type SceneObject,
  type ScenePlanner,
  type SceneRequest,
} from './SceneTypes';

interface SceneEntity {
  owner: THREE.Group;
  content: THREE.Group;
  description: SceneObject;
  motion?: ProceduralMotionPlayer;
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
 * Composes trusted assets, procedural designs, and environments using AI edits.
 * Add it to XR Blocks before initialization, then call `request` or load a
 * hand-authored layout with `applyLayout`. No AI call is made on initialization.
 */
export class Roomcraft extends Script<RoomcraftEventMap> {
  static dependencies = {
    ai: AI,
    world: World,
    camera: THREE.Camera,
    timer: THREE.Timer,
  };

  private readonly assets = new Map<string, SceneAsset>();
  private readonly entities = new Map<string, SceneEntity>();
  private readonly ownerIds = new WeakMap<THREE.Object3D, string>();
  private readonly planner?: ScenePlanner;
  private readonly repairInvalidPlans: boolean;
  private readonly history: SceneLayout[] = [];
  private readonly future: SceneLayout[] = [];
  private redoBase?: string;
  private ai?: AI;
  private world?: World;
  private camera?: THREE.Camera;
  private timer?: THREE.Timer;
  private motionIsPaused = false;
  private environment?: SceneEnvironment;
  private environmentContent?: THREE.Group;
  private title = 'Untitled scene';
  private currentStatus: RoomcraftStatus = 'ready';
  private selection: string | null = null;
  private disposed = false;

  constructor(options: RoomcraftOptions = {}) {
    super();
    this.name = 'Roomcraft';
    this.planner = options.planner;
    if (
      options.repairInvalidPlans !== undefined &&
      typeof options.repairInvalidPlans !== 'boolean'
    ) {
      throw new Error('repairInvalidPlans must be a boolean.');
    }
    this.repairInvalidPlans = options.repairInvalidPlans ?? false;
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
      this.assets.set(asset.id, {
        id: asset.id,
        description: asset.description,
        size: [...asset.size],
        create: asset.create.bind(asset),
      });
    }
  }

  override init({
    ai,
    world,
    camera,
    timer,
  }: {
    ai: AI;
    world: World;
    camera: THREE.Camera;
    timer?: THREE.Timer;
  }) {
    this.assertAlive();
    this.ai = ai;
    this.world = world;
    this.camera = camera;
    this.timer = timer;
  }

  /** Detached metadata only; factories and model URLs never reach the planner. */
  get catalog(): SceneAssetDescription[] {
    return [...this.assets.values()].map(({id, description, size}) => ({
      id,
      description,
      size: [...size],
    }));
  }

  /** Whether any authored part has a motion definition, including when paused. */
  get hasMotion() {
    for (const entity of this.entities.values()) {
      if (entity.motion && entity.motion.count > 0) return true;
    }
    return false;
  }

  /** Playback inspection state; not part of the saved layout or undo history. */
  get motionPaused() {
    return this.motionIsPaused;
  }

  /** Pause or resume local part motion without changing its authored definition. */
  setMotionPaused(paused: boolean) {
    this.assertAlive();
    if (typeof paused !== 'boolean') {
      throw new Error('Motion pause state must be a boolean.');
    }
    if (paused === this.motionIsPaused) return;
    this.motionIsPaused = paused;
    this.dispatchEvent({type: 'motionstatechange', paused});
  }

  override update() {
    if (this.disposed || this.motionIsPaused || !this.hasMotion) return;
    if (!this.timer) {
      throw new Error(
        'Roomcraft motion needs the SDK frame timer. Add Roomcraft before xb.init().'
      );
    }
    const delta = this.timer.getDelta();
    for (const entity of this.entities.values()) entity.motion?.update(delta);
  }

  /** A detached snapshot of the setting, live transforms, and authored recipes. */
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
      ...(this.environment
        ? {environment: cloneSceneEnvironment(this.environment)}
        : {}),
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

  /**
   * Bounds of the authored objects in world space, including full motion envelopes.
   * Includes virtual ground, but not sky. An empty scene has an empty box.
   *
   * @param id - One object ID, or omit it to include the whole composition.
   */
  getWorldBounds(id?: string): THREE.Box3 {
    this.assertAlive();
    let selected: SceneEntity | undefined;
    if (id !== undefined) {
      selected = this.entities.get(readSceneId(id));
      if (!selected) throw new Error(`Object "${id}" does not exist.`);
    }
    const bounds = new THREE.Box3();
    if (!selected && this.environment) {
      this.updateWorldMatrix(true, false);
      bounds.union(
        getEnvironmentBounds(this.environment).applyMatrix4(this.matrixWorld)
      );
    }
    for (const entity of selected ? [selected] : this.entities.values()) {
      entity.owner.updateWorldMatrix(true, false);
      const parts = entity.description.parts;
      if (entity.motion && parts !== undefined) {
        bounds.union(
          getProceduralBounds(parts).applyMatrix4(entity.owner.matrixWorld)
        );
      } else if (entity.description.landscape !== undefined) {
        bounds.union(
          getLandscapeBounds(entity.description.landscape).applyMatrix4(
            entity.owner.matrixWorld
          )
        );
      } else {
        bounds.union(new THREE.Box3().setFromObject(entity.owner));
      }
    }
    return bounds;
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
        prompt.length > MAX_SCENE_REQUEST_CHARACTERS
      ) {
        throw new Error(
          `Describe the scene edit using 1 to ${MAX_SCENE_REQUEST_CHARACTERS} characters.`
        );
      }
      const before = this.layout;
      const request: SceneRequest = {
        prompt: prompt.trim(),
        scene: this.layout,
        selectedId: this.selection,
        catalog: this.catalog,
      };
      const response = await this.requestPlan(request);
      this.assertAlive();
      const validate = (value: unknown) => {
        const plan = readScenePlan(value, request.catalog);
        const current = this.layout;
        assertPlanFresh(plan, before, current);
        return applyScenePlan(plan, current, request.catalog);
      };
      let layout: SceneLayout;
      try {
        layout = validate(response);
      } catch (error) {
        if (
          !this.repairInvalidPlans ||
          !(error instanceof SceneValidationError)
        ) {
          throw error;
        }
        this.setStatus('repairing');
        const corrected = await this.requestPlan({
          ...request,
          repair: {reason: error.message.slice(0, 1000)},
        });
        this.assertAlive();
        try {
          layout = validate(corrected);
        } catch (error) {
          if (error instanceof SceneValidationError) {
            throw new SceneValidationError(
              `The corrected scene plan is still invalid. ${error.message}`,
              {cause: error}
            );
          }
          throw error;
        }
      }
      this.setStatus('loading');
      return this.commitLayout(layout);
    });
  }

  private async requestPlan(request: SceneRequest): Promise<unknown> {
    this.assertAlive();
    if (this.planner) return this.planner(structuredClone(request));
    if (!this.ai) {
      throw new Error(
        'Initialize XR Blocks with AI, or provide a Roomcraft planner.'
      );
    }
    const result = await this.ai.query({prompt: buildScenePrompt(request)});
    const response = typeof result === 'string' ? result : result?.text;
    if (typeof response !== 'string' || !response.trim()) {
      throw new Error('AI returned no scene plan. Your scene was kept.');
    }
    return response;
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
   * Virtual environments already own a ground plane and cannot use this placement.
   * This is session-local placement, not a persistent spatial anchor.
   */
  async placeOnSurface(): Promise<boolean> {
    return this.run('placing', async () => {
      if (this.environment) {
        throw new Error(
          'A virtual environment cannot be placed on a detected surface.'
        );
      }
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
    if (this.environmentContent) {
      this.environmentContent.removeFromParent();
      disposeContent(this.environmentContent);
      this.environmentContent = undefined;
    }
    this.environment = undefined;
    this.history.length = 0;
    this.future.length = 0;
    this.redoBase = undefined;
    this.selection = null;
    this.currentStatus = 'ready';
    this.timer = undefined;
    this.motionIsPaused = false;
  }

  private async commitLayout(
    layout: SceneLayout,
    historyAction: 'record' | 'undo' | 'redo' = 'record'
  ) {
    const before = this.layout;
    const fingerprint = JSON.stringify(before);
    const staged = new Map<string, THREE.Group>();
    const environmentChanged =
      JSON.stringify(this.environment) !== JSON.stringify(layout.environment);
    let stagedEnvironment: THREE.Group | undefined;
    let committed = false;
    try {
      if (environmentChanged && layout.environment) {
        stagedEnvironment = createEnvironmentContent(layout.environment);
      }
      for (const object of layout.objects) {
        const existing = this.entities.get(object.id);
        if (
          !existing ||
          existing.description.asset !== object.asset ||
          existing.description.color !== object.color ||
          JSON.stringify(existing.description.parts) !==
            JSON.stringify(object.parts) ||
          JSON.stringify(existing.description.landscape) !==
            JSON.stringify(object.landscape)
        ) {
          let content: THREE.Group;
          if (object.parts !== undefined) {
            content = createProceduralContent(object.parts, object.color);
          } else if (object.landscape !== undefined) {
            content = createLandscapeContent(object.landscape, object.color);
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

      // Read live cycle phases only after asynchronous asset staging is complete.
      const stagedMotions = new Map<string, ProceduralMotionPlayer>();
      for (const object of layout.objects) {
        const content = staged.get(object.id);
        if (content && object.parts?.some((part) => part.motion)) {
          stagedMotions.set(
            object.id,
            new ProceduralMotionPlayer(
              content,
              object.parts,
              this.entities.get(object.id)?.motion
            )
          );
        }
      }

      const retired: THREE.Object3D[] = [];
      if (environmentChanged) {
        if (this.environmentContent) {
          this.environmentContent.removeFromParent();
          retired.push(this.environmentContent);
        }
        this.environment = layout.environment
          ? cloneSceneEnvironment(layout.environment)
          : undefined;
        this.environmentContent = stagedEnvironment;
        if (stagedEnvironment) this.add(stagedEnvironment);
      }
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
          entity = {
            owner,
            content,
            description: object,
            motion: stagedMotions.get(object.id),
          };
          this.entities.set(object.id, entity);
          this.ownerIds.set(owner, object.id);
          this.add(owner);
        } else if (content) {
          entity.content.removeFromParent();
          retired.push(entity.content);
          entity.owner.add(content);
          entity.content = content;
          entity.motion = stagedMotions.get(object.id);
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
        // Restored objects retain their layout order, not their reinsertion order.
        this.entities.delete(object.id);
        this.entities.set(object.id, entity);
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
      if (!committed) {
        staged.forEach(disposeContent);
        if (stagedEnvironment) disposeContent(stagedEnvironment);
      }
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
