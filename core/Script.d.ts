import * as THREE from 'three';
import type { Controller } from '../input/Controller';
import type { Physics } from '../physics/Physics';
import type { Constructor } from '../utils/Types';
import { UX } from '../ux/UX';
export interface SelectEvent {
    target: Controller;
}
export interface ObjectTouchEvent {
    handIndex: number;
    touchPosition: THREE.Vector3;
}
export interface ObjectGrabEvent {
    handIndex: number;
    hand: THREE.Object3D;
}
export interface KeyEvent {
    code: string;
}
/**
 * The Script class facilities development by providing useful life cycle
 * functions similar to MonoBehaviors in Unity.
 *
 * Each Script object is an independent THREE.Object3D entity within the
 * scene graph.
 *
 * See /docs/manual/Scripts.md for the full documentation.
 *
 * It manages user, objects, and interaction between user and objects.
 * See `/templates/0_basic/` for an example to start with.
 *
 *
 * If the class does not extends View, it can still bind the above three
 * function, where the engine ignores whether reticle exists.
 *
 * # Supported (native WebXR) functions to extend:
 *
 * onSelectStart(event)
 * onSelectEnd(event)
 *
 */
export declare function ScriptMixin<TBase extends Constructor<THREE.Object3D>>(base: TBase): {
    new (...args: any[]): {
        ux: UX;
        isXRScript: boolean;
        /**
         * Initializes an instance with XR controllers, grips, hands, raycaster, and
         * default options. We allow all scripts to quickly access its user (e.g.,
         * user.isSelecting(), user.hands), world (e.g., physical depth mesh,
         * lighting estimation, and recognized objects), and scene (the root of
         * three.js's scene graph). If this returns a promise, we will wait for it.
         */
        init(_?: object): void | Promise<void>;
        /**
         * Runs per frame.
         */
        update(_time?: number, _frame?: XRFrame): void;
        /**
         * Enables depth-aware interactions with physics. See /demos/ballpit
         */
        initPhysics(_physics: Physics): void | Promise<void>;
        physicsStep(): void;
        onXRSessionStarted(_session?: XRSession): void;
        onXRSessionEnded(): void;
        onSimulatorStarted(): void;
        /**
         * Called whenever pinch / mouse click starts, globally.
         * @param _event - event.target holds its controller
         */
        onSelectStart(_event: SelectEvent): void;
        /**
         * Called whenever pinch / mouse click discontinues, globally.
         * @param _event - event.target holds its controller
         */
        onSelectEnd(_event: SelectEvent): void;
        /**
         * Called whenever pinch / mouse click successfully completes, globally.
         * @param _event - event.target holds its controller.
         */
        onSelect(_event: SelectEvent): void;
        /**
         * Called whenever pinch / mouse click is happening, globally.
         */
        onSelecting(_event: SelectEvent): void;
        /**
         * Called on keyboard keypress.
         * @param _event - Event containing `.code` to read the keyboard key.
         */
        onKeyDown(_event: KeyEvent): void;
        onKeyUp(_event: KeyEvent): void;
        /**
         * Called whenever gamepad trigger starts, globally.
         * @param _event - event.target holds its controller.
         */
        onSqueezeStart(_event: SelectEvent): void;
        /**
         * Called whenever gamepad trigger stops, globally.
         * @param _event - event.target holds its controller.
         */
        onSqueezeEnd(_event: SelectEvent): void;
        /**
         * Called whenever gamepad is being triggered, globally.
         */
        onSqueezing(_event: SelectEvent): void;
        /**
         * Called whenever gamepad trigger successfully completes, globally.
         * @param _event - event.target holds its controller.
         */
        onSqueeze(_event: SelectEvent): void;
        /**
         * Called when the controller starts selecting this object the script
         * represents, e.g. View, ModelView.
         * @param _event - event.target holds its controller.
         * @returns Whether the event was handled
         */
        onObjectSelectStart(_event: SelectEvent): boolean;
        /**
         * Called when the controller stops selecting this object the script
         * represents, e.g. View, ModelView.
         * @param _event - event.target holds its controller.
         * @returns Whether the event was handled
         */
        onObjectSelectEnd(_event: SelectEvent): boolean;
        /**
         * Called when the controller starts hovering over this object with reticle.
         * @param _controller - An XR controller.
         */
        onHoverEnter(_controller: THREE.Object3D): void;
        /**
         * Called when the controller hovers over this object with reticle.
         * @param _controller - An XR controller.
         */
        onHoverExit(_controller: THREE.Object3D): void;
        /**
         * Called when the controller hovers over this object with reticle.
         * @param _controller - An XR controller.
         */
        onHovering(_controller: THREE.Object3D): void;
        /**
         * Called when a hand's index finger starts touching this object.
         */
        onObjectTouchStart(_event: ObjectTouchEvent): void;
        /**
         * Called every frame that a hand's index finger is touching this object.
         */
        onObjectTouching(_event: ObjectTouchEvent): void;
        /**
         * Called when a hand's index finger stops touching this object.
         */
        onObjectTouchEnd(_event: ObjectTouchEvent): void;
        /**
         * Called when a hand starts grabbing this object (touching + pinching).
         */
        onObjectGrabStart(_event: ObjectGrabEvent): void;
        /**
         * Called every frame a hand is grabbing this object.
         */
        onObjectGrabbing(_event: ObjectGrabEvent): void;
        /**
         * Called when a hand stops grabbing this object.
         */
        onObjectGrabEnd(_event: ObjectGrabEvent): void;
        /**
         * Called when the script is removed from the scene. Opposite of init.
         */
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
        onBeforeShadow(renderer: THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.Camera, shadowCamera: THREE.Camera, geometry: THREE.BufferGeometry, depthMaterial: THREE.Material, group: THREE.Group): void;
        onAfterShadow(renderer: THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.Camera, shadowCamera: THREE.Camera, geometry: THREE.BufferGeometry, depthMaterial: THREE.Material, group: THREE.Group): void;
        onBeforeRender(renderer: THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.Camera, geometry: THREE.BufferGeometry, material: THREE.Material, group: THREE.Group): void;
        onAfterRender(renderer: THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.Camera, geometry: THREE.BufferGeometry, material: THREE.Material, group: THREE.Group): void;
        applyMatrix4(matrix: THREE.Matrix4): void;
        applyQuaternion(quaternion: THREE.Quaternion): /*elided*/ any;
        setRotationFromAxisAngle(axis: THREE.Vector3, angle: number): void;
        setRotationFromEuler(euler: THREE.Euler): void;
        setRotationFromMatrix(m: THREE.Matrix4): void;
        setRotationFromQuaternion(q: THREE.Quaternion): void;
        rotateOnAxis(axis: THREE.Vector3, angle: number): /*elided*/ any;
        rotateOnWorldAxis(axis: THREE.Vector3, angle: number): /*elided*/ any;
        rotateX(angle: number): /*elided*/ any;
        rotateY(angle: number): /*elided*/ any;
        rotateZ(angle: number): /*elided*/ any;
        translateOnAxis(axis: THREE.Vector3, distance: number): /*elided*/ any;
        translateX(distance: number): /*elided*/ any;
        translateY(distance: number): /*elided*/ any;
        translateZ(distance: number): /*elided*/ any;
        localToWorld(vector: THREE.Vector3): THREE.Vector3;
        worldToLocal(vector: THREE.Vector3): THREE.Vector3;
        lookAt(vector: THREE.Vector3): void;
        lookAt(x: number, y: number, z: number): void;
        add(...object: THREE.Object3D[]): /*elided*/ any;
        remove(...object: THREE.Object3D[]): /*elided*/ any;
        removeFromParent(): /*elided*/ any;
        clear(): /*elided*/ any;
        attach(object: THREE.Object3D): /*elided*/ any;
        getObjectById(id: number): THREE.Object3D | undefined;
        getObjectByName(name: string): THREE.Object3D | undefined;
        getObjectByProperty(name: string, value: any): THREE.Object3D | undefined;
        getObjectsByProperty(name: string, value: any, optionalTarget?: THREE.Object3D[]): THREE.Object3D[];
        getWorldPosition(target: THREE.Vector3): THREE.Vector3;
        getWorldQuaternion(target: THREE.Quaternion): THREE.Quaternion;
        getWorldScale(target: THREE.Vector3): THREE.Vector3;
        getWorldDirection(target: THREE.Vector3): THREE.Vector3;
        raycast(raycaster: THREE.Raycaster, intersects: THREE.Intersection[]): void;
        traverse(callback: (object: THREE.Object3D) => any): void;
        traverseVisible(callback: (object: THREE.Object3D) => any): void;
        traverseAncestors(callback: (object: THREE.Object3D) => any): void;
        updateMatrix(): void;
        updateMatrixWorld(force?: boolean): void;
        updateWorldMatrix(updateParents: boolean, updateChildren: boolean): void;
        toJSON(meta?: THREE.JSONMeta): THREE.Object3DJSON;
        clone(recursive?: boolean): /*elided*/ any;
        copy(object: THREE.Object3D, recursive?: boolean): /*elided*/ any;
        count?: number | undefined;
        occlusionTest?: boolean | undefined;
        static?: boolean | undefined;
        addEventListener<T extends keyof THREE.Object3DEventMap>(type: T, listener: THREE.EventListener<THREE.Object3DEventMap[T], T, /*elided*/ any>): void;
        hasEventListener<T extends keyof THREE.Object3DEventMap>(type: T, listener: THREE.EventListener<THREE.Object3DEventMap[T], T, /*elided*/ any>): boolean;
        removeEventListener<T extends keyof THREE.Object3DEventMap>(type: T, listener: THREE.EventListener<THREE.Object3DEventMap[T], T, /*elided*/ any>): void;
        dispatchEvent<T extends keyof THREE.Object3DEventMap>(event: THREE.BaseEvent<T> & THREE.Object3DEventMap[T]): void;
    };
} & TBase;
/**
 * Script manages app logic or interaction between user and objects.
 */
