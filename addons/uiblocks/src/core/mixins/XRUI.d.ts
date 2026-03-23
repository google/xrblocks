import * as THREE from 'three';
import { Constructor } from 'xrblocks';
/**
 * A mixin that injects `ScriptMixin` capabilities into a `THREE.Object3D` base class.
 *
 * It automatically handles frame updates by accessing `xrblocks`'s `getDeltaTime()`,
 * and forwards the delta time to both the `ScriptMixin`'s internal update cycle
 * and an optional `onUpdate` callback hook on the instance.
 *
 * @typeParam TBase - The base class type extending `THREE.Object3D`.
 * @param Base - The target base class to extend.
 * @returns A new class extending `ScriptMixin(Base)` with custom update hooks.
 */
export declare function XRUI<TBase extends Constructor<THREE.Object3D>>(Base: TBase): {
    new (...args: any[]): {
        /**
         * Optional callback executed on every frame update step.
         */
        onUpdate?: () => void;
        /**
         * Core update loop called per frame.
         * Propagates the frame tick downstream to `onUpdate` hooks.
         */
        update(): void;
        ux: import("xrblocks").UX;
        isXRScript: boolean;
        init(_?: object): void | Promise<void>;
        initPhysics(_physics: import("xrblocks").Physics): void | Promise<void>;
        physicsStep(): void;
        onXRSessionStarted(_session?: XRSession): void;
        onXRSessionEnded(): void;
        onSimulatorStarted(): void;
        onSelectStart(_event: import("xrblocks").SelectEvent): void;
        onSelectEnd(_event: import("xrblocks").SelectEvent): void;
        onSelect(_event: import("xrblocks").SelectEvent): void;
        onSelecting(_event: import("xrblocks").SelectEvent): void;
        onKeyDown(_event: import("xrblocks").KeyEvent): void;
        onKeyUp(_event: import("xrblocks").KeyEvent): void;
        onSqueezeStart(_event: import("xrblocks").SelectEvent): void;
        onSqueezeEnd(_event: import("xrblocks").SelectEvent): void;
        onSqueezing(_event: import("xrblocks").SelectEvent): void;
        onSqueeze(_event: import("xrblocks").SelectEvent): void;
        onObjectSelectStart(_event: import("xrblocks").SelectEvent): boolean | void;
        onObjectSelectEnd(_event: import("xrblocks").SelectEvent): boolean | void;
        onHoverEnter(_controller: THREE.Object3D): boolean | void;
        onHoverExit(_controller: THREE.Object3D): boolean | void;
        onHovering(_controller: THREE.Object3D): boolean | void;
        onObjectTouchStart(_event: import("xrblocks").ObjectTouchEvent): void;
        onObjectTouching(_event: import("xrblocks").ObjectTouchEvent): void;
        onObjectTouchEnd(_event: import("xrblocks").ObjectTouchEvent): void;
        onObjectGrabStart(_event: import("xrblocks").ObjectGrabEvent): void;
        onObjectGrabbing(_event: import("xrblocks").ObjectGrabEvent): void;
        onObjectGrabEnd(_event: import("xrblocks").ObjectGrabEvent): void;
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
} & TBase;
