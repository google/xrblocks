import type {SplatMesh} from '@sparkjsdev/spark';
import * as THREE from 'three';
import type {GLTF} from 'three/addons/loaders/GLTFLoader.js';

import {OCCLUDABLE_ITEMS_LAYER} from '../../constants';
import {Registry} from '../../core/components/Registry';
import {Script, type HoverEvent} from '../../core/Script';
import {Depth} from '../../depth/Depth';
import {OcclusionUtils} from '../../depth/occlusion/OcclusionUtils';
import {Interaction} from '../../interaction/Interaction';
import {normalizeManipulationConfig} from '../../interaction/manipulation/ManipulationConfig';
import {
  ManipulationAction,
  type ManipulationOptions,
} from '../../interaction/manipulation/ManipulationTypes';
import {ModelLoader} from '../../utils/ModelLoader';
import {getGroupBoundingBox} from '../../utils/ModelUtils';
import {SparkRendererHolder} from '../../utils/SparkRendererHolder';
import {disposeObjectTree} from '../../utils/ThreeDisposal';
import type {Shader} from '../../utils/Types';

import {ModelViewerPlatform} from './ModelViewerPlatform';

const PLATFORM_MARGIN = 0.2;
const PLATFORM_THICKNESS = 0.02;
const GLTF_EXTENSIONS = new Set(['gltf', 'glb']);
const SPLAT_EXTENSIONS = new Set(['ply', 'spz', 'splat', 'ksplat']);

export type ModelViewerOrigin = 'bottom-center' | 'center' | 'source';

export interface ModelSource {
  url: string;
  /** Base path used by glTF files to resolve related resources. */
  path?: string;
  /** Asset normalization applied before origin alignment. */
  scale?: number | THREE.Vector3Like;
  /** Asset rotation in radians, matching THREE.Euler. */
  rotation?: THREE.Vector3Like;
}

export interface ModelViewerOptions {
  origin?: ModelViewerOrigin;
  manipulation?: boolean | ManipulationOptions;
  autoplay?: boolean;
  occlusion?: boolean;
  castShadow?: boolean;
  receiveShadow?: boolean;
}

export interface PlayModelAnimationOptions {
  once?: boolean;
}

class RotationHitSurface extends THREE.Mesh<
  THREE.CylinderGeometry,
  THREE.MeshBasicMaterial
> {
  constructor(bounds: THREE.Box3) {
    const size = bounds.getSize(new THREE.Vector3());
    const radius = 0.05 + 0.5 * Math.min(size.x, size.z);
    super(
      new THREE.CylinderGeometry(radius, radius, Math.max(size.y, 0.001)),
      new THREE.MeshBasicMaterial({colorWrite: false, depthWrite: false})
    );
    bounds.getCenter(this.position);
    this.xb = {
      manipulationHandle: {action: ManipulationAction.Rotate},
    };
    this.userData.xrblocksPrivate = true;
  }

  dispose(): void {
    this.removeFromParent();
    this.geometry.dispose();
    this.material.dispose();
  }
}

/** Loads and presents one interactive glTF or Gaussian Splat model. */
export class ModelViewer extends Script {
  private static readonly dependencies = {
    depth: Depth,
    interaction: Interaction,
    scene: THREE.Scene,
    renderer: THREE.WebGLRenderer,
    registry: Registry,
    timer: THREE.Timer,
  };

  private readonly loader = new ModelLoader();
  private readonly bounds = new THREE.Box3();
  private readonly animationActions: THREE.AnimationAction[] = [];
  private readonly occludableMaterials = new WeakSet<THREE.Material>();
  private readonly occludableShaders = new Set<Shader>();
  private readonly hoveringControllers = new Set<
    HoverEvent['source']['controller']
  >();
  private readonly unregisterHitSurfaces: Array<() => void> = [];
  private readonly origin: ModelViewerOrigin;
  private readonly autoplay: boolean;
  private readonly occlusionEnabled: boolean;

  private timer?: THREE.Timer;
  private animationMixer?: THREE.AnimationMixer;
  private gltf?: GLTF;
  private splatMesh?: SplatMesh;
  private contentRoot?: THREE.Object3D;
  private depth?: Depth;
  private interaction?: Interaction;
  private scene?: THREE.Scene;
  private renderer?: THREE.WebGLRenderer;
  private registry?: Registry;
  private platform?: ModelViewerPlatform;
  private rotationHitSurface?: RotationHitSurface;
  private loadGeneration = 0;
  private acceptingLoads = true;

