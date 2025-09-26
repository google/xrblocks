import * as THREE from 'three';
import {DRACOLoader} from 'three/addons/loaders/DRACOLoader.js';
import {GLTF, GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {KTX2Loader} from 'three/addons/loaders/KTX2Loader.js';

/**
 * The base URL for Three.js JSM examples, used for DRACO and KTX2 decoders.
 */
const jsmUrl =
    `https://cdn.jsdelivr.net/npm/three@0.${THREE.REVISION}.0/examples/jsm/`;

/**
 * The configured GLTFLoader instance.
 */
let gltfLoaderInstance: GLTFLoader|undefined;

function getGLTFLoader(
    renderer?: THREE.WebGLRenderer, manager?: THREE.LoadingManager) {
  if (gltfLoaderInstance) {
    return gltfLoaderInstance;
  }
  const dracoLoader = new DRACOLoader(manager);
  dracoLoader.setDecoderPath(jsmUrl + 'libs/draco/');
  dracoLoader.setDecoderConfig({type: 'js'});
  const ktx2Loader = new KTX2Loader(manager);
  ktx2Loader.setTranscoderPath(jsmUrl + 'libs/basis/');
  if (renderer) {
    ktx2Loader.detectSupport(renderer);
  }

  gltfLoaderInstance = new GLTFLoader(manager);
  gltfLoaderInstance.setDRACOLoader(dracoLoader);
  gltfLoaderInstance.setKTX2Loader(ktx2Loader);
  return gltfLoaderInstance;
}

export type ModelLoaderLoadGLTFOptions = {
  /** The base path for the model files. */
  path?: string;
  /** The URL of the model file. */
  url: string;
  /** The renderer. */
  renderer?: THREE.WebGLRenderer;
};

export type ModelLoaderLoadOptions = ModelLoaderLoadGLTFOptions&{
  /**
   * Optional callback for loading progress. Note: This will be ignored if a
   * LoadingManager is provided.
   */
  onProgress?: (event: ProgressEvent) => void;
};

/**
 * Manages the loading of 3D models, automatically handling dependencies
 * like DRACO and KTX2 loaders.
 */
export class ModelLoader {
  private manager: THREE.LoadingManager;

  /**
   * Creates an instance of ModelLoader.
   * @param manager - The
   *     loading manager to use,
   * required for KTX2 texture support.
   */
  constructor(manager = THREE.DefaultLoadingManager) {
    this.manager = manager;
  }

  /**
   * Loads a model based on its file extension. Supports .gltf, .glb,
   * .ply, .spz, .splat, and .ksplat.
   * @returns A promise that resolves with the loaded model data (e.g., a glTF
   *     scene or a SplatMesh).
   */
  async load({path, url = '', renderer = undefined, onProgress = undefined}:
                 ModelLoaderLoadOptions) {
    if (onProgress) {
      console.warn(
          'ModelLoader: An onProgress callback was provided to load(), ' +
          'but a LoadingManager is in use. Progress will be reported via the ' +
          'LoadingManager\'s onProgress callback. The provided callback will be ignored.');
    }
    const extension = url.split('.').pop()?.toLowerCase() || '';
    const splatExtensions = ['ply', 'spz', 'splat', 'ksplat'];
    const gltfExtensions = ['gltf', 'glb'];

    if (gltfExtensions.includes(extension)) {
      return await this.loadGLTF({path, url, renderer});
    } else if (splatExtensions.includes(extension)) {
      return await this.loadSplat({url});
    }
    console.error('Unsupported file type: ' + extension);
    return null;
  }

  /**
   * Loads a 3DGS model (.ply, .spz, .splat, .ksplat).
   * @param url - The URL of the model file.
   * @returns A promise that resolves with the loaded
   * SplatMesh object.
   */
  async loadSplat({url = ''}) {
    const {SplatMesh} = await import('@sparkjsdev/spark');  // Dynamic import
    const splatMesh = new SplatMesh({url});
    await splatMesh.initialized;
    return splatMesh;
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
    const loader = getGLTFLoader(renderer, this.manager);
    if (path) {
      loader.setPath(path);
    }
    return new Promise<GLTF>((resolve, reject) => {
      loader.load(
          url, (gltf) => resolve(gltf), undefined, (error) => reject(error));
    });
  }
}
