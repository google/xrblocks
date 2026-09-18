import type RAPIER_NS from 'rapier3d';
import * as THREE from 'three';

import {MeshScript} from '../core/Script';
import {disposeMaterial} from '../utils/ThreeDisposal';

import {
  computeGridVertexNormals,
  createDepthPlaneGeometry,
  DepthGeometryUpdater,
} from './DepthMeshGeometry';
import {DepthMeshTexturedShader} from './DepthMeshTexturedShader';
import {DepthMeshOptions, DepthOptions} from './DepthOptions';
import {DepthTextures} from './DepthTextures';

export class DepthMesh extends MeshScript {
  static isDepthMesh = true;
  private worldPosition = new THREE.Vector3();
  private worldQuaternion = new THREE.Quaternion();
  private updateVertexNormals = false;

  private minDepth = 8;
  private maxDepth = 0;
  private minDepthPrev = 8;
  private maxDepthPrev = 0;

  downsampledGeometry?: THREE.BufferGeometry;
  downsampledMesh?: THREE.Mesh;

  private collider?: RAPIER_NS.Collider;
  private colliders: RAPIER_NS.Collider[] = [];
  private colliderUpdateFps: number;

  private projectionMatrixInverse: Readonly<THREE.Matrix4> =
    new THREE.Matrix4();
  private lastColliderUpdateTime = 0;
  private options: DepthMeshOptions;
  private depthTextureMaterialUniforms?;
  private customMaterialUpdateCallback?: () => void;

  private RAPIER?: typeof RAPIER_NS;
  private blendedWorld?: RAPIER_NS.World;
  private rigidBody?: RAPIER_NS.RigidBody;
  private colliderId = 0;
  private disposed = false;
  private readonly gridResolution: number;
  private readonly geometryUpdater = new DepthGeometryUpdater();

  constructor(
    private depthOptions: DepthOptions,
    width: number,
    height: number,
    private depthTextures?: DepthTextures
  ) {
    const options = depthOptions.depthMesh;
    const depthResolution = options.depthFullResolution;
    const ignoreEdgePixels = options.ignoreEdgePixels;
    const activeRes = Math.max(2, depthResolution - 2 * ignoreEdgePixels);
    const minU = ignoreEdgePixels / (depthResolution - 1);
    const maxU =
      (depthResolution - 1 - ignoreEdgePixels) / (depthResolution - 1);
    const minV = ignoreEdgePixels / (depthResolution - 1);
    const maxV =
      (depthResolution - 1 - ignoreEdgePixels) / (depthResolution - 1);

    const geometry = createDepthPlaneGeometry(
      activeRes - 1,
      minU,
      maxU,
      minV,
      maxV
    );

    let material: THREE.Material;
    let uniforms;
    if (options.useDepthTexture || options.showDebugTexture) {
      uniforms = {
        uDepthTexture: {value: null as THREE.Texture | null},
        uDepthTextureArray: {value: null as THREE.Texture | null},
        uIsTextureArray: {value: 0.0},
        uColor: {value: new THREE.Color(0xaaaaaa)},
        uResolution: {value: new THREE.Vector2(width, height)},
        uRawValueToMeters: {value: 1.0},
        uMinDepth: {value: 0.0},
        uMaxDepth: {value: 8.0},
        uOpacity: {value: options.opacity},
        uDebug: {value: options.showDebugTexture ? 1.0 : 0.0},
        uLightDirection: {value: new THREE.Vector3(1.0, 1.0, 1.0).normalize()},
        uUsingFloatDepth: {
          value: depthOptions.dataFormatPreference[0] === 'float32',
        },
        uUseDerivativeNormals: {
          value: !options.updateVertexNormals,
        },
        uNormDepthBufferFromNormView: {value: new THREE.Matrix4()},
      };
      material = new THREE.ShaderMaterial({
        uniforms: uniforms,
        vertexShader: DepthMeshTexturedShader.vertexShader,
        fragmentShader: DepthMeshTexturedShader.fragmentShader,
        side: THREE.DoubleSide,
        transparent: true,
      });
    } else {
      material = new THREE.ShadowMaterial({opacity: options.shadowOpacity});
      material.depthWrite = false;
    }

    material.visible = options.showDebugTexture || options.renderShadow;
    super(geometry, material);

    this.gridResolution = activeRes;
    this.visible = true;
    this.xb = {pointerEvents: 'none', reticleMode: 'surface'};
    this.options = options;
    this.lastColliderUpdateTime = performance.now();
    this.updateVertexNormals = options.updateVertexNormals;
    this.colliderUpdateFps = options.colliderUpdateFps;
    this.depthTextureMaterialUniforms = uniforms;
    if (options.renderShadow) {
      this.receiveShadow = true;
      this.castShadow = false;
    }

    // Create a downsampled geometry for raycasts and physics.
    if (options.useDownsampledGeometry) {
      this.downsampledGeometry = createDepthPlaneGeometry(
        39,
        minU,
        maxU,
        minV,
        maxV
      );
      this.downsampledMesh = new THREE.Mesh(this.downsampledGeometry, material);
      this.downsampledMesh.visible = false;
    }
  }