declare const ScriptMixinObject3D: {
    new (...args: any[]): {
        ux: UX;
        isXRScript: boolean;
        /**
         * Initializes an instance with XR controllers, grips, hands, raycaster, and
         * default options. We allow all scripts to quickly access its user (e.g.,
         * user.isSelecting(), user.hands), world (e.g., physical depth mesh,
         * lighting estimation, and recognized objects), and scene (the root of
         * three.js's scene graph). If this returns a promise, we will wait for it.
         */
        init(_?: object): void | Promise<void>;
        /**
         * Runs per frame.
         */
        update(_time?: number, _frame?: XRFrame): void;
        /**
         * Enables depth-aware interactions with physics. See /demos/ballpit
         */
        initPhysics(_physics: Physics): void | Promise<void>;
        physicsStep(): void;
        onXRSessionStarted(_session?: XRSession): void;
        onXRSessionEnded(): void;
        onSimulatorStarted(): void;
        /**
         * Called whenever pinch / mouse click starts, globally.
         * @param _event - event.target holds its controller
         */
        onSelectStart(_event: SelectEvent): void;
        /**
         * Called whenever pinch / mouse click discontinues, globally.
         * @param _event - event.target holds its controller
         */
        onSelectEnd(_event: SelectEvent): void;
        /**
         * Called whenever pinch / mouse click successfully completes, globally.
         * @param _event - event.target holds its controller.
         */
        onSelect(_event: SelectEvent): void;
        /**
         * Called whenever pinch / mouse click is happening, globally.
         */
        onSelecting(_event: SelectEvent): void;
        /**
         * Called on keyboard keypress.
         * @param _event - Event containing `.code` to read the keyboard key.
         */
        onKeyDown(_event: KeyEvent): void;
        onKeyUp(_event: KeyEvent): void;
        /**
         * Called whenever gamepad trigger starts, globally.
         * @param _event - event.target holds its controller.
         */
        onSqueezeStart(_event: SelectEvent): void;
        /**
         * Called whenever gamepad trigger stops, globally.
         * @param _event - event.target holds its controller.
         */
        onSqueezeEnd(_event: SelectEvent): void;
        /**
         * Called whenever gamepad is being triggered, globally.
         */
        onSqueezing(_event: SelectEvent): void;
        /**
         * Called whenever gamepad trigger successfully completes, globally.
         * @param _event - event.target holds its controller.
         */
        onSqueeze(_event: SelectEvent): void;
        /**
         * Called when the controller starts selecting this object the script
         * represents, e.g. View, ModelView.
         * @param _event - event.target holds its controller.
         * @returns Whether the event was handled
         */
        onObjectSelectStart(_event: SelectEvent): boolean;
        /**
         * Called when the controller stops selecting this object the script
         * represents, e.g. View, ModelView.
         * @param _event - event.target holds its controller.
         * @returns Whether the event was handled
         */
        onObjectSelectEnd(_event: SelectEvent): boolean;
        /**
         * Called when the controller starts hovering over this object with reticle.
         * @param _controller - An XR controller.
         */
        onHoverEnter(_controller: THREE.Object3D): void;
        /**
         * Called when the controller hovers over this object with reticle.
         * @param _controller - An XR controller.
         */
        onHoverExit(_controller: THREE.Object3D): void;
        /**
         * Called when the controller hovers over this object with reticle.
         * @param _controller - An XR controller.
         */
        onHovering(_controller: THREE.Object3D): void;
        /**
         * Called when a hand's index finger starts touching this object.
         */
        onObjectTouchStart(_event: ObjectTouchEvent): void;
        /**
         * Called every frame that a hand's index finger is touching this object.
         */
        onObjectTouching(_event: ObjectTouchEvent): void;
        /**
         * Called when a hand's index finger stops touching this object.
         */
        onObjectTouchEnd(_event: ObjectTouchEvent): void;
        /**
         * Called when a hand starts grabbing this object (touching + pinching).
         */
        onObjectGrabStart(_event: ObjectGrabEvent): void;
        /**
         * Called every frame a hand is grabbing this object.
         */
        onObjectGrabbing(_event: ObjectGrabEvent): void;
        /**
         * Called when a hand stops grabbing this object.
         */
        onObjectGrabEnd(_event: ObjectGrabEvent): void;
        /**
         * Called when the script is removed from the scene. Opposite of init.
         */
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
        onBeforeShadow(renderer: THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.Camera, shadowCamera: THREE.Camera, geometry: THREE.BufferGeometry, depthMaterial: THREE.Material, group: THREE.Group): void;
        onAfterShadow(renderer: THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.Camera, shadowCamera: THREE.Camera, geometry: THREE.BufferGeometry, depthMaterial: THREE.Material, group: THREE.Group): void;
        onBeforeRender(renderer: THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.Camera, geometry: THREE.BufferGeometry, material: THREE.Material, group: THREE.Group): void;
        onAfterRender(renderer: THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.Camera, geometry: THREE.BufferGeometry, material: THREE.Material, group: THREE.Group): void;
        applyMatrix4(matrix: THREE.Matrix4): void;
        applyQuaternion(quaternion: THREE.Quaternion): /*elided*/ any;
        setRotationFromAxisAngle(axis: THREE.Vector3, angle: number): void;
        setRotationFromEuler(euler: THREE.Euler): void;
        setRotationFromMatrix(m: THREE.Matrix4): void;
        setRotationFromQuaternion(q: THREE.Quaternion): void;
        rotateOnAxis(axis: THREE.Vector3, angle: number): /*elided*/ any;
        rotateOnWorldAxis(axis: THREE.Vector3, angle: number): /*elided*/ any;
        rotateX(angle: number): /*elided*/ any;
        rotateY(angle: number): /*elided*/ any;
        rotateZ(angle: number): /*elided*/ any;
        translateOnAxis(axis: THREE.Vector3, distance: number): /*elided*/ any;
        translateX(distance: number): /*elided*/ any;
        translateY(distance: number): /*elided*/ any;
        translateZ(distance: number): /*elided*/ any;
        localToWorld(vector: THREE.Vector3): THREE.Vector3;
        worldToLocal(vector: THREE.Vector3): THREE.Vector3;
        lookAt(vector: THREE.Vector3): void;
        lookAt(x: number, y: number, z: number): void;
        add(...object: THREE.Object3D[]): /*elided*/ any;
        remove(...object: THREE.Object3D[]): /*elided*/ any;
        removeFromParent(): /*elided*/ any;
        clear(): /*elided*/ any;
        attach(object: THREE.Object3D): /*elided*/ any;
        getObjectById(id: number): THREE.Object3D | undefined;
        getObjectByName(name: string): THREE.Object3D | undefined;
        getObjectByProperty(name: string, value: any): THREE.Object3D | undefined;
        getObjectsByProperty(name: string, value: any, optionalTarget?: THREE.Object3D[]): THREE.Object3D[];
        getWorldPosition(target: THREE.Vector3): THREE.Vector3;
        getWorldQuaternion(target: THREE.Quaternion): THREE.Quaternion;
        getWorldScale(target: THREE.Vector3): THREE.Vector3;
        getWorldDirection(target: THREE.Vector3): THREE.Vector3;
        raycast(raycaster: THREE.Raycaster, intersects: THREE.Intersection[]): void;
        traverse(callback: (object: THREE.Object3D) => any): void;
        traverseVisible(callback: (object: THREE.Object3D) => any): void;
        traverseAncestors(callback: (object: THREE.Object3D) => any): void;
        updateMatrix(): void;
        updateMatrixWorld(force?: boolean): void;
        updateWorldMatrix(updateParents: boolean, updateChildren: boolean): void;
        toJSON(meta?: THREE.JSONMeta): THREE.Object3DJSON;
        clone(recursive?: boolean): /*elided*/ any;
        copy(object: THREE.Object3D, recursive?: boolean): /*elided*/ any;
        count?: number | undefined;
        occlusionTest?: boolean | undefined;
        static?: boolean | undefined;
        addEventListener<T extends keyof THREE.Object3DEventMap>(type: T, listener: THREE.EventListener<THREE.Object3DEventMap[T], T, /*elided*/ any>): void;
        hasEventListener<T extends keyof THREE.Object3DEventMap>(type: T, listener: THREE.EventListener<THREE.Object3DEventMap[T], T, /*elided*/ any>): boolean;
        removeEventListener<T extends keyof THREE.Object3DEventMap>(type: T, listener: THREE.EventListener<THREE.Object3DEventMap[T], T, /*elided*/ any>): void;
        dispatchEvent<T extends keyof THREE.Object3DEventMap>(event: THREE.BaseEvent<T> & THREE.Object3DEventMap[T]): void;
    };
} & typeof THREE.Object3D;
export declare class Script<TEventMap extends THREE.Object3DEventMap = THREE.Object3DEventMap> extends ScriptMixinObject3D<TEventMap> {
}
/**
 * MeshScript can be constructed with geometry and materials, with
 * `super(geometry, material)`; for direct access to its geometry.
 * MeshScripts hold a UX object that contains its interaction information such
 * as which controller is selecting or touching this object, as well as the
 * exact selected UV / xyz of the reticle, or touched point.
 */
