import type RAPIER_NS from 'rapier3d';
import * as THREE from 'three';

import {MeshScript} from '../core/Script';
import {clamp} from '../utils/utils';

import {DepthMeshTexturedShader} from './DepthMeshTexturedShader';
import {DepthMeshOptions, DepthOptions} from './DepthOptions';
import {DepthTextures} from './DepthTextures';

export class DepthMesh extends MeshScript {
  static dependencies = {
    renderer: THREE.WebGLRenderer,
  };
  static isDepthMesh = true;
  ignoreReticleRaycast = false;
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

  private renderer!: THREE.WebGLRenderer;
  private projectionMatrixInverse: Readonly<THREE.Matrix4> =
    new THREE.Matrix4();
  private lastColliderUpdateTime = 0;
  private options: DepthMeshOptions;
  private depthTextureMaterialUniforms?;

  private RAPIER?: typeof RAPIER_NS;
  private blendedWorld?: RAPIER_NS.World;
  private rigidBody?: RAPIER_NS.RigidBody;
  private colliderId = 0;

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
    const geometry = new THREE.PlaneGeometry(
      1,
      1,
      activeRes - 1,
      activeRes - 1
    );

    const minU = ignoreEdgePixels / (depthResolution - 1);
    const maxU =
      (depthResolution - 1 - ignoreEdgePixels) / (depthResolution - 1);
    const minV = ignoreEdgePixels / (depthResolution - 1);
    const maxV =
      (depthResolution - 1 - ignoreEdgePixels) / (depthResolution - 1);

    const uvs = geometry.attributes.uv.array;
    for (let i = 0; i < uvs.length; i += 2) {
      uvs[i] = minU + uvs[i] * (maxU - minU);
      uvs[i + 1] = minV + uvs[i + 1] * (maxV - minV);
    }

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

    super(geometry, material);

    this.visible = options.showDebugTexture || options.renderShadow;
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
      this.downsampledGeometry = new THREE.PlaneGeometry(1, 1, 39, 39);
      const dsUvs = this.downsampledGeometry.attributes.uv.array;
      for (let i = 0; i < dsUvs.length; i += 2) {
        dsUvs[i] = minU + dsUvs[i] * (maxU - minU);
        dsUvs[i + 1] = minV + dsUvs[i + 1] * (maxV - minV);
      }
      this.downsampledMesh = new THREE.Mesh(this.downsampledGeometry, material);
      this.downsampledMesh.visible = false;
    }
  }

  /**
   * Initialize the depth mesh.
   */
  init({renderer}: {renderer: THREE.WebGLRenderer}) {
    this.renderer = renderer;
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
    }

    this.minDepthPrev = this.minDepth;
    this.maxDepthPrev = this.maxDepth;
    this.geometry.attributes.position.needsUpdate = true;

    const depthTextureLeft = this.depthTextures?.get(0);
    if (depthTextureLeft && this.depthTextureMaterialUniforms) {
      this.depthTextureMaterialUniforms.uUsingFloatDepth.value =
        depthDataFormat === 'float32';
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

    if (this.options.updateVertexNormals) {
      this.geometry.computeVertexNormals();
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
    const width = depthData.width;
    const height = depthData.height;
    const depthArray =
      depthDataFormat === 'float32'
        ? new Float32Array(depthData.data)
        : new Uint16Array(depthData.data);
    const vertexPosition = new THREE.Vector3();
    const normViewCoord = new THREE.Vector3();
    const normDepthBufferFromNormView = depthData.normDepthBufferFromNormView
      ? new THREE.Matrix4().fromArray(
          depthData.normDepthBufferFromNormView.matrix
        )
      : new THREE.Matrix4().identity();

    for (let i = 0; i < geometry.attributes.position.count; ++i) {
      const u = geometry.attributes.uv.array[2 * i];
      const v = geometry.attributes.uv.array[2 * i + 1];

      let sampleU = u;
      let sampleV = v;

      if (depthData.normDepthBufferFromNormView) {
        normViewCoord.set(u, 1.0 - v, 0);
        normViewCoord.applyMatrix4(normDepthBufferFromNormView);
        sampleU = normViewCoord.x;
        sampleV = normViewCoord.y;
      } else {
        sampleV = 1.0 - v;
      }

      // Grabs the nearest for now.
      const depthX = Math.round(clamp(sampleU * (width - 1), 0, width - 1));
      const depthY = Math.round(clamp(sampleV * (height - 1), 0, height - 1));
      const rawDepth = depthArray[depthY * width + depthX];
      let depth = depthData.rawValueToMeters * rawDepth;

      // Finds global min/max.
      if (depth > 0) {
        if (depth < this.minDepth) {
          this.minDepth = depth;
        } else if (depth > this.maxDepth) {
          this.maxDepth = depth;
        }
      }

      // This is a wrong algorithm to patch holes but working amazingly well.
      // Per-row maximum may work better but haven't tried here.
      // A proper local maximum takes another pass.
      if (depth == 0 && this.options.patchHoles) {
        depth = this.maxDepthPrev;
      }

      if (this.options.patchHolesUpper && v > 0.9) {
        depth = this.minDepthPrev;
      }

      vertexPosition.set(2.0 * (u - 0.5), 2.0 * (v - 0.5), -1);

      // This relates to camera.near
      vertexPosition.applyMatrix4(this.projectionMatrixInverse);

      vertexPosition.multiplyScalar(-depth / vertexPosition.z);

      geometry.attributes.position.array[3 * i + 0] = vertexPosition.x;
      geometry.attributes.position.array[3 * i + 1] = vertexPosition.y;
      geometry.attributes.position.array[3 * i + 2] = vertexPosition.z;
    }
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
}