  get depthTextureUniforms() {
    return this.depthTextureMaterialUniforms;
  }

  /**
   * Sets a custom material (such as a WebGPU NodeMaterial) and registers a
   * callback to synchronize uniforms on depth updates.
   *
   * @param material - The material to apply to the depth mesh.
   * @param onUpdate - Optional callback invoked whenever depth uniforms change.
   */
  setCustomMaterial(material: THREE.Material, onUpdate?: () => void) {
    disposeMaterial(this.material);
    material.visible =
      this.options.showDebugTexture || this.options.renderShadow;
    if (this.depthTextureMaterialUniforms) {
      (material as THREE.Material & {uniforms?: unknown}).uniforms =
        this.depthTextureMaterialUniforms;
    }
    this.material = material;
    if (this.downsampledMesh) {
      this.downsampledMesh.material = material;
    }
    this.customMaterialUpdateCallback = onUpdate;
    this.onBeforeRender = () => {
      this.customMaterialUpdateCallback?.();
    };
  }

  /**
   * Updates the depth data and geometry positions based on the provided camera
   * and depth data.
   */
  updateDepth(
    depthData: Readonly<XRCPUDepthInformation>,
    projectionMatrixInverse: Readonly<THREE.Matrix4>,
    depthDataFormat: XRDepthDataFormat
  ) {
    this.projectionMatrixInverse = projectionMatrixInverse;

    this.minDepth = 8;
    this.maxDepth = 0;

    if (this.options.updateFullResolutionGeometry) {
      this.updateFullResolutionGeometry(depthData, depthDataFormat);
    }
    if (this.downsampledGeometry) {
      this.updateGeometry(depthData, this.downsampledGeometry, depthDataFormat);
      // The downsampled geometry's positions just changed, so bump its
      // version. Consumers that cache work keyed on the position attribute's
      // version (e.g. FaceRecognizer's depth-mesh snapshot + BVH) rely on this
      // to invalidate; without it they reuse a stale clone from the first
      // detection and every raycast misses.
      this.downsampledGeometry.attributes.position.needsUpdate = true;
    }

    this.minDepthPrev = this.minDepth;
    this.maxDepthPrev = this.maxDepth;
    this.geometry.attributes.position.needsUpdate = true;

    const depthTextureLeft = this.depthTextures?.get(0);
    if (depthTextureLeft && this.depthTextureMaterialUniforms) {
      this.depthTextureMaterialUniforms.uUsingFloatDepth.value =
        depthDataFormat === 'float32';
      this.depthTextureMaterialUniforms.uUseDerivativeNormals.value =
        !this.options.updateVertexNormals;
      if (depthData.normDepthBufferFromNormView) {
        this.depthTextureMaterialUniforms.uNormDepthBufferFromNormView.value.fromArray(
          depthData.normDepthBufferFromNormView.matrix
        );
      } else {
        this.depthTextureMaterialUniforms.uNormDepthBufferFromNormView.value.identity();
      }
      const isTextureArray = depthTextureLeft instanceof THREE.ExternalTexture;
      this.depthTextureMaterialUniforms.uIsTextureArray.value = isTextureArray
        ? 1.0
        : 0;
      if (isTextureArray)
        this.depthTextureMaterialUniforms.uDepthTextureArray.value =
          depthTextureLeft;
      else
        this.depthTextureMaterialUniforms.uDepthTexture.value =
          depthTextureLeft;
      this.depthTextureMaterialUniforms.uMinDepth.value = this.minDepth;
      this.depthTextureMaterialUniforms.uMaxDepth.value = this.maxDepth;
      this.depthTextureMaterialUniforms.uRawValueToMeters.value = this
        .depthTextures!.depthData.length
        ? this.depthTextures!.depthData[0].rawValueToMeters
        : 1.0;
    }

    this.customMaterialUpdateCallback?.();

    if (this.options.updateVertexNormals) {
      computeGridVertexNormals(
        this.geometry,
        this.gridResolution,
        this.gridResolution
      );
    }

    this.updateColliderIfNeeded();
  }

