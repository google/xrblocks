import type RAPIER_NS from '@dimforge/rapier3d';
import * as THREE from 'three';

import {MeshScript} from '../core/Script';
import {clamp} from '../utils/utils';

import {DepthMeshTexturedShader} from './DepthMeshTexturedShader';
import {DepthMeshOptions, DepthOptions} from './DepthOptions';
import {DepthTextures} from './DepthTextures';

export class DepthMesh extends MeshScript {
  static dependencies = {
    camera: THREE.Camera,
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

  private downsampledGeometry?: THREE.BufferGeometry;
  private downsampledMesh?: THREE.Mesh;

  private collider?: RAPIER_NS.Collider;
  private colliders: RAPIER_NS.Collider[] = [];
  private colliderUpdateFps: number;

  private renderer!: THREE.WebGLRenderer;
  private camera!: THREE.Camera;
  private projectionMatrixInverse = new THREE.Matrix4();
  private lastColliderUpdateTime = 0;
  private options: DepthMeshOptions;
  private depthTextureMaterialUniforms?;

  private RAPIER?: typeof RAPIER_NS;
  private blendedWorld?: RAPIER_NS.World;
  private rigidBody?: RAPIER_NS.RigidBody;
  private colliderId = 0;

  constructor(
      private depthOptions: DepthOptions, width: number, height: number,
      private depthTextures?: DepthTextures) {
    const options = depthOptions.depthMesh;
    const geometry = new THREE.PlaneGeometry(1, 1, 159, 159);
    let material: THREE.Material;
    let uniforms;
    if (options.useDepthTexture || options.showDebugTexture) {
      uniforms = {
        uDepthTexture: {value: (null as THREE.Texture | null)},
        uColor: {value: new THREE.Color(0xaaaaaa)},
        uResolution: {value: new THREE.Vector2(width, height)},
        uRawValueToMeters: {value: 1.0},
        uMinDepth: {value: 0.0},
        uMaxDepth: {value: 8.0},
        uOpacity: {value: options.opacity},
        uDebug: {value: options.showDebugTexture ? 1.0 : 0.0},
        uLightDirection: {value: new THREE.Vector3(1.0, 1.0, 1.0).normalize()},
        uUsingFloatDepth: {value: depthOptions.useFloat32}
      };
      material = new THREE.ShaderMaterial({
        uniforms: uniforms,
        vertexShader: DepthMeshTexturedShader.vertexShader,
        fragmentShader: DepthMeshTexturedShader.fragmentShader,
        side: THREE.FrontSide,
        transparent: true
      });
    } else {
      material = new THREE.ShadowMaterial({opacity: options.shadowOpacity});
      material.depthWrite = false;
    }

    super(geometry, material);

    this.visible = options.showDebugTexture || options.renderShadow;
    this.options = options;
    this.projectionMatrixInverse = new THREE.Matrix4();
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
      this.downsampledMesh = new THREE.Mesh(this.downsampledGeometry, material);
      this.downsampledMesh.visible = false;
      this.add(this.downsampledMesh);
    }
  }

  /**
   * Initialize the depth mesh.
   */
  init({camera, renderer}:
           {camera: THREE.Camera, renderer: THREE.WebGLRenderer}) {
    this.camera = camera;
    this.renderer = renderer;
  }

  /**
   * Updates the depth data and geometry positions based on the provided camera
   * and depth data.
   */
  updateDepth(depthData: XRCPUDepthInformation) {
    const camera = this.renderer.xr?.getCamera?.()?.cameras?.[0] || this.camera;
    if (!camera) return;

    // Inverts the projection matrix.
    this.projectionMatrixInverse.copy(camera.projectionMatrix).invert();

    this.minDepth = 8;
    this.maxDepth = 0;

    if (this.options.updateFullResolutionGeometry) {
      this.updateFullResolutionGeometry(depthData);
    }
    if (this.downsampledGeometry) {
      this.updateGeometry(depthData, this.downsampledGeometry);
    }

    this.minDepthPrev = this.minDepth;
    this.maxDepthPrev = this.maxDepth;
    this.geometry.attributes.position.needsUpdate = true;

    const depthTextureLeft = this.depthTextures?.get(0);
    if (depthTextureLeft && this.depthTextureMaterialUniforms) {
      this.depthTextureMaterialUniforms.uDepthTexture.value = depthTextureLeft;
      this.depthTextureMaterialUniforms.uMinDepth.value = this.minDepth;
      this.depthTextureMaterialUniforms.uMaxDepth.value = this.maxDepth;
      this.depthTextureMaterialUniforms.uRawValueToMeters.value =
          this.depthTextures!.depthData[0].rawValueToMeters;
      (this.material as THREE.Material).needsUpdate = true;
    }

    if (this.options.updateVertexNormals) {
      this.geometry.computeVertexNormals();
    }

    this.updateColliderIfNeeded();
  }

