import * as THREE from 'three';
import { Registry } from '../core/components/Registry';
import type { Shader } from '../utils/Types';
import { DepthMesh } from './DepthMesh';
import { DepthOptions } from './DepthOptions';
export type DepthArray = Float32Array | Uint16Array;
export declare class Depth {
    static instance?: Depth;
    private camera;
    private renderer;
    private scene;
    private projectionMatrixInverse;
    private xrRefSpace?;
    view: XRView[];
    depthData: XRCPUDepthInformation[];
    depthArray: DepthArray[];
    depthMesh?: DepthMesh;
    private depthTextures?;
    options: DepthOptions;
    width: number;
    height: number;
    rawValueToMeters: number;
    occludableShaders: Set<Shader>;
    private occlusionPass?;
    private depthClientsInitialized;
    private depthClients;
    /**
     * Depth is a lightweight manager based on three.js to simply prototyping
     * with Depth in WebXR.
     */
    constructor();
    /**
     * Initialize Depth manager.
     */
    init(camera: THREE.PerspectiveCamera, options: DepthOptions, renderer: THREE.WebGLRenderer, registry: Registry, scene: THREE.Scene): void;
    /**
     * Retrieves the depth at normalized coordinates (u, v).
     * @param u - Normalized horizontal coordinate.
     * @param v - Normalized vertical coordinate.
     * @returns Depth value at the specified coordinates.
     */
    getDepth(u: number, v: number): number;
    /**
     * Projects the given world position to clip space and then to view
     * space using the depth.
     * @param position - The world position to project.
     */
    getProjectedDepthViewPositionFromWorldPosition(position: THREE.Vector3, target?: THREE.Vector3): THREE.Vector3;
    /**
     * Retrieves the depth at normalized coordinates (u, v).
     * @param u - Normalized horizontal coordinate.
     * @param v - Normalized vertical coordinate.
     * @returns Vertex at (u, v)
     */
    getVertex(u: number, v: number): THREE.Vector3 | null;
    updateDepthData(depthData: XRCPUDepthInformation, view_id?: number): void;
    getTexture(view_id: number): THREE.DataTexture | undefined;
    update(frame: XRFrame): void;
    updateLocalDepth(frame: XRFrame): void;
    renderOcclusionPass(): void;
    debugLog(): void;
    resumeDepth(client: object): void;
    pauseDepth(client: object): void;
}
