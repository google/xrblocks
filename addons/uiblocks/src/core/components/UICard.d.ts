import * as THREE from 'three';
import * as xb from 'xrblocks';
import { UICardBehavior } from '../behaviors/UICardBehavior';
import { ManipulationPanel, ManipulationPanelProperties } from '../primitives/ManipulationPanel';
/**
 * Properties for initializing a UICard.
 * Extends ManipulationPanelProperties with spatial positioning, behavior setup, and standard layout anchors.
 */
export type UICardOutProperties = ManipulationPanelProperties & {
    /** Optional name for scene graph identification. */
    name?: string;
    /** 3D World position. */
    position?: THREE.Vector3;
    /** 3D World rotation. */
    rotation?: THREE.Quaternion;
    /** List of behavior modifiers to attach (e.g., BillboardBehavior, HeadLeashBehavior). */
    behaviors?: UICardBehavior[];
    /** Enables debug outlines/logging if applicable. */
    debug?: boolean;
    /** Initial visibility state. */
    visible?: boolean;
    /** Layout Property: absolute bounding width in meters. */
    sizeX?: number;
    /** Layout Property: absolute bounding height in meters. */
    sizeY?: number;
    /** Layout Anchor: 'left', 'right', 'center', or a floating ratio 0.0-1.0. */
    anchorX?: 'left' | 'right' | 'center' | number;
    /** Layout Anchor: 'bottom', 'top', 'center', or a floating ratio 0.0-1.0. */
    anchorY?: 'bottom' | 'top' | 'center' | number;
    /** Resolution adapter scaling physical size onto panel dimensions. */
    pixelSize?: number;
};
declare const UICard_base: {
    new (...args: any[]): {
        onUpdate?: (() => void) | undefined;
        update(): void;
        ux: xb.UX;
        isXRScript: boolean;
        init(_?: object): void | Promise<void>;
        initPhysics(_physics: xb.Physics): void | Promise<void>;
        physicsStep(): void;
        onXRSessionStarted(_session?: XRSession): void;
        onXRSessionEnded(): void;
        onSimulatorStarted(): void;
        onSelectStart(_event: xb.SelectEvent): void;
        onSelectEnd(_event: xb.SelectEvent): void;
        onSelect(_event: xb.SelectEvent): void;
        onSelecting(_event: xb.SelectEvent): void;
        onKeyDown(_event: xb.KeyEvent): void;
        onKeyUp(_event: xb.KeyEvent): void;
        onSqueezeStart(_event: xb.SelectEvent): void;
        onSqueezeEnd(_event: xb.SelectEvent): void;
        onSqueezing(_event: xb.SelectEvent): void;
        onSqueeze(_event: xb.SelectEvent): void;
        onObjectSelectStart(_event: xb.SelectEvent): boolean | void;
        onObjectSelectEnd(_event: xb.SelectEvent): boolean | void;
        onHoverEnter(_controller: THREE.Object3D): boolean | void;
        onHoverExit(_controller: THREE.Object3D): boolean | void;
        onHovering(_controller: THREE.Object3D): boolean | void;
        onObjectTouchStart(_event: xb.ObjectTouchEvent): void;
        onObjectTouching(_event: xb.ObjectTouchEvent): void;
        onObjectTouchEnd(_event: xb.ObjectTouchEvent): void;
        onObjectGrabStart(_event: xb.ObjectGrabEvent): void;
        onObjectGrabbing(_event: xb.ObjectGrabEvent): void;
        onObjectGrabEnd(_event: xb.ObjectGrabEvent): void;
        dispose(): void;
        readonly isObject3D: true;
        readonly id: number;
        uuid: string;
        name: string;
        readonly type: string;
        parent: THREE.Object3D | null;
        children: THREE.Object3D[];
        up: THREE.Vector3;
        readonly position: THREE.Vector3;
        readonly rotation: THREE.Euler;
        readonly quaternion: THREE.Quaternion;
        readonly scale: THREE.Vector3;
        readonly modelViewMatrix: THREE.Matrix4;
        readonly normalMatrix: THREE.Matrix3;
        matrix: THREE.Matrix4;
        matrixWorld: THREE.Matrix4;
        matrixAutoUpdate: boolean;
        matrixWorldAutoUpdate: boolean;
        matrixWorldNeedsUpdate: boolean;
        layers: THREE.Layers;
        visible: boolean;
        castShadow: boolean;
        receiveShadow: boolean;
        frustumCulled: boolean;
        renderOrder: number;
        animations: THREE.AnimationClip[];
        userData: Record<string, any>;
        customDepthMaterial?: THREE.Material | undefined;
        customDistanceMaterial?: THREE.Material | undefined;
        onBeforeShadow: ((renderer: THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.Camera, shadowCamera: THREE.Camera, geometry: THREE.BufferGeometry, depthMaterial: THREE.Material, group: THREE.Group) => void) & ((renderer: THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.Camera, shadowCamera: THREE.Camera, geometry: THREE.BufferGeometry, depthMaterial: THREE.Material, group: THREE.Group) => void);
        onAfterShadow: ((renderer: THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.Camera, shadowCamera: THREE.Camera, geometry: THREE.BufferGeometry, depthMaterial: THREE.Material, group: THREE.Group) => void) & ((renderer: THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.Camera, shadowCamera: THREE.Camera, geometry: THREE.BufferGeometry, depthMaterial: THREE.Material, group: THREE.Group) => void);
        onBeforeRender: ((renderer: THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.Camera, geometry: THREE.BufferGeometry, material: THREE.Material, group: THREE.Group) => void) & ((renderer: THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.Camera, geometry: THREE.BufferGeometry, material: THREE.Material, group: THREE.Group) => void);
        onAfterRender: ((renderer: THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.Camera, geometry: THREE.BufferGeometry, material: THREE.Material, group: THREE.Group) => void) & ((renderer: THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.Camera, geometry: THREE.BufferGeometry, material: THREE.Material, group: THREE.Group) => void);
        applyMatrix4: ((matrix: THREE.Matrix4) => void) & ((matrix: THREE.Matrix4) => void);
        applyQuaternion: ((quaternion: THREE.Quaternion) => any) & ((quaternion: THREE.Quaternion) => /*elided*/ any);
        setRotationFromAxisAngle: ((axis: THREE.Vector3, angle: number) => void) & ((axis: THREE.Vector3, angle: number) => void);
        setRotationFromEuler: ((euler: THREE.Euler) => void) & ((euler: THREE.Euler) => void);
        setRotationFromMatrix: ((m: THREE.Matrix4) => void) & ((m: THREE.Matrix4) => void);
        setRotationFromQuaternion: ((q: THREE.Quaternion) => void) & ((q: THREE.Quaternion) => void);
        rotateOnAxis: ((axis: THREE.Vector3, angle: number) => any) & ((axis: THREE.Vector3, angle: number) => /*elided*/ any);
        rotateOnWorldAxis: ((axis: THREE.Vector3, angle: number) => any) & ((axis: THREE.Vector3, angle: number) => /*elided*/ any);
        rotateX: ((angle: number) => any) & ((angle: number) => /*elided*/ any);
        rotateY: ((angle: number) => any) & ((angle: number) => /*elided*/ any);
        rotateZ: ((angle: number) => any) & ((angle: number) => /*elided*/ any);
        translateOnAxis: ((axis: THREE.Vector3, distance: number) => any) & ((axis: THREE.Vector3, distance: number) => /*elided*/ any);
        translateX: ((distance: number) => any) & ((distance: number) => /*elided*/ any);
        translateY: ((distance: number) => any) & ((distance: number) => /*elided*/ any);
        translateZ: ((distance: number) => any) & ((distance: number) => /*elided*/ any);
        localToWorld: ((vector: THREE.Vector3) => THREE.Vector3) & ((vector: THREE.Vector3) => THREE.Vector3);
        worldToLocal: ((vector: THREE.Vector3) => THREE.Vector3) & ((vector: THREE.Vector3) => THREE.Vector3);
        lookAt: {
            (vector: THREE.Vector3): void;
            (x: number, y: number, z: number): void;
        } & {
            (vector: THREE.Vector3): void;
            (x: number, y: number, z: number): void;
        };
        add: ((...object: THREE.Object3D[]) => any) & ((...object: THREE.Object3D[]) => /*elided*/ any);
        remove: ((...object: THREE.Object3D[]) => any) & ((...object: THREE.Object3D[]) => /*elided*/ any);
        removeFromParent: (() => any) & (() => /*elided*/ any);
        clear: (() => any) & (() => /*elided*/ any);
        attach: ((object: THREE.Object3D) => any) & ((object: THREE.Object3D) => /*elided*/ any);
        getObjectById: ((id: number) => THREE.Object3D | undefined) & ((id: number) => THREE.Object3D | undefined);
        getObjectByName: ((name: string) => THREE.Object3D | undefined) & ((name: string) => THREE.Object3D | undefined);
        getObjectByProperty: ((name: string, value: any) => THREE.Object3D | undefined) & ((name: string, value: any) => THREE.Object3D | undefined);
        getObjectsByProperty: ((name: string, value: any, optionalTarget?: THREE.Object3D[]) => THREE.Object3D[]) & ((name: string, value: any, optionalTarget?: THREE.Object3D[]) => THREE.Object3D[]);
        getWorldPosition: ((target: THREE.Vector3) => THREE.Vector3) & ((target: THREE.Vector3) => THREE.Vector3);
        getWorldQuaternion: ((target: THREE.Quaternion) => THREE.Quaternion) & ((target: THREE.Quaternion) => THREE.Quaternion);
        getWorldScale: ((target: THREE.Vector3) => THREE.Vector3) & ((target: THREE.Vector3) => THREE.Vector3);
        getWorldDirection: ((target: THREE.Vector3) => THREE.Vector3) & ((target: THREE.Vector3) => THREE.Vector3);
        raycast: ((raycaster: THREE.Raycaster, intersects: THREE.Intersection[]) => void) & ((raycaster: THREE.Raycaster, intersects: THREE.Intersection[]) => void);
        traverse: ((callback: (object: THREE.Object3D) => any) => void) & ((callback: (object: THREE.Object3D) => any) => void);
        traverseVisible: ((callback: (object: THREE.Object3D) => any) => void) & ((callback: (object: THREE.Object3D) => any) => void);
        traverseAncestors: ((callback: (object: THREE.Object3D) => any) => void) & ((callback: (object: THREE.Object3D) => any) => void);
        updateMatrix: (() => void) & (() => void);
        updateMatrixWorld: ((force?: boolean) => void) & ((force?: boolean) => void);
        updateWorldMatrix: ((updateParents: boolean, updateChildren: boolean) => void) & ((updateParents: boolean, updateChildren: boolean) => void);
        toJSON: ((meta?: THREE.JSONMeta) => THREE.Object3DJSON) & ((meta?: THREE.JSONMeta) => THREE.Object3DJSON);
        clone: ((recursive?: boolean) => any) & ((recursive?: boolean) => /*elided*/ any);
        copy: ((object: THREE.Object3D, recursive?: boolean) => any) & ((object: THREE.Object3D, recursive?: boolean) => /*elided*/ any);
        count?: number | undefined;
        occlusionTest?: boolean | undefined;
        static?: boolean | undefined;
        addEventListener: (<T extends keyof THREE.Object3DEventMap>(type: T, listener: THREE.EventListener<THREE.Object3DEventMap[T], T, any>) => void) & (<T extends keyof THREE.Object3DEventMap>(type: T, listener: THREE.EventListener<THREE.Object3DEventMap[T], T, /*elided*/ any>) => void);
        hasEventListener: (<T extends keyof THREE.Object3DEventMap>(type: T, listener: THREE.EventListener<THREE.Object3DEventMap[T], T, any>) => boolean) & (<T extends keyof THREE.Object3DEventMap>(type: T, listener: THREE.EventListener<THREE.Object3DEventMap[T], T, /*elided*/ any>) => boolean);
        removeEventListener: (<T extends keyof THREE.Object3DEventMap>(type: T, listener: THREE.EventListener<THREE.Object3DEventMap[T], T, any>) => void) & (<T extends keyof THREE.Object3DEventMap>(type: T, listener: THREE.EventListener<THREE.Object3DEventMap[T], T, /*elided*/ any>) => void);
        dispatchEvent: (<T extends keyof THREE.Object3DEventMap>(event: THREE.BaseEvent<T> & THREE.Object3DEventMap[T]) => void) & (<T extends keyof THREE.Object3DEventMap>(event: THREE.BaseEvent<T> & THREE.Object3DEventMap[T]) => void);
        spherecast?(sphere: THREE.Sphere, intersects: Array<THREE.Intersection>): void;
        intersectChildren?: boolean;
        interactableDescendants?: Array<THREE.Object3D>;
        ancestorsHaveListeners?: boolean;
        defaultPointerEvents?: import("@pmndrs/uikit/dist/panel").PointerEventsProperties["pointerEvents"];
        pointerEvents?: "none" | "auto" | "listener";
        pointerEventsType?: import("@pmndrs/uikit/dist/panel").AllowedPointerEventsType;
        pointerEventsOrder?: number;
    };
} & typeof ManipulationPanel;
/**
 * UICard
 * The **Physical World** bridge. It serves as the root container anchoring UI menus in 3D scene space.
 * Inherits from ManipulationPanel via the XRUI mixin to handle grabbable spatial operations and bounding borders.
 */