  updatePose(translation: THREE.Vector3, quaternion: THREE.Quaternion) {
    this.position.copy(translation);
    this.quaternion.copy(quaternion);
    if (this.downsampledMesh) {
      this.downsampledMesh.position.copy(translation);
      this.downsampledMesh.quaternion.copy(quaternion);
      this.downsampledMesh.updateMatrixWorld();
    }
  }

  /**
   * Method to manually update the full resolution geometry.
   * Only needed if options.updateFullResolutionGeometry is false.
   */
  updateFullResolutionGeometry(
    depthData: XRCPUDepthInformation,
    depthDataFormat: XRDepthDataFormat
  ) {
    this.updateGeometry(depthData, this.geometry, depthDataFormat);
  }

  /**
   * Internal method to update the geometry of the depth mesh.
   */
  private updateGeometry(
    depthData: XRCPUDepthInformation,
    geometry: THREE.BufferGeometry,
    depthDataFormat: XRDepthDataFormat
  ) {
    const bounds = this.geometryUpdater.updateGeometryPositions({
      depthData,
      geometry,
      depthDataFormat,
      projectionMatrixInverse: this.projectionMatrixInverse,
      patchHoles: this.options.patchHoles,
      patchHolesUpper: this.options.patchHolesUpper,
      minDepthPrev: this.minDepthPrev,
      maxDepthPrev: this.maxDepthPrev,
      minDepth: this.minDepth,
      maxDepth: this.maxDepth,
    });
    this.minDepth = bounds.minDepth;
    this.maxDepth = bounds.maxDepth;
  }

  /**
   * Optimizes collider updates to run periodically based on the specified FPS.
   */
  private updateColliderIfNeeded() {
    const timeSinceLastUpdate = performance.now() - this.lastColliderUpdateTime;
    if (this.RAPIER && timeSinceLastUpdate > 1000 / this.colliderUpdateFps) {
      this.getWorldPosition(this.worldPosition);
      this.getWorldQuaternion(this.worldQuaternion);
      this.rigidBody!.setTranslation(this.worldPosition, false);
      this.rigidBody!.setRotation(this.worldQuaternion, false);

      const geometry = this.downsampledGeometry
        ? this.downsampledGeometry
        : this.geometry;
      const vertices = geometry.attributes.position.array as Float32Array;
      const indices = geometry.getIndex()!.array as Uint32Array;
      // Changing the density does not fix the issue.
      const shape = this.RAPIER.ColliderDesc.trimesh(
        vertices,
        indices
      ).setDensity(1.0);
      // const convextHull = this.RAPIER.ColliderDesc.convexHull(vertices);

      if (this.options.useDualCollider) {
        this.colliderId = (this.colliderId + 1) % 2;
        this.blendedWorld!.removeCollider(
          this.colliders[this.colliderId],
          false
        );
        this.colliders[this.colliderId] = this.blendedWorld!.createCollider(
          shape,
          this.rigidBody
        );
      } else {
        const newCollider = this.blendedWorld!.createCollider(
          shape,
          this.rigidBody
        );
        this.blendedWorld!.removeCollider(this.collider!, /*wakeUp=*/ false);
        this.collider = newCollider;
      }

      this.lastColliderUpdateTime = performance.now();
    }
  }

