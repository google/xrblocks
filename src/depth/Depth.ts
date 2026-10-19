import * as THREE from 'three';

import {Registry} from '../core/components/Registry';
import {
  assertWebGLRenderer,
  isSerializerRenderer,
  isWebGPURenderer,
  type SupportedRenderer,
} from '../core/RendererTypes';
import type {Shader} from '../utils/Types';
import {clamp} from '../utils/utils';

import {DepthMesh} from './DepthMesh';
import {DepthOptions} from './DepthOptions';
import {DepthTextures} from './DepthTextures';
import {GPUDepthConverter} from './GPUDepthConverter';
import {
  OcclusionPass,
  type OcclusionPassBackend,
} from './occlusion/OcclusionPass';
import {OcclusionUtils} from './occlusion/OcclusionUtils';

const DEFAULT_DEPTH_WIDTH = 160;
const DEFAULT_DEPTH_HEIGHT = DEFAULT_DEPTH_WIDTH;
const clipSpacePosition = new THREE.Vector3();
const normViewCoord = new THREE.Vector3();

export type DepthArray = Float32Array | Uint16Array;

export class Depth {
  static instance?: Depth;

  // The main camera.
  private camera!: THREE.Camera;
  private renderer!: SupportedRenderer;
  private gpuDepthConverter?: GPUDepthConverter;
  private registry?: Registry;
  private disposed = false;

  enabled = false;
  view: XRView[] = [];
  cpuDepthData: XRCPUDepthInformation[] = [];
  gpuDepthData: XRWebGLDepthInformation[] = [];
  depthArray: DepthArray[] = [];
  depthDataFormat?: XRDepthDataFormat;
  depthMesh?: DepthMesh;
  private depthTextures?: DepthTextures;
  options = new DepthOptions();
  width = DEFAULT_DEPTH_WIDTH;
  height = DEFAULT_DEPTH_HEIGHT;
  get rawValueToMeters() {
    if (this.cpuDepthData.length) {
      return this.cpuDepthData[0].rawValueToMeters;
    } else if (this.gpuDepthData.length) {
      return this.gpuDepthData[0].rawValueToMeters;
    }
    return 0;
  }

  /**
   * Resolves the buffer and metadata for a query, falling back to view 0 only
   * when the requested view has not produced CPU depth yet.
   */
  private getDepthBuffer(viewId: number) {
    const resolvedViewId = this.depthArray[viewId] ? viewId : 0;
    const depthData =
      this.cpuDepthData[resolvedViewId] ?? this.gpuDepthData[resolvedViewId];
    return {
      depthArray: this.depthArray[resolvedViewId],
      width: depthData?.width ?? this.width,
      height: depthData?.height ?? this.height,
      rawValueToMeters: depthData?.rawValueToMeters ?? this.rawValueToMeters,
    };
  }
  occludableShaders = new Set<Shader>();
  private occlusionPass?: OcclusionPassBackend;

  // Whether we're counting the number of depth clients.
  private depthClientsInitialized = false;
  private depthClients = new Set<object>();

  depthProjectionMatrices: THREE.Matrix4[] = [];
  depthProjectionInverseMatrices: THREE.Matrix4[] = [];
  depthViewMatrices: THREE.Matrix4[] = [];
  depthViewProjectionMatrices: THREE.Matrix4[] = [];
  depthCameraPositions: THREE.Vector3[] = [];
  depthCameraRotations: THREE.Quaternion[] = [];

  /**
   * Transforms from normalized view coordinates to normalized depth buffer
   * coordinates. Identity when matchDepthView is true.
   */
  normDepthBufferFromNormViewMatrices: THREE.Matrix4[] = [];

  /** Timestamp of the last depth mesh geometry update. */
  private lastDepthMeshUpdateTime = 0;

  /** Whether an app has requested depth data or textures for viewId > 0. */
  private requestedSecondaryViews = false;
  /** Whether a CPU depth query has requested GPU readback. */
  private requestedDepth = false;

  /**
   * Depth is a lightweight manager based on three.js to simply prototyping
   * with Depth in WebXR.
   */
  constructor() {
    if (Depth.instance) {
      return Depth.instance;
    }
    Depth.instance = this;
  }