export declare class UICard extends UICard_base {
    name: string;
    private behaviors;
    get isDragging(): boolean;
    readonly cardPixelSize: number;
    readonly baseWidth?: number;
    readonly baseHeight?: number;
    readonly baseSizeX?: number;
    readonly baseSizeY?: number;
    readonly anchorX?: number;
    readonly anchorY?: number;
    readonly basePosition?: THREE.Vector3;
    /**
     * Constructs a new UICard.
     * Initializes layouts, transparent bounding wrappers, and mounts attached behaviors.
     */
    constructor(config: UICardOutProperties);
    /**
     * Displays the card.
     * Triggers ToggleAnimationBehavior triggers if available; otherwise toggles `.visible` directly.
     */
    show(): void;
    /**
     * Hides the card.
     * Triggers ToggleAnimationBehavior trigger if available; otherwise toggles `.visible` directly.
     */
    hide(): void;
    /**
     * Toggles the card's visibility.
     * Defers to ToggleAnimationBehavior if present.
     */
    toggle(): void;
    init(xrCoreInstance?: xb.Core): void;
    /**
     * Attaches a behavior modifier to the card and triggers its setup cycle.
     */
    addBehavior(behavior: UICardBehavior): void;
    /**
     * Detaches a behavior modifier and calls its disposal logic to release event hooks.
     */
    removeBehavior(behavior: UICardBehavior): void;
    update(): void;
    dispose(): void;
}
export {};
