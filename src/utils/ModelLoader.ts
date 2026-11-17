import type {CoordinateSystem} from '@sparkjsdev/radix';
import * as THREE from 'three';
import {DRACOLoader} from 'three/addons/loaders/DRACOLoader.js';
import {GLTF, GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {KTX2Loader} from 'three/addons/loaders/KTX2Loader.js';

import {Core} from '../core/Core';
import type {Registry} from '../core/components/Registry';
import {
  isSerializerRenderer,
  isWebGPURenderer,
  RendererHolder,
  type SupportedRenderer,
  type WebGLOrWebGPURenderer,
} from '../core/RendererTypes';
import {
  loadManagerRadixModule,
  RadixSplatManager,
} from '../splats/RadixSplatManager';
import {
  computeRadixSplatBounds,
  RadixSplatObject,
} from '../splats/RadixSplatObject';

import {
  getModelFileExtension,
  GLTF_EXTENSIONS,
  RADIX_SPLAT_EXTENSIONS,
  SPARK_SPLAT_EXTENSIONS,
  SPLAT_EXTENSIONS,
} from './ModelUtils';
import {SparkRendererHolder} from './SparkRendererHolder';

/**
 * The base URL for Three.js JSM examples, used for DRACO and KTX2 decoders.
 */
const jsmUrl = `https://cdn.jsdelivr.net/npm/three@0.${THREE.REVISION}.0/examples/jsm/`;

function createGLTFLoader(manager?: THREE.LoadingManager) {
  const dracoLoader = new DRACOLoader(manager);
  dracoLoader.setDecoderPath(jsmUrl + 'libs/draco/');
  const ktx2Loader = new KTX2Loader(manager);
  ktx2Loader.setTranscoderPath(jsmUrl + 'libs/basis/');

  const gltfLoader = new GLTFLoader(manager);
  gltfLoader.setDRACOLoader(dracoLoader);
  gltfLoader.setKTX2Loader(ktx2Loader);
  return {gltfLoader, ktx2Loader};
}

export type ModelLoaderLoadGLTFOptions = {
  /** The base path for the model files. */
  path?: string;
  /** The URL of the model file. */
  url: string;
  /** The renderer. */
  renderer?: SupportedRenderer;
};

export type ModelLoaderLoadSplatOptions = {
  /** The URL of the 3DGS model file. */
  url?: string;
  /**
   * Renderer used to determine the 3DGS backend (`@sparkjsdev/radix` for
   * `WebGPURenderer`, `@sparkjsdev/spark` for `THREE.WebGLRenderer`). Defaults
   * to the active `Core` renderer when initialized.
   */
  renderer?: SupportedRenderer;
  /** Optional target coordinate system when decoding via `@sparkjsdev/radix`. */
  coordinateSystem?: CoordinateSystem;
  /** Optional Spherical Harmonics degree cap (`0` or `false` disables SH) on Radix. */
  sh?: number | false;
  /**
   * Pre-builds a GPU uniform opacity modifier on `RadixSplatObject` so runtime
   * fades (`splat.opacity = ...`) update in O(1).
   */
  dynamicOpacity?: boolean;
};

export type ModelLoaderLoadOptions = ModelLoaderLoadGLTFOptions & {
  /**
   * Optional callback for loading progress. Note: This will be ignored if a
   * LoadingManager is provided.
   */
  onProgress?: (event: ProgressEvent) => void;
};

/**
 * Manages the loading of 3D models, automatically handling dependencies
 * like DRACO and KTX2 loaders as well as dual-backend 3D Gaussian Splatting.
 */
export class ModelLoader {
  private manager: THREE.LoadingManager;
  private gltfLoader?: GLTFLoader;
  private ktx2Loader?: KTX2Loader;
  private ktxRenderer?: WebGLOrWebGPURenderer;

  /**
   * Creates an instance of ModelLoader.
   * @param manager - The
   *     loading manager to use,
   * required for KTX2 texture support.
   */
  constructor(manager = THREE.DefaultLoadingManager) {
    this.manager = manager;
  }

  private getGLTFLoader(renderer?: SupportedRenderer) {
    if (!this.gltfLoader) {
      const {gltfLoader, ktx2Loader} = createGLTFLoader(this.manager);
      this.gltfLoader = gltfLoader;
      this.ktx2Loader = ktx2Loader;
    }
    if (
      renderer &&
      !isSerializerRenderer(renderer) &&
      renderer !== this.ktxRenderer
    ) {
      this.ktx2Loader!.detectSupport(renderer);
      this.ktxRenderer = renderer;
    }
    return this.gltfLoader;
  }

  /**
   * Loads a model based on its file extension. Supports `.gltf`, `.glb`,
   * `.ply`, `.spz`, `.rad`, `.rdx`, `.splat`, and `.ksplat`.
   * @returns A promise that resolves with the loaded model data (e.g., a glTF
   *     object, a `RadixSplatObject`, or a Spark `SplatMesh`).
   */
  async load({
    path,
    url = '',
    renderer = undefined,
    onProgress = undefined,
  }: ModelLoaderLoadOptions) {
    if (onProgress) {
      console.warn(
        'ModelLoader: An onProgress callback was provided to load(), ' +
          'but a LoadingManager is in use. Progress will be reported via the ' +
          "LoadingManager's onProgress callback. The provided callback will be ignored."
      );
    }
    const extension = getModelFileExtension(url);

    if (GLTF_EXTENSIONS.has(extension)) {
      return await this.loadGLTF({path, url, renderer});
    } else if (SPLAT_EXTENSIONS.has(extension)) {
      return await this.loadSplat({url, renderer});
    }
    console.error('Unsupported file type: ' + extension);
    return null;
  }

  /**
   * Loads a 3D Gaussian Splatting model.
   *
   * `@sparkjsdev/radix` is built on TSL (`NodeMaterial`), so it handles all
   * `THREE.WebGPURenderer` sessions—both native WebGPU compute and
   * `WebGPURenderer`'s WebGL2 + worker-sort fallback (`forceWebGL: true`).
   * `@sparkjsdev/spark` is retained for classic `THREE.WebGLRenderer` (which
   * cannot compile TSL) and legacy `.splat` / `.ksplat` assets.
   */
  async loadSplat({
    url = '',
    renderer = undefined,
    coordinateSystem = undefined,
    sh = undefined,
    dynamicOpacity = false,
  }: ModelLoaderLoadSplatOptions = {}) {
    const extension = getModelFileExtension(url);
    const activeCore = Core.instance;
    const coreRenderer = activeCore?.registry.get(RendererHolder)?.renderer;
    const resolvedRenderer = renderer ?? coreRenderer;

    if (isWebGPURenderer(resolvedRenderer)) {
      if (extension && !RADIX_SPLAT_EXTENSIONS.has(extension)) {
        throw new Error(
          `Radix (WebGPURenderer) supports .ply, .spz, .rad, and .rdx splat files; got .${extension}. ` +
            'Convert the asset to .spz/.ply/.rad/.rdx or use THREE.WebGLRenderer with @sparkjsdev/spark.'
        );
      }

      const targetManager =
        activeCore && coreRenderer === resolvedRenderer
          ? (activeCore.registry.get(RadixSplatManager) ?? activeCore.splats)
          : undefined;

      const radix = targetManager
        ? await loadManagerRadixModule(targetManager)
        : await import('@sparkjsdev/radix');
      const loaded = await radix.loadSplatFile(url, {
        coordinateSystem,
        sh: sh === false || sh === 0 ? false : undefined,
      });
      if (targetManager?.isDisposed) {
        throw new Error('RadixSplatManager has been disposed.');
      }

      const boundingBox = computeRadixSplatBounds(loaded.splats, radix);
      const gpuSplats = radix.GpuArrays.fromData(
        resolvedRenderer,
        loaded.splats
      );
      const gpuShPalette = loaded.shPalette
        ? radix.GpuShPalette.upload(resolvedRenderer, loaded.shPalette)
        : undefined;

      const splatObject = new RadixSplatObject({
        gpuSplats,
        gpuShPalette,
        boundingBox,
        radix,
        options: {sh, dynamicOpacity},
      });

      if (targetManager) {
        try {
          await targetManager.register(splatObject);
        } catch (error) {
          splatObject.dispose();
          throw error;
        }
      }
      return splatObject;
    }

    if (isSerializerRenderer(resolvedRenderer)) {
      throw new Error(
        'Gaussian splat loading is not supported with SerializerRenderer.'
      );
    }

    if (extension && !SPARK_SPLAT_EXTENSIONS.has(extension)) {
      throw new Error(
        `Format .${extension} requires @sparkjsdev/radix with THREE.WebGPURenderer ` +
          '(enable via options.enableSplats() or options.enableWebGPU()).'
      );
    }

    const {SplatMesh} = await import('@sparkjsdev/spark');
    const splatMesh = new SplatMesh({url});
    await splatMesh.initialized;
    if (
      activeCore &&
      coreRenderer === resolvedRenderer &&
      resolvedRenderer instanceof THREE.WebGLRenderer &&
      activeCore.lifecycle !== 'disposing' &&
      activeCore.lifecycle !== 'disposed'
    ) {
      const splatsOpts = activeCore.options?.splats;
      await ensureSceneSparkRenderer({
        scene: activeCore.scene,
        renderer: resolvedRenderer,
        registry: activeCore.registry,
        maxStdDev: splatsOpts?.maxStdDev,
        renderOrder: splatsOpts?.enabled ? splatsOpts.renderOrder : undefined,
      });
    }
    return Object.assign(splatMesh, {
      boundingBox: splatMesh.getBoundingBox(false),
    });
  }

  /**
   * Loads a GLTF or GLB model.
   * @param options - The loading options.
   * @returns A promise that resolves with the loaded glTF object.
   */
  async loadGLTF({
    path,
    url = '',
    renderer = undefined,
  }: ModelLoaderLoadGLTFOptions) {
    const loader = this.getGLTFLoader(renderer);
    loader.setPath(path ?? '');
    return new Promise<GLTF>((resolve, reject) => {
      loader.load(
        url,
        (gltf) => resolve(gltf),
        undefined,
        (error) => reject(error)
      );
    });
  }
}

/**
 * Ensures a shared `@sparkjsdev/spark` `SparkRenderer` exists in `scene` and is
 * registered under `SparkRendererHolder` when running on `THREE.WebGLRenderer`.
 */
export async function ensureSceneSparkRenderer({
  scene,
  renderer,
  registry,
  maxStdDev,
  renderOrder,
}: {
  scene: THREE.Scene;
  renderer: THREE.WebGLRenderer;
  registry?: Registry;
  maxStdDev?: number;
  renderOrder?: number;
}): Promise<void> {
  const {SparkRenderer} = await import('@sparkjsdev/spark');
  let sparkRenderer = registry?.get(SparkRendererHolder)?.renderer;
  if (!sparkRenderer) {
    scene.traverse((object) => {
      if (object instanceof SparkRenderer) sparkRenderer = object;
    });
  }
  if (!sparkRenderer) {
    sparkRenderer = new SparkRenderer({
      renderer,
      maxStdDev: maxStdDev ?? Math.sqrt(4),
    });
    if (renderOrder !== undefined) {
      sparkRenderer.renderOrder = renderOrder;
    }
    scene.add(sparkRenderer);
  }
  if (registry && !registry.get(SparkRendererHolder)) {
    registry.register(new SparkRendererHolder(sparkRenderer));
  }
}
