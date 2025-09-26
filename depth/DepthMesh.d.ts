import type RAPIER_NS from '@dimforge/rapier3d';
import * as THREE from 'three';
import { MeshScript } from '../core/Script';
import { DepthOptions } from './DepthOptions';
import { DepthTextures } from './DepthTextures';
export declare class DepthMesh extends MeshScript {
    private depthOptions;
    private depthTextures?;
    static dependencies: {
        camera: typeof THREE.Camera;
        renderer: typeof THREE.WebGLRenderer;
    };
    static isDepthMesh: boolean;
    ignoreReticleRaycast: boolean;
    private worldPosition;
    private worldQuaternion;
    private updateVertexNormals;
    private minDepth;
    private maxDepth;
    private minDepthPrev;
    private maxDepthPrev;
    private downsampledGeometry?;
    private downsampledMesh?;
    private collider?;
    private colliders;
    private colliderUpdateFps;
    private renderer;
    private camera;
    private projectionMatrixInverse;
    private lastColliderUpdateTime;
    private options;
    private depthTextureMaterialUniforms?;
    private RAPIER?;
    private blendedWorld?;
    private rigidBody?;
    private colliderId;
    constructor(depthOptions: DepthOptions, width: number, height: number, depthTextures?: DepthTextures | undefined);
    /**
     * Initialize the depth mesh.
     */
    init({ camera, renderer }: {
        camera: THREE.Camera;
        renderer: THREE.WebGLRenderer;
    }): void;
    /**
     * Updates the depth data and geometry positions based on the provided camera
     * and depth data.
     */
    updateDepth(depthData: XRCPUDepthInformation): void;
    /**
     * Method to manually update the full resolution geometry.
     * Only needed if options.updateFullResolutionGeometry is false.
     */
    updateFullResolutionGeometry(depthData: XRCPUDepthInformation): void;
    /**
     * Internal method to update the geometry of the depth mesh.
     */
    private updateGeometry;
    /**
     * Optimizes collider updates to run periodically based on the specified FPS.
     */
    updateColliderIfNeeded(): void;
    initRapierPhysics(RAPIER: typeof RAPIER_NS, blendedWorld: RAPIER_NS.World): void;
    getDepth(raycaster: THREE.Raycaster, ndc: THREE.Vector2, camera: THREE.Camera): number;
    /**
     * Customizes raycasting to compute normals for intersections.
     * @param raycaster - The raycaster object.
     * @param intersects - Array to store intersections.
     * @returns - True if intersections are found.
     */
    raycast(raycaster: THREE.Raycaster, intersects: THREE.Intersection[]): boolean;
    getColliderFromHandle(handle: RAPIER_NS.ColliderHandle): RAPIER_NS.Collider | undefined;
}
