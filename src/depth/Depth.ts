import * as THREE from 'three';

import {Registry} from '../core/components/Registry';
import type {Shader} from '../utils/Types';
import {clamp} from '../utils/utils';

import {DepthMesh} from './DepthMesh';
import {DepthOptions} from './DepthOptions';
import {DepthTextures} from './DepthTextures';
import {GPUDepthConverter} from './GPUDepthConverter';
import {OcclusionPass} from './occlusion/OcclusionPass';

const DEFAULT_DEPTH_WIDTH = 160;
const DEFAULT_DEPTH_HEIGHT = DEFAULT_DEPTH_WIDTH;
const clipSpacePosition = new THREE.Vector3();
const normViewCoord = new THREE.Vector3();

export type DepthArray = Float32Array | Uint16Array;

export class Depth {
  static instance?: Depth;

  // The main camera.
  private camera!: THREE.Camera;
  private renderer!: THREE.WebGLRenderer;
  private gpuDepthConverter?: GPUDepthConverter;

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
  occludableShaders = new Set<Shader>();
  private occlusionPass?: OcclusionPass;

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
    renderer: THREE.WebGLRenderer,
    registry: Registry,
    scene: THREE.Scene
  ) {
    this.camera = camera;
    this.options = options;
    this.renderer = renderer;
    this.enabled = options.enabled;
    this.gpuDepthConverter = new GPUDepthConverter(renderer);

    if (this.options.depthTexture.enabled) {
      this.depthTextures = new DepthTextures(options);
      registry.register(this.depthTextures);
    }

    if (this.options.depthMesh.enabled) {
      this.depthMesh = new DepthMesh(
        options,
        this.width,
        this.height,
        this.depthTextures
      );
      registry.register(this.depthMesh);
      if (this.options.depthMesh.renderShadow) {
        this.renderer.shadowMap.enabled = true;
        this.renderer.shadowMap.type = THREE.PCFShadowMap;
      }
      scene.add(this.depthMesh);
    }

    if (this.options.occlusion.enabled) {
      this.occlusionPass = new OcclusionPass(scene, camera);
    }
  }

  /**
   * Retrieves the depth at normalized coordinates (u, v).
   * Note: The UV coordinates are with respect to the user's view, not the depth camera view.
   * @param u - Normalized horizontal coordinate.
   * @param v - Normalized vertical coordinate.
   * @returns Depth value at the specified coordinates.
   */
  getDepth(u: number, v: number) {
    if (!this.depthArray[0]) return 0.0;
    // When matchDepthView is false, transform from view-space UVs to
    // depth buffer UVs using normDepthBufferFromNormView.
    if (this.normDepthBufferFromNormViewMatrices.length > 0) {
      normViewCoord.set(u, v, 0);
      normViewCoord.applyMatrix4(this.normDepthBufferFromNormViewMatrices[0]);
      u = normViewCoord.x;
      v = normViewCoord.y;
    }
    const depthX = Math.round(clamp(u * this.width, 0, this.width - 1));
    const depthY = Math.round(
      clamp((1.0 - v) * this.height, 0, this.height - 1)
    );
    const rawDepth = this.depthArray[0][depthY * this.width + depthX];
    return this.rawValueToMeters * rawDepth;
  }

  /**
   * Projects the given world position to depth camera's clip space and then
   * to the depth camera's view space using the depth.
   * @param position - The world position to project.
   * @returns The depth camera view space position.
   */
  getProjectedDepthViewPositionFromWorldPosition(
    position: THREE.Vector3,
    target = new THREE.Vector3()
  ) {
    clipSpacePosition
      .copy(position)
      .applyMatrix4(this.depthViewMatrices[0])
      .applyMatrix4(this.depthProjectionMatrices[0]);
    const u = 0.5 * (clipSpacePosition.x + 1.0);
    const v = 0.5 * (clipSpacePosition.y + 1.0);

    let depth = 0.0;
    if (this.depthArray[0]) {
      const depthX = Math.round(clamp(u * this.width, 0, this.width - 1));
      const depthY = Math.round(
        clamp((1.0 - v) * this.height, 0, this.height - 1)
      );
      const rawDepth = this.depthArray[0][depthY * this.width + depthX];
      depth = this.rawValueToMeters * rawDepth;
    }

    target.set(2.0 * (u - 0.5), 2.0 * (v - 0.5), -1);
    target.applyMatrix4(this.depthProjectionInverseMatrices[0]);
    target.multiplyScalar(-depth / target.z);
    return target;
  }

  /**
   * Retrieves the depth at normalized coordinates (u, v).
   * Note: The UV coordinates are with respect to the user's view, not the depth camera view.
   * @param u - Normalized horizontal coordinate.
   * @param v - Normalized vertical coordinate.
   * @returns Vertex at (u, v)
   */
  getVertex(u: number, v: number) {
    if (!this.depthArray[0]) return null;

    // When matchDepthView is false, transform from view-space UVs to
    // depth buffer UVs using normDepthBufferFromNormView.
    if (this.normDepthBufferFromNormViewMatrices.length > 0) {
      normViewCoord.set(u, v, 0);
      normViewCoord.applyMatrix4(this.normDepthBufferFromNormViewMatrices[0]);
      u = normViewCoord.x;
      v = normViewCoord.y;
    }

    const depthX = Math.round(clamp(u * this.width, 0, this.width - 1));
    const depthY = Math.round(
      clamp((1.0 - v) * this.height, 0, this.height - 1)
    );
    const rawDepth = this.depthArray[0][depthY * this.width + depthX];
    const depth = this.rawValueToMeters * rawDepth;
    const vertexPosition = new THREE.Vector3(
      2.0 * (u - 0.5),
      2.0 * (v - 0.5),
      -1
    );
    vertexPosition.applyMatrix4(this.depthProjectionInverseMatrices[0]);
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
    this.gpuDepthData[viewId] = depthData;
    this.updateDepthMatrices(depthData, viewId);
    // For now, assume that we need cpu depth only if depth mesh is enabled.
    // In the future, add a separate option.
    const needCpuDepth = this.options.depthMesh.enabled;
    const cpuDepth =
      needCpuDepth && this.gpuDepthConverter
        ? this.gpuDepthConverter.convertGPUToCPU(depthData)
        : null;
    if (cpuDepth) {
      this.cpuDepthData[viewId] = cpuDepth;
      this.depthDataFormat = 'float32';
      if (this.depthArray[viewId] instanceof Float32Array) {
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

  getTexture(viewId: number) {
    if (!this.options.depthTexture.enabled) return undefined;
    return this.depthTextures?.get(viewId);
  }

  update(frame?: XRFrame) {
    if (!this.options.enabled) return;
    if (frame) {
      this.updateLocalDepth(frame);
    }
    if (this.options.occlusion.enabled) {
      this.renderOcclusionPass();
    }
  }

  updateLocalDepth(frame: XRFrame) {
    const session = frame.session;
    const binding = this.renderer.xr.getBinding();

    // Enable or disable depth based on the number of clients.
    const pausingDepthSupported = session.depthActive !== undefined;
    if (pausingDepthSupported && this.depthClientsInitialized) {
      const needsDepth = this.depthClients.size > 0;
      if (session.depthActive && !needsDepth) {
        session.pauseDepthSensing?.();
      } else if (!session.depthActive && needsDepth) {
        session.resumeDepthSensing?.();
      }
      if (this.depthClients.size == 0) {
        return;
      }
    }

    const xrRefSpace = this.renderer.xr.getReferenceSpace();
    if (xrRefSpace) {
      const pose = frame.getViewerPose(xrRefSpace);
      if (pose) {
        for (let viewId = 0; viewId < pose.views.length; ++viewId) {
          const view = pose.views[viewId];
          this.view[viewId] = view;

          if (session.depthUsage === 'gpu-optimized') {
            const depthData = binding.getDepthInformation(view);
            if (!depthData) {
              return;
            }
            this.updateGPUDepthData(depthData, viewId);
          } else {
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
    const leftDepthTexture = this.getTexture(0);
    if (leftDepthTexture) {
      this.occlusionPass!.setDepthTexture(
        leftDepthTexture,
        this.rawValueToMeters,
        0,
        (this.gpuDepthData[0] as unknown as {depthNear: number} | undefined)
          ?.depthNear
      );
    }
    const rightDepthTexture = this.getTexture(1);
    if (rightDepthTexture) {
      this.occlusionPass!.setDepthTexture(
        rightDepthTexture,
        this.rawValueToMeters,
        1,
        (this.gpuDepthData[1] as unknown as {depthNear: number} | undefined)
          ?.depthNear
      );
    }
    const xrIsPresenting = this.renderer.xr.isPresenting;
    this.renderer.xr.isPresenting = false;
    this.occlusionPass!.render(this.renderer, undefined, undefined, 0);
    this.renderer.xr.isPresenting = xrIsPresenting;
    for (const shader of this.occludableShaders) {
      this.occlusionPass!.updateOcclusionMapUniforms(
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
}