  constructor({
    origin = 'bottom-center',
    manipulation,
    autoplay = true,
    occlusion = false,
    castShadow = true,
    receiveShadow = true,
  }: ModelViewerOptions = {}) {
    super();
    this.name = 'ModelViewer';
    this.origin = origin;
    this.autoplay = autoplay;
    this.occlusionEnabled = occlusion;
    this.castShadow = castShadow;
    this.receiveShadow = receiveShadow;
    this.manipulation = manipulation ?? true;
  }

  get manipulation(): boolean | ManipulationOptions | undefined {
    return this.xb?.manipulation;
  }

  set manipulation(value: boolean | ManipulationOptions | undefined) {
    this.xb ??= {};
    this.xb.manipulation = normalizeViewerManipulation(value);
    this.syncInteractionSurfaces();
  }

  async init({
    depth,
    interaction,
    scene,
    renderer,
    registry,
    timer,
  }: {
    depth: Depth;
    interaction: Interaction;
    scene: THREE.Scene;
    renderer: THREE.WebGLRenderer;
    registry: Registry;
    timer: THREE.Timer;
  }): Promise<void> {
    this.clearHitRegistrations();
    if (this.depth && this.depth !== depth) {
      this.unregisterOcclusionShaders(this.depth);
    }

    this.acceptingLoads = true;
    this.depth = depth;
    this.interaction = interaction;
    this.scene = scene;
    this.renderer = renderer;
    this.registry = registry;
    this.timer = timer;

    for (const shader of this.occludableShaders) {
      depth.occludableShaders.add(shader);
    }
    if (this.splatMesh) await this.createSparkRendererIfNeeded();
    this.syncInteractionSurfaces();
  }

  /** Replaces the current model. The file format is inferred from the URL. */
  async load(source: string | ModelSource): Promise<void> {
    const request = normalizeSource(source);
    const extension = fileExtension(request.url);
    if (GLTF_EXTENSIONS.has(extension)) {
      const generation = this.beginModelLoad();
      await this.loadGLTF(request, generation);
      return;
    }
    if (SPLAT_EXTENSIONS.has(extension)) {
      if (request.path) {
        throw new Error('ModelViewer source.path is only supported for glTF.');
      }
      const generation = this.beginModelLoad();
      await this.loadSplat(request, generation);
      return;
    }
    throw new Error(`ModelViewer does not support .${extension || '(none)'}.`);
  }

  /**
   * Presents an existing Three.js object. The caller retains ownership of its
   * geometry, materials, and textures.
   */
  setContent(content: THREE.Object3D): void {
    this.beginModelLoad();
    const bounds = getGroupBoundingBox([content]);
    alignOrigin(content, bounds, this.origin);
    this.contentRoot = content;
    this.bounds.copy(bounds);
    this.add(content);
    this.finishModelLoad();
  }

  /** Plays every animation in the loaded glTF. */
  playAnimation({once = false}: PlayModelAnimationOptions = {}): void {
    for (const action of this.animationActions) {
      action.reset();
      action.clampWhenFinished = once;
      action.setLoop(
        once ? THREE.LoopOnce : THREE.LoopRepeat,
        once ? 1 : Infinity
      );
      action.play();
    }
  }

  update(): void {
    const delta = this.timer?.getDelta() ?? 0;
    this.animationMixer?.update(delta);
    this.platform?.update(delta);
  }

  onHoverEnter(event: HoverEvent): void {
    this.hoveringControllers.add(event.source.controller);
    this.platform?.setHovered(true);
  }

  onHoverExit(event: HoverEvent): void {
    this.hoveringControllers.delete(event.source.controller);
    if (this.hoveringControllers.size === 0) this.platform?.setHovered(false);
  }

  override dispose(): void {
    this.acceptingLoads = false;
    this.loadGeneration++;
    this.releaseLoadedModel();
    this.hoveringControllers.clear();
    this.depth = undefined;
    this.interaction = undefined;
    this.scene = undefined;
    this.renderer = undefined;
    this.registry = undefined;
    this.timer = undefined;
  }

  private async loadGLTF(
    source: ModelSource,
    generation: number
  ): Promise<void> {
    const gltf = await this.loader.loadGLTF({
      path: source.path,
      url: source.url,
      renderer: this.renderer,
    });
    if (!this.isModelLoadCurrent(generation)) {
      disposeObjectTree(gltf.scene);
      throw this.staleModelLoadError();
    }

    applyAssetTransform(gltf.scene, source);
    const bounds = getGroupBoundingBox([gltf.scene]);
    alignOrigin(gltf.scene, bounds, this.origin);

    this.gltf = gltf;
    this.contentRoot = gltf.scene;
    this.bounds.copy(bounds);
    this.add(gltf.scene);
    this.setupAnimations(gltf);
    this.finishModelLoad();
  }