  /**
   * Initialize Depth manager.
   */
  init(
    camera: THREE.PerspectiveCamera,
    options: DepthOptions,
    renderer: SupportedRenderer,
    registry: Registry,
    scene: THREE.Scene
  ): void | Promise<void> {
    if (this.disposed) {
      throw new Error('Depth cannot initialize after disposal.');
    }
    this.camera = camera;
    this.options = options;
    this.renderer = renderer;
    this.registry = registry;
    this.enabled = options.enabled;
    const isWebGPU = isWebGPURenderer(renderer);
    const isSerializer = isSerializerRenderer(renderer);
    this.gpuDepthConverter =
      isWebGPU || isSerializer ? undefined : new GPUDepthConverter(renderer);

    if (this.options.depthTexture.enabled) {
      this.depthTextures = new DepthTextures(options);
      registry.register(this.depthTextures);
    }

    const asyncTasks: Promise<void>[] = [];

    if (this.options.occlusion.enabled) {
      const resolutionScale = this.options.occlusion.resolutionScale ?? 0.5;
      if (isWebGPU) {
        asyncTasks.push(
          Promise.all([
            import('./occlusion/WebGPUOcclusionPass.js'),
            import('./occlusion/WebGPUOcclusionUtils.js'),
          ]).then(([{WebGPUOcclusionPass}, {addWebGPUOcclusionToMaterial}]) => {
            if (!this.disposed) {
              OcclusionUtils.setWebGPUMaterialHandler(
                addWebGPUOcclusionToMaterial
              );
              const pass = new WebGPUOcclusionPass(scene, camera);
              pass.resolutionScale = resolutionScale;
              this.occlusionPass = pass;
            }
          })
        );
      } else if (!isSerializer) {
        OcclusionUtils.setWebGPUMaterialHandler(undefined);
        const pass = new OcclusionPass(scene, camera);
        pass.resolutionScale = resolutionScale;
        this.occlusionPass = pass;
      }
    }

    if (this.options.depthMesh.enabled) {
      this.depthMesh = new DepthMesh(
        options,
        this.width,
        this.height,
        this.depthTextures
      );
      registry.register(this.depthMesh);
      if (this.options.depthMesh.renderShadow && this.renderer.shadowMap) {
        this.renderer.shadowMap.enabled = true;
        this.renderer.shadowMap.type = THREE.PCFShadowMap;
      }
      if (
        isWebGPU &&
        (this.options.depthMesh.useDepthTexture ||
          this.options.depthMesh.showDebugTexture)
      ) {
        asyncTasks.push(
          import('./DepthMeshWebGPUMaterial.js').then(
            ({applyWebGPUDepthMeshMaterial}) => {
              if (!this.disposed && this.depthMesh) {
                applyWebGPUDepthMeshMaterial(this.depthMesh);
                scene.add(this.depthMesh);
              }
            }
          )
        );
      } else {
        scene.add(this.depthMesh);
      }
    }

    if (asyncTasks.length > 0) {
      return Promise.all(asyncTasks).then(() => {});
    }
  }

  /**
   * Converts bottom-origin view UVs into normalized depth buffer coordinates.
   *
   * {@link https://immersive-web.github.io/depth-sensing/#obtain-depth-at-coordinates | The WebXR algorithm}
   * takes top-origin normalized view coordinates, applies
   * `normDepthBufferFromNormView`, then scales the result straight into the
   * buffer. Flipping V after the transform instead samples a different pixel
   * for any transform that does not commute with that flip, and disagrees
   * with {@link DepthMesh}, which flips first.
   * @param u - Normalized horizontal coordinate, origin at bottom left.
   * @param v - Normalized vertical coordinate, origin at bottom left.
   * @param target - Vector that receives the result.
   * @param viewId - View index (default 0).
   * @returns The normalized depth buffer coordinates.
   */
  private normDepthBufferCoords(
    u: number,
    v: number,
    target: THREE.Vector3,
    viewId = 0
  ) {
    target.set(u, 1.0 - v, 0);
    const matrix =
      this.normDepthBufferFromNormViewMatrices[viewId] ??
      this.normDepthBufferFromNormViewMatrices[0];
    if (matrix) {
      target.applyMatrix4(matrix);
    }
    return target;
  }

