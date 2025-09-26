import * as THREE from 'three';

import {Registry} from '../core/components/Registry';
import {onDesktopUserAgent} from '../utils/BrowserUtils';
import type {Shader} from '../utils/Types';
import {clamp} from '../utils/utils';

import {DepthMesh} from './DepthMesh';
import {DepthOptions} from './DepthOptions';
import {DepthTextures} from './DepthTextures';
import {OcclusionPass} from './occlusion/OcclusionPass';

const DEFAULT_DEPTH_WIDTH = 160;
const DEFAULT_DEPTH_HEIGHT = DEFAULT_DEPTH_WIDTH;
const clipSpacePosition = new THREE.Vector3();

export type DepthArray = Float32Array|Uint16Array;

export class Depth {
  static instance?: Depth;

  // The main camera.
  private camera!: THREE.Camera;
  private renderer!: THREE.WebGLRenderer;
  private scene!: THREE.Scene;
  private projectionMatrixInverse = new THREE.Matrix4();
  private xrRefSpace?: XRReferenceSpace|XRBoundedReferenceSpace;

  view: XRView[] = [];
  depthData: XRCPUDepthInformation[] = [];
  depthArray: DepthArray[] = [];
  depthMesh?: DepthMesh;
  private depthTextures?: DepthTextures;
  options = new DepthOptions();
  width = DEFAULT_DEPTH_WIDTH;
  height = DEFAULT_DEPTH_HEIGHT;
  rawValueToMeters = 0.0010000000474974513;
  occludableShaders = new Set<Shader>();
  private occlusionPass?: OcclusionPass;