  initRapierPhysics(RAPIER: typeof RAPIER_NS, blendedWorld: RAPIER_NS.World) {
    this.getWorldPosition(this.worldPosition);
    this.getWorldQuaternion(this.worldQuaternion);
    const desc = RAPIER.RigidBodyDesc.fixed()
      .setTranslation(
        this.worldPosition.x,
        this.worldPosition.y,
        this.worldPosition.z
      )
      .setRotation(this.worldQuaternion);
    this.rigidBody = blendedWorld.createRigidBody(desc);
    const vertices = this.geometry.attributes.position.array as Float32Array;
    const indices = this.geometry.getIndex()!.array as Uint32Array;
    const shape = RAPIER.ColliderDesc.trimesh(vertices, indices);

    if (this.options.useDualCollider) {
      this.colliders = [];
      this.colliders.push(
        blendedWorld.createCollider(shape, this.rigidBody),
        blendedWorld.createCollider(shape, this.rigidBody)
      );
      this.colliderId = 0;
    } else {
      this.collider = blendedWorld.createCollider(shape, this.rigidBody);
    }

    this.RAPIER = RAPIER;
    this.blendedWorld = blendedWorld;
    this.lastColliderUpdateTime = performance.now();
  }

  /**
   * Customizes raycasting to compute normals for intersections.
   * @param raycaster - The raycaster object.
   * @param intersects - Array to store intersections.
   * @returns - True if intersections are found.
   */
  override raycast(
    raycaster: THREE.Raycaster,
    intersects: THREE.Intersection[]
  ) {
    const intersections: THREE.Intersection[] = [];
    if (this.downsampledMesh) {
      this.downsampledMesh.raycast(raycaster, intersections);
    } else {
      super.raycast(raycaster, intersections);
    }

    intersections.forEach((intersect) => {
      intersect.object = this;
    });
    if (!this.updateVertexNormals) {
      // Use the face normals instead of attribute normals.
      intersections.forEach((intersect) => {
        if (intersect.normal && intersect.face) {
          intersect.normal.copy(intersect.face.normal);
        }
      });
    }

    intersects.push(...intersections);
    return true;
  }

  getColliderFromHandle(handle: RAPIER_NS.ColliderHandle) {
    if (this.collider?.handle == handle) {
      return this.collider;
    }
    for (const collider of this.colliders) {
      if (collider?.handle == handle) {
        return collider;
      }
    }
    return undefined;
  }

  /** Called by Depth at terminal teardown, not on Script disconnection. */
  disposeResources() {
    if (this.disposed) return;
    this.disposed = true;

    const world = this.blendedWorld;
    const body = this.rigidBody;
    this.blendedWorld = undefined;
    this.rigidBody = undefined;
    this.RAPIER = undefined;
    this.collider = undefined;
    this.colliders.length = 0;

    let firstError: unknown;
    const cleanups = [
      () => {
        // Removing the body also removes its single or dual colliders.
        if (body) world!.removeRigidBody(body);
      },
      () => this.geometry.dispose(),
      () => this.downsampledGeometry?.dispose(),
      () => disposeMaterial(this.material),
    ];
    for (const cleanup of cleanups) {
      try {
        cleanup();
      } catch (error: unknown) {
        firstError ??= error;
      }
    }
    this.downsampledMesh?.removeFromParent();
    this.downsampledMesh = undefined;
    this.downsampledGeometry = undefined;
    if (this.depthTextureMaterialUniforms) {
      this.depthTextureMaterialUniforms.uDepthTexture.value = null;
      this.depthTextureMaterialUniforms.uDepthTextureArray.value = null;
    }
    this.depthTextures = undefined;
    if (firstError !== undefined) throw firstError;
  }
}