  /**
   * Retrieves the depth at normalized coordinates (u, v).
   * Note: The UV coordinates are with respect to the user's view, not the depth camera view.
   * @param u - Normalized horizontal coordinate, origin at the bottom left of
   * the view, growing right.
   * @param v - Normalized vertical coordinate, origin at the bottom left of
   * the view, growing up.
   * @param viewId - View index to query (default 0). Requesting viewId > 0 enables secondary view updates.
   * @returns Depth value at the specified coordinates.
   */
  getDepth(u: number, v: number, viewId = 0) {
    this.requestDepth(viewId);
    const {depthArray, width, height, rawValueToMeters} =
      this.getDepthBuffer(viewId);
    if (!depthArray) return 0.0;
    const coords = this.normDepthBufferCoords(u, v, normViewCoord, viewId);
    const depthX = Math.round(clamp(coords.x * width, 0, width - 1));
    const depthY = Math.round(clamp(coords.y * height, 0, height - 1));
    const rawDepth = depthArray[depthY * width + depthX];
    return rawValueToMeters * rawDepth;
  }

  /**
   * Projects the given world position to depth camera's clip space and then
   * to the depth camera's view space using the depth.
   * @param position - The world position to project.
   * @param target - Optional target vector.
   * @param viewId - View index to query (default 0).
   * @returns The depth camera view space position.
   */
  getProjectedDepthViewPositionFromWorldPosition(
    position: THREE.Vector3,
    target = new THREE.Vector3(),
    viewId = 0
  ) {
    this.requestDepth(viewId);
    const viewMatrix =
      this.depthViewMatrices[viewId] ?? this.depthViewMatrices[0];
    const projMatrix =
      this.depthProjectionMatrices[viewId] ?? this.depthProjectionMatrices[0];
    const projInvMatrix =
      this.depthProjectionInverseMatrices[viewId] ??
      this.depthProjectionInverseMatrices[0];
    clipSpacePosition
      .copy(position)
      .applyMatrix4(viewMatrix)
      .applyMatrix4(projMatrix);
    const u = 0.5 * (clipSpacePosition.x + 1.0);
    const v = 0.5 * (clipSpacePosition.y + 1.0);

    let depth = 0.0;
    const {depthArray, width, height, rawValueToMeters} =
      this.getDepthBuffer(viewId);
    if (depthArray) {
      const depthX = Math.round(clamp(u * width, 0, width - 1));
      const depthY = Math.round(clamp((1.0 - v) * height, 0, height - 1));
      const rawDepth = depthArray[depthY * width + depthX];
      depth = rawValueToMeters * rawDepth;
    }

    target.set(2.0 * (u - 0.5), 2.0 * (v - 0.5), -1);
    target.applyMatrix4(projInvMatrix);
    target.multiplyScalar(-depth / target.z);
    return target;
  }

  /**
   * Retrieves the depth at normalized coordinates (u, v).
   * Note: The UV coordinates are with respect to the user's view, not the depth camera view.
   * @param u - Normalized horizontal coordinate, origin at the bottom left of
   * the view, growing right.
   * @param v - Normalized vertical coordinate, origin at the bottom left of
   * the view, growing up.
   * @param viewId - View index to query (default 0). Requesting viewId > 0 enables secondary view updates.
   * @returns Vertex at (u, v)
   */
  getVertex(u: number, v: number, viewId = 0) {
    this.requestDepth(viewId);
    const {depthArray, width, height, rawValueToMeters} =
      this.getDepthBuffer(viewId);
    if (!depthArray) return null;

    const coords = this.normDepthBufferCoords(u, v, normViewCoord, viewId);
    const depthX = Math.round(clamp(coords.x * width, 0, width - 1));
    const depthY = Math.round(clamp(coords.y * height, 0, height - 1));
    const rawDepth = depthArray[depthY * width + depthX];
    const depth = rawValueToMeters * rawDepth;
    // depthProjectionInverseMatrices belongs to the depth camera, so the clip
    // space point has to come from the depth buffer coordinates. Buffer V
    // grows downward while clip Y grows upward, hence the flip back here.
    const vertexPosition = new THREE.Vector3(
      2.0 * (coords.x - 0.5),
      2.0 * (0.5 - coords.y),
      -1
    );
    const projInvMatrix =
      this.depthProjectionInverseMatrices[viewId] ??
      this.depthProjectionInverseMatrices[0];
    vertexPosition.applyMatrix4(projInvMatrix);
    vertexPosition.multiplyScalar(-depth / vertexPosition.z);
    return vertexPosition;
  }