  // Whether we're counting the number of depth clients.
  private depthClientsInitialized = false;
  private depthClients = new Set<object>();

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
      camera: THREE.PerspectiveCamera, options: DepthOptions,
      renderer: THREE.WebGLRenderer, registry: Registry, scene: THREE.Scene) {
    this.camera = camera;
    this.options = options;
    this.renderer = renderer;
    this.scene = scene;

    if (this.options.depthTexture.enabled) {
      this.depthTextures = new DepthTextures(options);
      registry.register(this.depthTextures);
    }

    if (this.options.depthMesh.enabled) {
      this.depthMesh =
          new DepthMesh(options, this.width, this.height, this.depthTextures);
      registry.register(this.depthMesh);
      if (this.options.depthMesh.renderShadow) {
        this.renderer.shadowMap.enabled = true;
        this.renderer.shadowMap.type = THREE.PCFShadowMap;
      }
      camera.add(this.depthMesh);
      scene.add(camera);
    }

    if (this.options.occlusion.enabled) {
      this.occlusionPass = new OcclusionPass(scene, camera);
    }
  }

  /**
   * Retrieves the depth at normalized coordinates (u, v).
   * @param u - Normalized horizontal coordinate.
   * @param v - Normalized vertical coordinate.
   * @returns Depth value at the specified coordinates.
   */
  getDepth(u: number, v: number) {
    if (!this.depthArray[0]) return 0.0;
    const depthX = Math.round(clamp(u * this.width, 0, this.width - 1));
    const depthY =
        Math.round(clamp((1.0 - v) * this.height, 0, this.height - 1));
    const rawDepth = this.depthArray[0][depthY * this.width + depthX];
    return this.rawValueToMeters * rawDepth;
  }

  /**
   * Projects the given world position to clip space and then to view
   * space using the depth.
   * @param position - The world position to project.
   */
  getProjectedDepthViewPositionFromWorldPosition(
      position: THREE.Vector3, target = new THREE.Vector3()) {
    const camera = this.renderer.xr?.getCamera?.()?.cameras?.[0] || this.camera;
    clipSpacePosition.copy(position)
        .applyMatrix4(camera.matrixWorldInverse)
        .applyMatrix4(camera.projectionMatrix);
    const u = 0.5 * (clipSpacePosition.x + 1.0);
    const v = 0.5 * (clipSpacePosition.y + 1.0);
    const depth = this.getDepth(u, v);
    target.set(2.0 * (u - 0.5), 2.0 * (v - 0.5), -1);
    target.applyMatrix4(camera.projectionMatrixInverse);
    target.multiplyScalar((target.z - depth) / target.z);
    return target;
  }

  /**
   * Retrieves the depth at normalized coordinates (u, v).
   * @param u - Normalized horizontal coordinate.
   * @param v - Normalized vertical coordinate.
   * @returns Vertex at (u, v)
   */
  getVertex(u: number, v: number) {
    if (!this.depthArray[0]) return null;

    const depthX = Math.round(clamp(u * this.width, 0, this.width - 1));
    const depthY =
        Math.round(clamp((1.0 - v) * this.height, 0, this.height - 1));
    const rawDepth = this.depthArray[0][depthY * this.width + depthX];
    const depth = this.rawValueToMeters * rawDepth;
    const vertexPosition =
        new THREE.Vector3(2.0 * (u - 0.5), 2.0 * (v - 0.5), -1);
    vertexPosition.applyMatrix4(this.projectionMatrixInverse);
    vertexPosition.multiplyScalar(-depth / vertexPosition.z);
    return vertexPosition;
  }

  updateDepthData(depthData: XRCPUDepthInformation, view_id = 0) {
    this.depthData[view_id] = depthData;
    // Workaround for b/382679381.
    this.rawValueToMeters = depthData.rawValueToMeters;
    if (this.options.useFloat32) {
      this.rawValueToMeters = 1.0;
    }

    // Updates Depth Array.
    if (this.depthArray[view_id] == null) {
      this.depthArray[view_id] = this.options.useFloat32 ?
          new Float32Array(depthData.data) :
          new Uint16Array(depthData.data);
      this.width = depthData.width;
      this.height = depthData.height;
    } else {
      // Copies the data from an ArrayBuffer to the existing TypedArray.
      this.depthArray[view_id].set(
          this.options.useFloat32 ? new Float32Array(depthData.data) :
                                    new Uint16Array(depthData.data));
    }

    // Updates Depth Texture.
    if (this.options.depthTexture.enabled && this.depthTextures) {
      this.depthTextures.update(depthData, view_id);
    }

    if (this.options.depthMesh.enabled && this.depthMesh && view_id == 0) {
      this.depthMesh.updateDepth(depthData)
    }
  }

  getTexture(view_id: number) {
    if (!this.options.depthTexture.enabled) return undefined;
    return this.depthTextures?.get(view_id);
  }

  update(frame: XRFrame) {
    if (!this.options.enabled) return;

    this.updateLocalDepth(frame);
    if (this.options.occlusion.enabled) {
      this.renderOcclusionPass();
    }
  }

  updateLocalDepth(frame: XRFrame) {
    if (onDesktopUserAgent()) {
      return;
    }

    const leftCamera = this.renderer.xr?.getCamera?.()?.cameras?.[0];
    if (leftCamera && this.depthMesh && this.depthMesh.parent != leftCamera) {
      leftCamera.add(this.depthMesh);
      this.scene.add(leftCamera);
    }

    if (!frame) return;
    const session = frame.session;

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

    if (this.xrRefSpace == null) {
      session.requestReferenceSpace('local').then((refSpace) => {
        this.xrRefSpace = refSpace;
      });
      session.addEventListener('end', () => {
        this.xrRefSpace = undefined;
      });
    } else {
      const pose = frame.getViewerPose(this.xrRefSpace);
      if (pose) {
        for (let view_id = 0; view_id < pose.views.length; ++view_id) {
          const view = pose.views[view_id];
          this.view[view_id] = view;
          const depthData = frame.getDepthInformation(view);
          if (!depthData) {
            return;
          }
          this.updateDepthData(depthData, view_id);
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
          leftDepthTexture, this.rawValueToMeters, 0);
    }
    const rightDepthTexture = this.getTexture(1);
    if (rightDepthTexture) {
      this.occlusionPass!.setDepthTexture(
          rightDepthTexture, this.rawValueToMeters, 1);
    }
    const xrIsPresenting = this.renderer.xr.isPresenting;
    this.renderer.xr.isPresenting = false;
    this.occlusionPass!.render(this.renderer, undefined, undefined, 0);
    this.renderer.xr.isPresenting = xrIsPresenting;
    for (const shader of this.occludableShaders) {
      this.occlusionPass!.updateOcclusionMapUniforms(
          shader.uniforms, this.renderer);
    }
  }

  debugLog() {
    const arrayBuffer = this.depthData[0].data;
    const uint8Array = new Uint8Array(arrayBuffer);
    // Convert Uint8Array to a string where each character represents a byte
    const binaryString =
        Array.from(uint8Array, byte => String.fromCharCode(byte)).join('');
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
};