declare const ScriptMixinMeshScript: {
    new (...args: any[]): {
        ux: UX;
        isXRScript: boolean;
        /**
         * Initializes an instance with XR controllers, grips, hands, raycaster, and
         * default options. We allow all scripts to quickly access its user (e.g.,
         * user.isSelecting(), user.hands), world (e.g., physical depth mesh,
         * lighting estimation, and recognized objects), and scene (the root of
         * three.js's scene graph). If this returns a promise, we will wait for it.
         */
        init(_?: object): void | Promise<void>;
        /**
         * Runs per frame.
         */
        update(_time?: number, _frame?: XRFrame): void;
        /**
         * Enables depth-aware interactions with physics. See /demos/ballpit
         */
        initPhysics(_physics: Physics): void | Promise<void>;
        physicsStep(): void;
        onXRSessionStarted(_session?: XRSession): void;
        onXRSessionEnded(): void;
        onSimulatorStarted(): void;
        /**
         * Called whenever pinch / mouse click starts, globally.
         * @param _event - event.target holds its controller
         */
        onSelectStart(_event: SelectEvent): void;
        /**
         * Called whenever pinch / mouse click discontinues, globally.
         * @param _event - event.target holds its controller
         */
        onSelectEnd(_event: SelectEvent): void;
        /**
         * Called whenever pinch / mouse click successfully completes, globally.
         * @param _event - event.target holds its controller.
         */
        onSelect(_event: SelectEvent): void;
        /**
         * Called whenever pinch / mouse click is happening, globally.
         */
        onSelecting(_event: SelectEvent): void;
        /**
         * Called on keyboard keypress.
         * @param _event - Event containing `.code` to read the keyboard key.
         */
        onKeyDown(_event: KeyEvent): void;
        onKeyUp(_event: KeyEvent): void;
        /**
         * Called whenever gamepad trigger starts, globally.
         * @param _event - event.target holds its controller.
         */
        onSqueezeStart(_event: SelectEvent): void;
        /**
         * Called whenever gamepad trigger stops, globally.
         * @param _event - event.target holds its controller.
         */
        onSqueezeEnd(_event: SelectEvent): void;
        /**
         * Called whenever gamepad is being triggered, globally.
         */
        onSqueezing(_event: SelectEvent): void;
        /**
         * Called whenever gamepad trigger successfully completes, globally.
         * @param _event - event.target holds its controller.
         */
        onSqueeze(_event: SelectEvent): void;
        /**
         * Called when the controller starts selecting this object the script
         * represents, e.g. View, ModelView.
         * @param _event - event.target holds its controller.
         * @returns Whether the event was handled
         */
        onObjectSelectStart(_event: SelectEvent): boolean;
        /**
         * Called when the controller stops selecting this object the script
         * represents, e.g. View, ModelView.
         * @param _event - event.target holds its controller.
         * @returns Whether the event was handled
         */
        onObjectSelectEnd(_event: SelectEvent): boolean;
        /**
         * Called when the controller starts hovering over this object with reticle.
         * @param _controller - An XR controller.
         */
        onHoverEnter(_controller: THREE.Object3D): void;
        /**
         * Called when the controller hovers over this object with reticle.
         * @param _controller - An XR controller.
         */
        onHoverExit(_controller: THREE.Object3D): void;
        /**
         * Called when the controller hovers over this object with reticle.
         * @param _controller - An XR controller.
         */
        onHovering(_controller: THREE.Object3D): void;
        /**
         * Called when a hand's index finger starts touching this object.
         */
        onObjectTouchStart(_event: ObjectTouchEvent): void;
        /**
         * Called every frame that a hand's index finger is touching this object.
         */
        onObjectTouching(_event: ObjectTouchEvent): void;
        /**
         * Called when a hand's index finger stops touching this object.
         */
        onObjectTouchEnd(_event: ObjectTouchEvent): void;
        /**
         * Called when a hand starts grabbing this object (touching + pinching).
         */
        onObjectGrabStart(_event: ObjectGrabEvent): void;
        /**
         * Called every frame a hand is grabbing this object.
         */
        onObjectGrabbing(_event: ObjectGrabEvent): void;
        /**
         * Called when a hand stops grabbing this object.
         */
        onObjectGrabEnd(_event: ObjectGrabEvent): void;
        /**
         * Called when the script is removed from the scene. Opposite of init.
         */
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
        onBeforeShadow(renderer: THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.Camera, shadowCamera: THREE.Camera, geometry: THREE.BufferGeometry, depthMaterial: THREE.Material, group: THREE.Group): void;
        onAfterShadow(renderer: THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.Camera, shadowCamera: THREE.Camera, geometry: THREE.BufferGeometry, depthMaterial: THREE.Material, group: THREE.Group): void;
        onBeforeRender(renderer: THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.Camera, geometry: THREE.BufferGeometry, material: THREE.Material, group: THREE.Group): void;
        onAfterRender(renderer: THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.Camera, geometry: THREE.BufferGeometry, material: THREE.Material, group: THREE.Group): void;
        applyMatrix4(matrix: THREE.Matrix4): void;
        applyQuaternion(quaternion: THREE.Quaternion): /*elided*/ any;
        setRotationFromAxisAngle(axis: THREE.Vector3, angle: number): void;
        setRotationFromEuler(euler: THREE.Euler): void;
        setRotationFromMatrix(m: THREE.Matrix4): void;
        setRotationFromQuaternion(q: THREE.Quaternion): void;
        rotateOnAxis(axis: THREE.Vector3, angle: number): /*elided*/ any;
        rotateOnWorldAxis(axis: THREE.Vector3, angle: number): /*elided*/ any;
        rotateX(angle: number): /*elided*/ any;
        rotateY(angle: number): /*elided*/ any;
        rotateZ(angle: number): /*elided*/ any;
        translateOnAxis(axis: THREE.Vector3, distance: number): /*elided*/ any;
        translateX(distance: number): /*elided*/ any;
        translateY(distance: number): /*elided*/ any;
        translateZ(distance: number): /*elided*/ any;
        localToWorld(vector: THREE.Vector3): THREE.Vector3;
        worldToLocal(vector: THREE.Vector3): THREE.Vector3;
        lookAt(vector: THREE.Vector3): void;
        lookAt(x: number, y: number, z: number): void;
        add(...object: THREE.Object3D[]): /*elided*/ any;
        remove(...object: THREE.Object3D[]): /*elided*/ any;
        removeFromParent(): /*elided*/ any;
        clear(): /*elided*/ any;
        attach(object: THREE.Object3D): /*elided*/ any;
        getObjectById(id: number): THREE.Object3D | undefined;
        getObjectByName(name: string): THREE.Object3D | undefined;
        getObjectByProperty(name: string, value: any): THREE.Object3D | undefined;
        getObjectsByProperty(name: string, value: any, optionalTarget?: THREE.Object3D[]): THREE.Object3D[];
        getWorldPosition(target: THREE.Vector3): THREE.Vector3;
        getWorldQuaternion(target: THREE.Quaternion): THREE.Quaternion;
        getWorldScale(target: THREE.Vector3): THREE.Vector3;
        getWorldDirection(target: THREE.Vector3): THREE.Vector3;
        raycast(raycaster: THREE.Raycaster, intersects: THREE.Intersection[]): void;
        traverse(callback: (object: THREE.Object3D) => any): void;
        traverseVisible(callback: (object: THREE.Object3D) => any): void;
        traverseAncestors(callback: (object: THREE.Object3D) => any): void;
        updateMatrix(): void;
        updateMatrixWorld(force?: boolean): void;
        updateWorldMatrix(updateParents: boolean, updateChildren: boolean): void;
        toJSON(meta?: THREE.JSONMeta): THREE.Object3DJSON;
        clone(recursive?: boolean): /*elided*/ any;
        copy(object: THREE.Object3D, recursive?: boolean): /*elided*/ any;
        count?: number | undefined;
        occlusionTest?: boolean | undefined;
        static?: boolean | undefined;
        addEventListener<T extends keyof THREE.Object3DEventMap>(type: T, listener: THREE.EventListener<THREE.Object3DEventMap[T], T, /*elided*/ any>): void;
        hasEventListener<T extends keyof THREE.Object3DEventMap>(type: T, listener: THREE.EventListener<THREE.Object3DEventMap[T], T, /*elided*/ any>): boolean;
        removeEventListener<T extends keyof THREE.Object3DEventMap>(type: T, listener: THREE.EventListener<THREE.Object3DEventMap[T], T, /*elided*/ any>): void;
        dispatchEvent<T extends keyof THREE.Object3DEventMap>(event: THREE.BaseEvent<T> & THREE.Object3DEventMap[T]): void;
    };
} & typeof THREE.Mesh;
export declare class MeshScript<TGeometry extends THREE.BufferGeometry = THREE.BufferGeometry, TMaterial extends THREE.Material | THREE.Material[] = THREE.Material | THREE.Material[], TEventMap extends THREE.Object3DEventMap = THREE.Object3DEventMap> extends ScriptMixinMeshScript<TGeometry, TMaterial, TEventMap> {
    /**
     * {@inheritDoc}
     */
    constructor(geometry?: TGeometry, material?: TMaterial);
}
export {};
