import * as THREE from 'three';
import { Script } from '../../core/Script';
import { Depth } from '../../depth/Depth';
import { Draggable, DragMode, HasDraggingMode } from '../../ux/DragManager';
export interface GLTFData {
    model: string;
    path: string;
    scale?: THREE.Vector3Like;
    rotation?: THREE.Vector3Like;
    position?: THREE.Vector3Like;
    verticallyAlignObject?: boolean;
    horizontallyAlignObject?: boolean;
}
export interface SplatData {
    model: string;
    scale?: THREE.Vector3Like;
    rotation?: THREE.Vector3Like;
    position?: THREE.Vector3Like;
    verticallyAlignObject?: boolean;
    horizontallyAlignObject?: boolean;
}
export declare class SplatAnchor extends THREE.Object3D implements HasDraggingMode {
    draggingMode: DragMode;
}
export declare class RotationRaycastMesh extends THREE.Mesh<THREE.BufferGeometry, THREE.Material> {
    constructor(geometry: THREE.BufferGeometry, material: THREE.Material);
    draggingMode: DragMode;
}
/**
 * A comprehensive UI component for loading, displaying, and
 * interacting with 3D models (GLTF and Splats) in an XR scene. It
 * automatically creates an interactive platform for translation and provides
 * mechanisms for rotation and scaling in both desktop and XR.
 */
export declare class ModelViewer extends Script implements Draggable {
    static dependencies: {
        camera: typeof THREE.Camera;
        depth: typeof Depth;
        scene: typeof THREE.Scene;
        renderer: typeof THREE.WebGLRenderer;
    };
    draggable: boolean;
    rotatable: boolean;
    scalable: boolean;
    platformAnimationSpeed: number;
    platformThickness: number;
    isOneOneScale: boolean;
    initialScale: THREE.Vector3;
    startAnimationOnLoad: boolean;
    clipActions: THREE.AnimationAction[];
    private data?;
    private clock;
    private animationMixer?;
    private gltfMesh?;
    private splatMesh?;
    private splatAnchor?;
    private hoveringControllers;
    private raycastToChildren;
    private occludableShaders;
    private camera?;
    private depth?;
    private scene?;
    private renderer?;
    private bbox;
    private platform?;
    private controlBar?;
    private rotationRaycastMesh?;
    constructor({ castShadow, receiveShadow, raycastToChildren, }: {
        castShadow?: boolean | undefined;
        receiveShadow?: boolean | undefined;
        raycastToChildren?: boolean | undefined;
    });
    init({ camera, depth, scene, renderer }: {
        camera: THREE.Camera;
        depth: Depth;
        scene: THREE.Scene;
        renderer: THREE.WebGLRenderer;
    }): Promise<void>;
    loadSplatModel({ data, onSceneLoaded, platformMargin, setupRaycastCylinder, setupRaycastBox, setupPlatform, }: {
        data: SplatData;
        onSceneLoaded?: (scene: THREE.Object3D) => void;
        platformMargin?: THREE.Vector2;
        setupRaycastCylinder?: boolean;
        setupRaycastBox?: boolean;
        setupPlatform?: boolean;
    }): Promise<void | SplatAnchor>;
    loadGLTFModel({ data, onSceneLoaded, platformMargin, setupRaycastCylinder, setupRaycastBox, setupPlatform, renderer, addOcclusionToShader }: {
        data: GLTFData;
        onSceneLoaded?: (scene: THREE.Object3D) => void;
        platformMargin?: THREE.Vector2;
        setupRaycastCylinder?: boolean;
        setupRaycastBox?: boolean;
        setupPlatform?: boolean;
        renderer?: THREE.WebGLRenderer;
        addOcclusionToShader?: boolean;
    }): Promise<void | THREE.Group<THREE.Object3DEventMap>>;
    setupBoundingBox(verticallyAlignObject?: boolean, horizontallyAlignObject?: boolean): Promise<void>;
    setupRaycastCylinder(): void;
    setupRaycastBox(): void;
    setupPlatform(platformMargin?: THREE.Vector2): void;
    update(): void;
    onObjectSelectStart(): boolean;
    onObjectSelectEnd(): boolean;
    onHoverEnter(controller: THREE.Object3D): void;
    onHoverExit(controller: THREE.Object3D): void;
    /**
     * {@inheritDoc}
     */
    raycast(raycaster: THREE.Raycaster, intersects: THREE.Intersection[]): boolean;
    onScaleButtonClick(): void;
    setCastShadow(castShadow: boolean): void;
    setReceiveShadow(receiveShadow: boolean): void;
    getOcclusionEnabled(): any;
    setOcclusionEnabled(enabled: boolean): void;
    playClipAnimationOnce(): void;
    createSparkRendererIfNeeded(): Promise<void>;
}