  private async loadSplat(
    source: ModelSource,
    generation: number
  ): Promise<void> {
    const splatMesh = await this.loader.loadSplat({url: source.url});
    if (!this.isModelLoadCurrent(generation)) {
      splatMesh.dispose();
      throw this.staleModelLoadError();
    }

    splatMesh.raycast = () => {};
    const root = new THREE.Object3D();
    root.add(splatMesh);
    applyAssetTransform(root, source);
    root.updateMatrix();

    const bounds = (await splatMesh.getBoundingBox(false)).applyMatrix4(
      root.matrix
    );
    if (!this.isModelLoadCurrent(generation)) {
      splatMesh.dispose();
      root.clear();
      throw this.staleModelLoadError();
    }
    alignOrigin(root, bounds, this.origin);

    this.splatMesh = splatMesh;
    this.contentRoot = root;
    this.bounds.copy(bounds);
    this.add(root);
    await this.createSparkRendererIfNeeded(generation);
    this.assertModelLoadCurrent(generation);
    this.finishModelLoad();
  }

  private finishModelLoad(): void {
    this.syncInteractionSurfaces();
  }

  private setupAnimations(gltf: GLTF): void {
    if (gltf.animations.length === 0) return;
    this.animationMixer = new THREE.AnimationMixer(gltf.scene);
    for (const clip of gltf.animations) {
      const action = this.animationMixer.clipAction(clip);
      this.animationActions.push(action);
      if (this.autoplay) action.play();
    }
  }

  private syncInteractionSurfaces(): void {
    this.clearHitRegistrations();
    this.replaceRotationHitSurface();
    this.replacePlatform();
    if (!this.contentRoot) return;

    const config = normalizeManipulationConfig(this.xb?.manipulation);
    this.registerHitSurface(this.contentRoot);

    if (this.bounds.isEmpty()) {
      this.applyShadows();
      if (this.occlusionEnabled) this.applyOcclusion();
      return;
    }

    if (config?.rotate) {
      const rotationHitSurface = new RotationHitSurface(this.bounds);
      this.rotationHitSurface = rotationHitSurface;
      this.add(rotationHitSurface);
      this.registerHitSurface(rotationHitSurface);
    }

    if (config?.translate) {
      const size = this.bounds.getSize(new THREE.Vector3());
      const center = this.bounds.getCenter(new THREE.Vector3());
      const platform = new ModelViewerPlatform(
        size.x + PLATFORM_MARGIN,
        size.z + PLATFORM_MARGIN,
        PLATFORM_THICKNESS
      );
      platform.position.set(
        center.x,
        this.bounds.min.y - PLATFORM_THICKNESS / 2,
        center.z
      );
      platform.setHovered(this.hoveringControllers.size > 0);
      this.platform = platform;
      this.add(platform);
      this.registerHitSurface(platform);
    }

    this.applyShadows();
    if (this.occlusionEnabled) this.applyOcclusion();
  }

  private registerHitSurface(physical: THREE.Object3D): void {
    if (!this.interaction) return;
    this.unregisterHitSurfaces.push(
      this.interaction.registerHitSurface(physical, this)
    );
  }

  private clearHitRegistrations(): void {
    for (const unregister of this.unregisterHitSurfaces) unregister();
    this.unregisterHitSurfaces.length = 0;
  }

  private replaceRotationHitSurface(next?: RotationHitSurface): void {
    this.rotationHitSurface?.dispose();
    this.rotationHitSurface = next;
    if (next) this.add(next);
  }

  private replacePlatform(next?: ModelViewerPlatform): void {
    this.platform?.dispose();
    this.platform = next;
    if (next) this.add(next);
  }

  private applyShadows(): void {
    this.contentRoot?.traverse((object) => {
      object.castShadow = this.castShadow;
      object.receiveShadow = this.receiveShadow;
    });
    if (this.platform) {
      this.platform.castShadow = false;
      this.platform.receiveShadow = this.receiveShadow;
    }
  }

  private applyOcclusion(): void {
    if (!this.gltf) return;

    this.gltf.scene.traverse((object) => {
      const mesh = object as THREE.Mesh;
      if (!mesh.isMesh) return;
      mesh.layers.enable(OCCLUDABLE_ITEMS_LAYER);
      for (const material of asMaterials(mesh.material)) {
        this.makeMaterialOccludable(material);
      }
    });
    if (this.platform) {
      this.platform.layers.enable(OCCLUDABLE_ITEMS_LAYER);
      for (const material of this.platform.material) {
        this.makeMaterialOccludable(material);
      }
    }
  }