  private updateDepthMatrices(depthData: XRDepthInformation, viewId: number) {
    // Populate depth view and projection matrices.
    while (viewId >= this.depthViewMatrices.length) {
      this.depthViewMatrices.push(new THREE.Matrix4());
      this.depthViewProjectionMatrices.push(new THREE.Matrix4());
      this.depthProjectionMatrices.push(new THREE.Matrix4());
      this.depthProjectionInverseMatrices.push(new THREE.Matrix4());
      this.depthCameraPositions.push(new THREE.Vector3());
      this.depthCameraRotations.push(new THREE.Quaternion());
      this.normDepthBufferFromNormViewMatrices.push(new THREE.Matrix4());
    }
    // Store the view-to-depth-buffer coordinate transform.
    if (depthData.normDepthBufferFromNormView) {
      this.normDepthBufferFromNormViewMatrices[viewId].fromArray(
        depthData.normDepthBufferFromNormView.matrix
      );
    } else {
      this.normDepthBufferFromNormViewMatrices[viewId].identity();
    }
    if (depthData.projectionMatrix && depthData.transform) {
      this.depthProjectionMatrices[viewId].fromArray(
        depthData.projectionMatrix
      );
      this.depthViewMatrices[viewId].fromArray(
        depthData.transform.inverse.matrix
      );
      this.depthCameraPositions[viewId].set(
        depthData.transform.position.x,
        depthData.transform.position.y,
        depthData.transform.position.z
      );
      this.depthCameraRotations[viewId].set(
        depthData.transform.orientation.x,
        depthData.transform.orientation.y,
        depthData.transform.orientation.z,
        depthData.transform.orientation.w
      );
    } else {
      const camera =
        this.renderer.xr?.getCamera()?.cameras?.[viewId] ?? this.camera;
      this.depthProjectionMatrices[viewId].copy(camera.projectionMatrix);
      this.depthViewMatrices[viewId].copy(camera.matrixWorldInverse);
      this.depthCameraPositions[viewId].copy(camera.position);
      this.depthCameraRotations[viewId].copy(camera.quaternion);
    }
    this.depthProjectionInverseMatrices[viewId]
      .copy(this.depthProjectionMatrices[viewId])
      .invert();
    this.depthViewProjectionMatrices[viewId].multiplyMatrices(
      this.depthProjectionMatrices[viewId],
      this.depthViewMatrices[viewId]
    );
  }

  /** Records demand for CPU depth so GPU depth is read back on the next frame. */
  private requestDepth(viewId: number): void {
    this.requestedDepth = true;
    if (viewId > 0) {
      this.requestedSecondaryViews = true;
    }
  }

  updateCPUDepthData(
    depthData: XRCPUDepthInformation,
    viewId: number,
    depthDataFormat: XRDepthDataFormat
  ) {
    this.cpuDepthData[viewId] = depthData;
    this.depthDataFormat = depthDataFormat;
    this.updateDepthMatrices(depthData, viewId);

    // Updates Depth Array.
    this.depthArray[viewId] =
      depthDataFormat === 'float32'
        ? new Float32Array(depthData.data)
        : new Uint16Array(depthData.data);
    this.width = depthData.width;
    this.height = depthData.height;

    // Updates Depth Texture.
    if (this.options.depthTexture.enabled && this.depthTextures) {
      this.depthTextures.updateData(depthData, viewId, depthDataFormat);
    }

    if (this.options.depthMesh.enabled && this.depthMesh && viewId == 0) {
      if (this.shouldUpdateDepthMesh()) {
        this.depthMesh.updateDepth(
          depthData,
          this.depthProjectionInverseMatrices[0],
          depthDataFormat
        );
      }
      this.depthMesh.updatePose(
        this.depthCameraPositions[0],
        this.depthCameraRotations[0]
      );
    }
  }