  /**
   * Method to manually update the full resolution geometry.
   * Only needed if options.updateFullResolutionGeometry is false.
   */
  updateFullResolutionGeometry(depthData: XRCPUDepthInformation) {
    this.updateGeometry(depthData, this.geometry);
  }

  /**
   * Internal method to update the geometry of the depth mesh.
   */
  private updateGeometry(
      depthData: XRCPUDepthInformation, geometry: THREE.BufferGeometry) {
    const width = depthData.width;
    const height = depthData.height;
    const depthArray = this.depthOptions.useFloat32 ?
        new Float32Array(depthData.data) :
        new Uint16Array(depthData.data);
    const vertexPosition = new THREE.Vector3();
    for (let i = 0; i < geometry.attributes.position.count; ++i) {
      const u = geometry.attributes.uv.array[2 * i];
      const v = geometry.attributes.uv.array[2 * i + 1];

      // Grabs the nearest for now.
      const depthX = Math.round(clamp(u * width, 0, width - 1));
      const depthY = Math.round(clamp((1.0 - v) * height, 0, height - 1));
      const rawDepth = depthArray[depthY * width + depthX];
      let depth = depthData.rawValueToMeters * rawDepth;
      // Workaround for b/382679381.
      if (this.depthOptions.useFloat32) {
        depth = rawDepth;
      }

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
  updateColliderIfNeeded() {
    const timeSinceLastUpdate = performance.now() - this.lastColliderUpdateTime;
    if (this.RAPIER && timeSinceLastUpdate > 1000 / this.colliderUpdateFps) {
      this.getWorldPosition(this.worldPosition);
      this.getWorldQuaternion(this.worldQuaternion);
      this.rigidBody!.setTranslation(this.worldPosition, false);
      this.rigidBody!.setRotation(this.worldQuaternion, false);

      const geometry =
          this.downsampledGeometry ? this.downsampledGeometry : this.geometry;
      const vertices = geometry.attributes.position.array as Float32Array;
      const indices = geometry.getIndex()!.array as Uint32Array;
      // Changing the density does not fix the issue.
      const shape =
          this.RAPIER.ColliderDesc.trimesh(vertices, indices).setDensity(1.0);
      // const convextHull = this.RAPIER.ColliderDesc.convexHull(vertices);

      if (this.options.useDualCollider) {
        this.colliderId = (this.colliderId + 1) % 2;
        this.blendedWorld!.removeCollider(
            this.colliders[this.colliderId], false);
        this.colliders[this.colliderId] =
            this.blendedWorld!.createCollider(shape, this.rigidBody);
      } else {
        const newCollider =
            this.blendedWorld!.createCollider(shape, this.rigidBody);
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
                         this.worldPosition.x, this.worldPosition.y,
                         this.worldPosition.z)
                     .setRotation(this.worldQuaternion);
    this.rigidBody = blendedWorld.createRigidBody(desc);
    const vertices = this.geometry.attributes.position.array as Float32Array;
    const indices = this.geometry.getIndex()!.array as Uint32Array;
    const shape = RAPIER.ColliderDesc.trimesh(vertices, indices);

    if (this.options.useDualCollider) {
      this.colliders = [];
      this.colliders.push(
          blendedWorld.createCollider(shape, this.rigidBody),
          blendedWorld.createCollider(shape, this.rigidBody));
      this.colliderId = 0;
    } else {
      this.collider = blendedWorld.createCollider(shape, this.rigidBody);
    }

    this.RAPIER = RAPIER;
    this.blendedWorld = blendedWorld;
    this.lastColliderUpdateTime = performance.now();
  }

  getDepth(
      raycaster: THREE.Raycaster, ndc: THREE.Vector2, camera: THREE.Camera) {
    // Convert the point from blendedWorld space to normalized device
    // coordinates (NDC) const ndc = point.clone().project(camera);

    // Create a Vector2 for the NDC x, y coordinates (used by the Raycaster)
    const ndc2D = new THREE.Vector2(ndc.x, ndc.y);

    // Set up the Raycaster to cast a ray from the camera through the NDC point
    raycaster.setFromCamera(ndc2D, camera);

    // Check for intersections with the mesh
    const intersects = raycaster.intersectObject(this);

    // If an intersection is found, calculate the distance from the point to the
    // intersection
    if (intersects.length > 0) {
      const distance = intersects[0].distance;
      return distance;
    } else {
      return -1;
    }
  }

  /**
   * Customizes raycasting to compute normals for intersections.
   * @param raycaster - The raycaster object.
   * @param intersects - Array to store intersections.
   * @returns - True if intersections are found.
   */
  raycast(raycaster: THREE.Raycaster, intersects: THREE.Intersection[]) {
    const intersections: THREE.Intersection[] = [];
    if (this.downsampledMesh) {
      this.downsampledMesh.raycast(raycaster, intersections)
    } else {
      super.raycast(raycaster, intersections);
    }

    intersections.forEach(intersect => {
      intersect.object = this;
    });
    if (!this.updateVertexNormals) {
      // Use the face normals instead of attribute normals.
      intersections.forEach(intersect => {
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
};