  private makeMaterialOccludable(material: THREE.Material): void {
    if (this.occludableMaterials.has(material)) return;
    this.occludableMaterials.add(material);
    material.transparent = true;
    const previous = material.onBeforeCompile;
    material.onBeforeCompile = (shader, renderer) => {
      previous.call(material, shader, renderer);
      OcclusionUtils.addOcclusionToShader(shader);
      this.registerOccludableShader(shader);
    };
    material.needsUpdate = true;
  }

  private registerOccludableShader(shader: Shader): void {
    this.occludableShaders.add(shader);
    this.depth?.occludableShaders.add(shader);
  }

  private unregisterOcclusionShaders(depth = this.depth): void {
    if (!depth) return;
    for (const shader of this.occludableShaders) {
      depth.occludableShaders.delete(shader);
    }
  }

  private async createSparkRendererIfNeeded(
    generation = this.loadGeneration
  ): Promise<void> {
    if (!this.splatMesh || !this.scene || !this.renderer || !this.registry) {
      return;
    }

    const {SparkRenderer} = await import('@sparkjsdev/spark');
    if (!this.isModelLoadCurrent(generation)) return;
    let sparkRenderer: InstanceType<typeof SparkRenderer> | undefined;
    this.scene.traverse((object) => {
      if (object instanceof SparkRenderer) sparkRenderer = object;
    });
    if (!sparkRenderer) {
      sparkRenderer = new SparkRenderer({
        renderer: this.renderer,
        maxStdDev: Math.sqrt(4),
      });
      this.scene.add(sparkRenderer);
    }
    if (!this.registry.get(SparkRendererHolder)) {
      this.registry.register(new SparkRendererHolder(sparkRenderer));
    }
  }

  private beginModelLoad(): number {
    if (!this.acceptingLoads) {
      throw new Error('ModelViewer cannot load content after disposal.');
    }
    const generation = ++this.loadGeneration;
    this.releaseLoadedModel();
    return generation;
  }

  private isModelLoadCurrent(generation: number): boolean {
    return this.acceptingLoads && generation === this.loadGeneration;
  }

  private assertModelLoadCurrent(generation: number): void {
    if (!this.isModelLoadCurrent(generation)) throw this.staleModelLoadError();
  }

  private staleModelLoadError(): Error {
    return new Error('ModelViewer load was superseded or disposed.');
  }

  private releaseLoadedModel(): void {
    this.clearHitRegistrations();
    this.replaceRotationHitSurface();
    this.replacePlatform();
    this.unregisterOcclusionShaders();
    this.occludableShaders.clear();

    this.animationMixer?.stopAllAction();
    if (this.animationMixer && this.gltf) {
      this.animationMixer.uncacheRoot(this.gltf.scene);
    }
    this.animationMixer = undefined;
    this.animationActions.length = 0;

    if (this.gltf) {
      this.gltf.scene.removeFromParent();
      disposeObjectTree(this.gltf.scene);
      this.gltf = undefined;
    }
    if (this.splatMesh) {
      this.splatMesh.removeFromParent();
      this.splatMesh.dispose();
      this.splatMesh = undefined;
    }
    this.contentRoot?.removeFromParent();
    this.contentRoot = undefined;
    this.bounds.makeEmpty();
  }
}

function normalizeViewerManipulation(
  value: boolean | ManipulationOptions | undefined
): boolean | ManipulationOptions | undefined {
  if (value === undefined || value === true) {
    return {
      actions: {translate: true, rotate: true, scale: true},
      handle: {action: ManipulationAction.Rotate},
    };
  }
  return value;
}

function normalizeSource(source: string | ModelSource): ModelSource {
  return typeof source === 'string' ? {url: source} : source;
}

function fileExtension(url: string): string {
  const cleanUrl = url.split(/[?#]/, 1)[0];
  const dot = cleanUrl.lastIndexOf('.');
  const slash = cleanUrl.lastIndexOf('/');
  return dot > slash ? cleanUrl.slice(dot + 1).toLowerCase() : '';
}

function applyAssetTransform(root: THREE.Object3D, source: ModelSource): void {
  if (typeof source.scale === 'number') root.scale.setScalar(source.scale);
  else if (source.scale) root.scale.copy(source.scale);
  if (source.rotation) {
    root.rotation.set(source.rotation.x, source.rotation.y, source.rotation.z);
  }
}

function alignOrigin(
  root: THREE.Object3D,
  bounds: THREE.Box3,
  origin: ModelViewerOrigin
): void {
  if (origin === 'source' || bounds.isEmpty()) return;
  const translation = bounds.getCenter(new THREE.Vector3()).multiplyScalar(-1);
  if (origin === 'bottom-center') translation.y = -bounds.min.y;
  root.position.add(translation);
  bounds.translate(translation);
}

function asMaterials(
  material: THREE.Material | THREE.Material[]
): THREE.Material[] {
  return Array.isArray(material) ? material : [material];
}