  updateGPUDepthData(depthData: XRWebGLDepthInformation, viewId: number) {
    assertWebGLRenderer(this.renderer, 'WebXR GPU depth');
    this.gpuDepthData[viewId] = depthData;
    this.updateDepthMatrices(depthData, viewId);
    // Reading the depth target back is a synchronous GPU stall. Keep it opt-in
    // for view 0 unless the depth mesh or all-view options need it, but honor
    // a runtime CPU depth query even when the mesh is disabled.
    const needsCpuDepth =
      (this.options.depthMesh.enabled ||
        Boolean(this.options.updateAllViews) ||
        this.requestedDepth) &&
      this.shouldUpdateView(viewId);
    const cpuDepth =
      needsCpuDepth && this.gpuDepthConverter
        ? this.gpuDepthConverter.convertGPUToCPU(depthData)
        : null;
    if (cpuDepth) {
      this.cpuDepthData[viewId] = cpuDepth;
      this.depthDataFormat = 'float32';
      if (
        this.depthArray[viewId] instanceof Float32Array &&
        this.depthArray[viewId].byteLength === cpuDepth.data.byteLength
      ) {
        this.depthArray[viewId].set(new Float32Array(cpuDepth.data));
      } else {
        this.depthArray[viewId] = new Float32Array(cpuDepth.data);
      }
      this.width = cpuDepth.width;
      this.height = cpuDepth.height;
    }

    // Updates Depth Texture.
    if (this.options.depthTexture.enabled && this.depthTextures) {
      this.depthTextures.updateNativeTexture(depthData, this.renderer, viewId);
    }

    if (this.options.depthMesh.enabled && this.depthMesh && viewId == 0) {
      if (this.shouldUpdateDepthMesh()) {
        if (cpuDepth) {
          this.depthMesh.updateDepth(
            cpuDepth,
            this.depthProjectionInverseMatrices[0],
            'float32'
          );
        }
      }
      this.depthMesh.updatePose(
        this.depthCameraPositions[0],
        this.depthCameraRotations[0]
      );
    }
  }

  /**
   * Checks whether the depth mesh geometry should be updated this frame,
   * based on the configured depthMeshUpdateFps. The pose is always updated
   * every frame so the mesh tracks the depth camera smoothly, but the
   * expensive geometry rebuild can be throttled.
   */
  private shouldUpdateDepthMesh(): boolean {
    const fps = this.options.depthMesh.depthMeshUpdateFps;
    if (fps <= 0) return true;
    const now = performance.now();
    if (now - this.lastDepthMeshUpdateTime < 1000 / fps) {
      return false;
    }
    this.lastDepthMeshUpdateTime = now;
    return true;
  }

  /**
   * Returns whether CPU depth data and textures should be extracted for the
   * given view index. By default only view 0 is processed since DepthMesh and
   * OcclusionPass only consume view 0, unless `options.updateAllViews`,
   * `options.matchDepthView`, or a runtime `viewId > 0` request is active.
   */
  private shouldUpdateView(viewId: number): boolean {
    return (
      viewId === 0 ||
      Boolean(this.options.updateAllViews) ||
      Boolean(this.options.matchDepthView) ||
      this.requestedSecondaryViews
    );
  }

  getTexture(viewId: number) {
    if (!this.options.depthTexture.enabled) return undefined;
    if (viewId > 0) {
      this.requestedSecondaryViews = true;
    }
    return this.depthTextures?.get(viewId) ?? this.depthTextures?.get(0);
  }

  /**
   * Updates the shadow opacity on the depth mesh material when active.
   */
  setShadowOpacity(opacity: number) {
    if (
      this.options.enabled &&
      this.options.depthMesh.enabled &&
      this.depthMesh?.material instanceof THREE.ShadowMaterial
    ) {
      this.depthMesh.material.opacity = opacity;
    }
  }

  update(frame?: XRFrame) {
    if (this.disposed || !this.options.enabled) return;
    if (frame) {
      this.updateLocalDepth(frame);
    }
    if (this.options.occlusion.enabled) {
      this.renderOcclusionPass();
    }
  }

  updateLocalDepth(frame: XRFrame) {
    const session = frame.session;
    const binding = this.renderer.xr.getBinding?.() ?? null;

    // Enable or disable depth based on the number of clients.
    const pausingDepthSupported = session.depthActive !== undefined;
    if (pausingDepthSupported && this.depthClientsInitialized) {
      const needsDepth = this.depthClients.size > 0;
      if (session.depthActive && !needsDepth) {
        session.pauseDepthSensing?.();
      } else if (!session.depthActive && needsDepth) {
        session.resumeDepthSensing?.();
      }
      if (this.depthClients.size === 0) {
        return;
      }
    }

    const xrRefSpace = this.renderer.xr.getReferenceSpace?.() ?? null;
    if (xrRefSpace) {
      const pose = frame.getViewerPose(xrRefSpace);
      if (pose) {
        for (let viewId = 0; viewId < pose.views.length; ++viewId) {
          const view = pose.views[viewId];
          this.view[viewId] = view;

          if (session.depthUsage === 'gpu-optimized') {
            const depthData = binding?.getDepthInformation(view);
            if (!depthData) {
              return;
            }
            this.updateGPUDepthData(depthData, viewId);
          } else if (this.shouldUpdateView(viewId)) {
            const depthData = frame.getDepthInformation(view);
            if (!depthData) {
              return;
            }
            this.updateCPUDepthData(
              depthData,
              viewId,
              session.depthDataFormat ?? 'luminance-alpha'
            );
          }
        }
      } else {
        console.error('Pose unavailable in the current frame.');
      }
    }
  }

