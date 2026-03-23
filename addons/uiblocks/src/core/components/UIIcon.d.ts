import { BaseOutProperties, InProperties, RenderContext, Svg, SvgOutProperties, WithSignal } from '@pmndrs/uikit';
import { Signal } from '@preact/signals-core';
import { ColorRepresentation } from 'three';
/**
 * Properties for initializing a UIIcon.
 * Extends standard `@pmndrs/uikit` SvgOutProperties with Material Symbols generation rules.
 */
export type UIIconOutProperties = SvgOutProperties & {
    /** The snake_case name of the Material Symbol icon (e.g., 'favorite', 'settings') */
    icon?: string;
    /** Font Weight override: standard increments 100-700 (standard is 400). Supports string representation as well. */
    iconWeight?: number | string;
    /** Font Style style override: 'outlined', 'rounded', 'sharp' */
    iconStyle?: string;
    /** Fill state override: 0 (unfilled) or 1 (filled) */
    iconFill?: number;
};
export type UIIconProperties = InProperties<UIIconOutProperties>;
declare const UIIcon_base: {
    new (...args: any[]): {
        onUpdate?: (() => void) | undefined;
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
        onHoverEnter(_controller: import("three").Object3D): boolean | void;
        onHoverExit(_controller: import("three").Object3D): boolean | void;
        onHovering(_controller: import("three").Object3D): boolean | void;
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
        parent: import("three").Object3D | null;
        children: import("three").Object3D[];
        up: import("three").Vector3;
        readonly position: import("three").Vector3;
        readonly rotation: import("three").Euler;
        readonly quaternion: import("three").Quaternion;
        readonly scale: import("three").Vector3;
        readonly modelViewMatrix: import("three").Matrix4;
        readonly normalMatrix: import("three").Matrix3;
        matrix: import("three").Matrix4;
        matrixWorld: import("three").Matrix4;
        matrixAutoUpdate: boolean;
        matrixWorldAutoUpdate: boolean;
        matrixWorldNeedsUpdate: boolean;
        layers: import("three").Layers;
        visible: boolean;
        castShadow: boolean;
        receiveShadow: boolean;
        frustumCulled: boolean;
        renderOrder: number;
        animations: import("three").AnimationClip[];
        userData: Record<string, any>;
        customDepthMaterial?: import("three").Material | undefined;
        customDistanceMaterial?: import("three").Material | undefined;
        onBeforeShadow: ((renderer: import("three").WebGLRenderer, scene: import("three").Scene, camera: import("three").Camera, shadowCamera: import("three").Camera, geometry: import("three").BufferGeometry, depthMaterial: import("three").Material, group: import("three").Group) => void) & ((renderer: import("three").WebGLRenderer, scene: import("three").Scene, camera: import("three").Camera, shadowCamera: import("three").Camera, geometry: import("three").BufferGeometry, depthMaterial: import("three").Material, group: import("three").Group) => void);
        onAfterShadow: ((renderer: import("three").WebGLRenderer, scene: import("three").Scene, camera: import("three").Camera, shadowCamera: import("three").Camera, geometry: import("three").BufferGeometry, depthMaterial: import("three").Material, group: import("three").Group) => void) & ((renderer: import("three").WebGLRenderer, scene: import("three").Scene, camera: import("three").Camera, shadowCamera: import("three").Camera, geometry: import("three").BufferGeometry, depthMaterial: import("three").Material, group: import("three").Group) => void);
        onBeforeRender: ((renderer: import("three").WebGLRenderer, scene: import("three").Scene, camera: import("three").Camera, geometry: import("three").BufferGeometry, material: import("three").Material, group: import("three").Group) => void) & ((renderer: import("three").WebGLRenderer, scene: import("three").Scene, camera: import("three").Camera, geometry: import("three").BufferGeometry, material: import("three").Material, group: import("three").Group) => void);
        onAfterRender: ((renderer: import("three").WebGLRenderer, scene: import("three").Scene, camera: import("three").Camera, geometry: import("three").BufferGeometry, material: import("three").Material, group: import("three").Group) => void) & ((renderer: import("three").WebGLRenderer, scene: import("three").Scene, camera: import("three").Camera, geometry: import("three").BufferGeometry, material: import("three").Material, group: import("three").Group) => void);
        applyMatrix4: ((matrix: import("three").Matrix4) => void) & ((matrix: import("three").Matrix4) => void);
        applyQuaternion: ((quaternion: import("three").Quaternion) => any) & ((quaternion: import("three").Quaternion) => /*elided*/ any);
        setRotationFromAxisAngle: ((axis: import("three").Vector3, angle: number) => void) & ((axis: import("three").Vector3, angle: number) => void);
        setRotationFromEuler: ((euler: import("three").Euler) => void) & ((euler: import("three").Euler) => void);
        setRotationFromMatrix: ((m: import("three").Matrix4) => void) & ((m: import("three").Matrix4) => void);
        setRotationFromQuaternion: ((q: import("three").Quaternion) => void) & ((q: import("three").Quaternion) => void);
        rotateOnAxis: ((axis: import("three").Vector3, angle: number) => any) & ((axis: import("three").Vector3, angle: number) => /*elided*/ any);
        rotateOnWorldAxis: ((axis: import("three").Vector3, angle: number) => any) & ((axis: import("three").Vector3, angle: number) => /*elided*/ any);
        rotateX: ((angle: number) => any) & ((angle: number) => /*elided*/ any);
        rotateY: ((angle: number) => any) & ((angle: number) => /*elided*/ any);
        rotateZ: ((angle: number) => any) & ((angle: number) => /*elided*/ any);
        translateOnAxis: ((axis: import("three").Vector3, distance: number) => any) & ((axis: import("three").Vector3, distance: number) => /*elided*/ any);
        translateX: ((distance: number) => any) & ((distance: number) => /*elided*/ any);
        translateY: ((distance: number) => any) & ((distance: number) => /*elided*/ any);
        translateZ: ((distance: number) => any) & ((distance: number) => /*elided*/ any);
        localToWorld: ((vector: import("three").Vector3) => import("three").Vector3) & ((vector: import("three").Vector3) => import("three").Vector3);
        worldToLocal: ((vector: import("three").Vector3) => import("three").Vector3) & ((vector: import("three").Vector3) => import("three").Vector3);
        lookAt: {
            (vector: import("three").Vector3): void;
            (x: number, y: number, z: number): void;
        } & {
            (vector: import("three").Vector3): void;
            (x: number, y: number, z: number): void;
        };
        add: ((...object: import("three").Object3D[]) => any) & ((...object: import("three").Object3D[]) => /*elided*/ any);
        remove: ((...object: import("three").Object3D[]) => any) & ((...object: import("three").Object3D[]) => /*elided*/ any);
        removeFromParent: (() => any) & (() => /*elided*/ any);
        clear: (() => any) & (() => /*elided*/ any);
        attach: ((object: import("three").Object3D) => any) & ((object: import("three").Object3D) => /*elided*/ any);
        getObjectById: ((id: number) => import("three").Object3D | undefined) & ((id: number) => import("three").Object3D | undefined);
        getObjectByName: ((name: string) => import("three").Object3D | undefined) & ((name: string) => import("three").Object3D | undefined);
        getObjectByProperty: ((name: string, value: any) => import("three").Object3D | undefined) & ((name: string, value: any) => import("three").Object3D | undefined);
        getObjectsByProperty: ((name: string, value: any, optionalTarget?: import("three").Object3D[]) => import("three").Object3D[]) & ((name: string, value: any, optionalTarget?: import("three").Object3D[]) => import("three").Object3D[]);
        getWorldPosition: ((target: import("three").Vector3) => import("three").Vector3) & ((target: import("three").Vector3) => import("three").Vector3);
        getWorldQuaternion: ((target: import("three").Quaternion) => import("three").Quaternion) & ((target: import("three").Quaternion) => import("three").Quaternion);
        getWorldScale: ((target: import("three").Vector3) => import("three").Vector3) & ((target: import("three").Vector3) => import("three").Vector3);
        getWorldDirection: ((target: import("three").Vector3) => import("three").Vector3) & ((target: import("three").Vector3) => import("three").Vector3);
        raycast: ((raycaster: import("three").Raycaster, intersects: import("three").Intersection[]) => void) & ((raycaster: import("three").Raycaster, intersects: import("three").Intersection[]) => void);
        traverse: ((callback: (object: import("three").Object3D) => any) => void) & ((callback: (object: import("three").Object3D) => any) => void);
        traverseVisible: ((callback: (object: import("three").Object3D) => any) => void) & ((callback: (object: import("three").Object3D) => any) => void);
        traverseAncestors: ((callback: (object: import("three").Object3D) => any) => void) & ((callback: (object: import("three").Object3D) => any) => void);
        updateMatrix: (() => void) & (() => void);
        updateMatrixWorld: ((force?: boolean) => void) & ((force?: boolean) => void);
        updateWorldMatrix: ((updateParents: boolean, updateChildren: boolean) => void) & ((updateParents: boolean, updateChildren: boolean) => void);
        toJSON: ((meta?: import("three").JSONMeta) => import("three").Object3DJSON) & ((meta?: import("three").JSONMeta) => import("three").Object3DJSON);
        clone: ((recursive?: boolean) => any) & ((recursive?: boolean) => /*elided*/ any);
        copy: ((object: import("three").Object3D, recursive?: boolean) => any) & ((object: import("three").Object3D, recursive?: boolean) => /*elided*/ any);
        count?: number | undefined;
        occlusionTest?: boolean | undefined;
        static?: boolean | undefined;
        addEventListener: (<T extends keyof import("three").Object3DEventMap>(type: T, listener: import("three").EventListener<import("three").Object3DEventMap[T], T, any>) => void) & (<T extends keyof import("three").Object3DEventMap>(type: T, listener: import("three").EventListener<import("three").Object3DEventMap[T], T, /*elided*/ any>) => void);
        hasEventListener: (<T extends keyof import("three").Object3DEventMap>(type: T, listener: import("three").EventListener<import("three").Object3DEventMap[T], T, any>) => boolean) & (<T extends keyof import("three").Object3DEventMap>(type: T, listener: import("three").EventListener<import("three").Object3DEventMap[T], T, /*elided*/ any>) => boolean);
        removeEventListener: (<T extends keyof import("three").Object3DEventMap>(type: T, listener: import("three").EventListener<import("three").Object3DEventMap[T], T, any>) => void) & (<T extends keyof import("three").Object3DEventMap>(type: T, listener: import("three").EventListener<import("three").Object3DEventMap[T], T, /*elided*/ any>) => void);
        dispatchEvent: (<T extends keyof import("three").Object3DEventMap>(event: import("three").BaseEvent<T> & import("three").Object3DEventMap[T]) => void) & (<T extends keyof import("three").Object3DEventMap>(event: import("three").BaseEvent<T> & import("three").Object3DEventMap[T]) => void);
        spherecast?(sphere: import("three").Sphere, intersects: Array<import("three").Intersection>): void;
        intersectChildren?: boolean;
        interactableDescendants?: Array<import("three").Object3D>;
        ancestorsHaveListeners?: boolean;
        defaultPointerEvents?: import("@pmndrs/uikit/dist/panel").PointerEventsProperties["pointerEvents"];
        pointerEvents?: "none" | "auto" | "listener";
        pointerEventsType?: import("@pmndrs/uikit/dist/panel").AllowedPointerEventsType;
        pointerEventsOrder?: number;
    };
} & typeof Svg;
/**
 * UIIcon
 * A reactive Material Symbol loader and renderer.
 * Automatically resolves `icon`, `iconStyle`, and `iconWeight` into structured CDN queries to fetch standard SVGs and mirrors them into `@pmndrs/uikit` Svg components.
 */
export declare class UIIcon extends UIIcon_base<SvgOutProperties> {
    name: string;
    private iconSignal;
    private iconWeightSignal;
    private iconStyleSignal;
    private iconFillSignal;
    /**
     * Constructs a new UIIcon.
     * Resolves static parameter states into reactive compute graph query paths dynamically on inputs.
     *
     * @param properties - Optional layout, sizing, and styling properties overriding defaults.
     * @param initialClasses - Optional styling class array identifiers for batch design applying rules.
     * @param config - Optional render contexts and template static defaults mappings.
     */
    constructor(icon: string | Signal<string | undefined>, properties?: UIIconProperties, initialClasses?: Array<InProperties<BaseOutProperties> | string>, config?: {
        renderContext?: RenderContext;
        defaultOverrides?: UIIconProperties;
        defaults?: WithSignal<UIIconOutProperties>;
    });
    /** Updates the Material Symbol string lookup (e.g., 'home'). */
    setIcon(icon: string): void;
    /** Updates font style ('outlined', 'rounded', 'sharp'). */
    setIconStyle(style: string): void;
    /** Updates weight (e.g., 100, 400, 700). */
    setIconWeight(weight: number | string): void;
    /** Updates fill state (0 or 1). */
    setIconFill(fill: number): void;
    /** Updates optional tint overlay color dynamically. */
    setColor(color: ColorRepresentation): void;
    /** Updates optional tint overlay color dynamically. */
    setOpacity(opacity: number): void;
    /**
     * Overridden updater pushing updates correctly into underlying Preact signals that structure query generators dynamically.
     */
    setProperties(props: UIIconProperties): void;
}
export {};