  renderOcclusionPass() {
    if (!this.occlusionPass || isSerializerRenderer(this.renderer)) return;
    const leftDepthTexture = this.getTexture(0);
    if (leftDepthTexture) {
      this.occlusionPass.setDepthTexture(
        leftDepthTexture,
        this.rawValueToMeters,
        0,
        (this.gpuDepthData[0] as unknown as {depthNear: number} | undefined)
          ?.depthNear,
        this.depthViewMatrices[0],
        this.depthProjectionMatrices[0]
      );
    }
    const currentXREnabled = this.renderer.xr.enabled;
    this.renderer.xr.enabled = false;
    this.occlusionPass.render(this.renderer, undefined, undefined, 0);
    this.renderer.xr.enabled = currentXREnabled;
    for (const shader of this.occludableShaders) {
      this.occlusionPass.updateOcclusionMapUniforms(
        shader.uniforms,
        this.renderer
      );
    }
  }

  debugLog() {
    const arrayBuffer = this.cpuDepthData[0].data;
    const uint8Array = new Uint8Array(arrayBuffer);
    // Convert Uint8Array to a string where each character represents a byte
    const binaryString = Array.from(uint8Array, (byte) =>
      String.fromCharCode(byte)
    ).join('');
    // Convert binary string to base64
    const data_str = btoa(binaryString);
    console.log(data_str);
  }

  resumeDepth(client: object) {
    this.depthClientsInitialized = true;
    this.depthClients.add(client);
  }

  pauseDepth(client: object) {
    this.depthClientsInitialized = true;
    this.depthClients.delete(client);
  }

  /**
   * Manually updates the depth mesh geometry using the cached depth.
   */
  updateFullResolutionDepthMesh() {
    if (
      this.depthMesh &&
      this.cpuDepthData.length > 0 &&
      this.depthDataFormat
    ) {
      this.depthMesh.updateFullResolutionGeometry(
        this.cpuDepthData[0],
        this.depthDataFormat
      );
    }
  }

  /** Releases depth resources at terminal Core teardown, not on XR exit. */
  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    this.enabled = false;
    if (Depth.instance === this) {
      Depth.instance = undefined;
    }

    const mesh = this.depthMesh;
    const textures = this.depthTextures;
    const pass = this.occlusionPass;
    this.depthMesh = undefined;
    this.depthTextures = undefined;
    this.occlusionPass = undefined;

    let firstError: unknown;
    const cleanups = [
      () => this.gpuDepthConverter?.dispose(),
      () => {
        if (mesh && this.registry?.get(DepthMesh) === mesh) {
          this.registry.unregister(DepthMesh);
        }
      },
      () => mesh?.removeFromParent(),
      () => mesh?.disposeResources(),
      () => {
        if (textures && this.registry?.get(DepthTextures) === textures) {
          this.registry.unregister(DepthTextures);
        }
      },
      () => textures?.dispose(),
      () => pass?.dispose(),
    ];
    for (const cleanup of cleanups) {
      try {
        cleanup();
      } catch (error: unknown) {
        firstError ??= error;
      }
    }

    this.gpuDepthConverter = undefined;
    this.registry = undefined;
    this.requestedSecondaryViews = false;
    this.requestedDepth = false;
    this.view.length = 0;
    this.cpuDepthData.length = 0;
    this.gpuDepthData.length = 0;
    this.depthArray.length = 0;
    this.depthDataFormat = undefined;
    this.depthProjectionMatrices.length = 0;
    this.depthProjectionInverseMatrices.length = 0;
    this.depthViewMatrices.length = 0;
    this.depthViewProjectionMatrices.length = 0;
    this.depthCameraPositions.length = 0;
    this.depthCameraRotations.length = 0;
    this.normDepthBufferFromNormViewMatrices.length = 0;
    this.depthClients.clear();
    this.occludableShaders.clear();
    OcclusionUtils.setWebGPUMaterialHandler(undefined);
    if (firstError !== undefined) throw firstError;
  }
}
