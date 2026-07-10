/**
 * Copyright 2025 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 *
 * @file xrblocks.js
 * @version v0.17.0
 * @commitid 0c463b3
 * @builddate 2026-07-10T18:08:45.270Z
 * @description XR Blocks SDK, built from source with the above commit ID.
 * @agent When using with Gemini to create XR apps, use **Gemini Canvas** mode,
 * and follow rules below:
 * 1. Include the following importmap for maximum compatibility:
    "three": "https://cdn.jsdelivr.net/npm/three@0.184.0/build/three.module.js",
    "three/addons/": "https://cdn.jsdelivr.net/npm/three@0.184.0/examples/jsm/",
    "troika-three-text": "https://cdn.jsdelivr.net/gh/protectwise/troika@028b81cf308f0f22e5aa8e78196be56ec1997af5/packages/troika-three-text/src/index.js",
    "troika-three-utils": "https://cdn.jsdelivr.net/gh/protectwise/troika@v0.52.4/packages/troika-three-utils/src/index.js",
    "troika-worker-utils": "https://cdn.jsdelivr.net/gh/protectwise/troika@v0.52.4/packages/troika-worker-utils/src/index.js",
    "bidi-js": "https://esm.sh/bidi-js@%5E1.0.2?target=es2022",
    "webgl-sdf-generator": "https://esm.sh/webgl-sdf-generator@1.1.1/es2022/webgl-sdf-generator.mjs",
    "lit": "https://cdn.jsdelivr.net/gh/lit/dist@3/core/lit-core.min.js",
    "lit/": "https://esm.run/lit@3/",
    "three-pathfinding": "https://cdn.jsdelivr.net/npm/three-pathfinding@1.3.0/dist/three-pathfinding.module.js",
    2. If the app focus on standalone objects, spawn it in front of the user in
    WebXR and rescale to reasonable physical size. Wrap them with xb.ModelViewer
    and make sure users can drag the platform to move it around in XR.
    3. When rendering a large scene, remember users may navigate the scene in a
    physical world space, also add locomotion methods like pinch to teleport.
    4. Do not halluciate mode files --- use either public high-quality assets,
    or generate from primitive shapes of use vox formats for voxels or
    lego-styles.
 */
import * as GoogleGenAITypes from '@google/genai';
import * as THREE from 'three';
import { RenderItem } from 'three';
import RAPIER_NS from 'rapier3d';
import OpenAIType from 'openai';
import { Pass, FullScreenQuad } from 'three/addons/postprocessing/Pass.js';
import { TemplateResult } from 'lit';
import { GLTFLoader, GLTF } from 'three/addons/loaders/GLTFLoader.js';
import TroikaThreeText from 'troika-three-text';
import * as _sparkjsdev_spark from '@sparkjsdev/spark';
import { SplatMesh, SparkRenderer } from '@sparkjsdev/spark';

/**
 * A 3D visual marker used to indicate a user's aim or interaction
 * point in an XR scene. It orients itself to surfaces it intersects with and
 * provides visual feedback for states like "pressed".
 */
declare class Reticle extends THREE.Mesh<THREE.BufferGeometry, THREE.ShaderMaterial> {
    /** Text description of the PanelMesh */
    name: string;
    editorIcon: string;
    /** Prevents the reticle itself from being a target for raycasting. */
    ignoreReticleRaycast: boolean;
    /** The world-space direction vector of the ray that hit the target. */
    direction: THREE.Vector3;
    /** Ensures the reticle is drawn on top of other transparent objects. */
    renderOrder: number;
    /** The smoothing factor for rotational slerp interpolation. */
    rotationSmoothing: number;
    /** The z-offset to prevent visual artifacts (z-fighting). */
    offset: number;
    /** The most recent intersection data that positioned this reticle. */
    intersection?: THREE.Intersection;
    /** Object on which the reticle is hovering. */
    targetObject?: THREE.Object3D;
    private readonly originalNormal;
    private readonly newRotation;
    private readonly objectRotation;
    private readonly normalVector;
    /**
     * Creates an instance of Reticle.
     * @param rotationSmoothing - A factor between 0.0 (no smoothing) and
     * 1.0 (no movement) to smoothly animate orientation changes.
     * @param offset - A small z-axis offset to prevent z-fighting.
     * @param size - The radius of the reticle's circle geometry.
     * @param depthTest - Determines if the reticle should be occluded by other
     * objects. Defaults to `false` to ensure it is always visible.
     */
    constructor(rotationSmoothing?: number, offset?: number, size?: number, depthTest?: boolean);
    /**
     * Orients the reticle to be flush with a surface, based on the surface
     * normal. It smoothly interpolates the rotation for a polished visual effect.
     * @param normal - The world-space normal of the surface.
     */
    setRotationFromNormalVector(normal: THREE.Vector3): void;
    /**
     * Updates the reticle's complete pose (position and rotation) from a
     * raycaster intersection object.
     * @param intersection - The intersection data from a raycast.
     */
    setPoseFromIntersection(intersection: THREE.Intersection): void;
    /**
     * Sets the color of the reticle via its shader uniform.
     * @param color - The color to apply.
     */
    setColor(color: THREE.Color | number | string): void;
    /**
     * Gets the current color of the reticle.
     * @returns The current color from the shader uniform.
     */
    getColor(): THREE.Color;
    /**
     * Sets the visual state of the reticle to "pressed" or "unpressed".
     * This provides visual feedback to the user during interaction.
     * @param pressed - True to show the pressed state, false otherwise.
     */
    setPressed(pressed: boolean): void;
    /**
     * Sets the pressed state as a continuous value for smooth animations.
     * @param pressedAmount - A value from 0.0 (unpressed) to 1.0 (fully
     * pressed).
     */
    setPressedAmount(pressedAmount: number): void;
    /**
     * Overrides the default raycast method to make the reticle ignored by
     * raycasters.
     */
    raycast(): void;
}

interface ControllerEventMap extends THREE.Object3DEventMap {
    connected: {
        target: Controller;
        data?: XRInputSource;
    };
    disconnected: {
        target: Controller;
        data?: XRInputSource;
    };
    select: {
        target: Controller;
        data?: XRInputSource;
    };
    selectstart: {
        target: Controller;
        data?: XRInputSource;
    };
    selectend: {
        target: Controller;
        data?: XRInputSource;
    };
    squeeze: {
        target: Controller;
        data?: XRInputSource;
    };
    squeezestart: {
        target: Controller;
        data?: XRInputSource;
    };
    squeezeend: {
        target: Controller;
        data?: XRInputSource;
    };
}
interface Controller extends THREE.Object3D<ControllerEventMap> {
    reticle?: Reticle;
    gamepad?: Gamepad;
    inputSource?: Partial<XRInputSource>;
    updatePose?(): void;
}
interface ControllerEvent {
    type: keyof ControllerEventMap;
    target: Controller;
    data?: Partial<XRInputSource>;
}

type RAPIERCompat = typeof RAPIER_NS & {
    init?: () => Promise<void>;
};
declare class PhysicsOptions {
    /**
     * The target frames per second for the physics simulation loop.
     */
    fps: number;
    /**
     * The global gravity vector applied to the physics world.
     */
    gravity: {
        x: number;
        y: number;
        z: number;
    };
    /**
     * If true, the `Physics` manager will automatically call `world.step()`
     * on its fixed interval. Set to false if you want to control the
     * simulation step manually.
     */
    worldStep: boolean;
    /**
     * If true, an event queue will be created and passed to `world.step()`,
     * enabling the handling of collision and contact events.
     */
    useEventQueue: boolean;
    /**
     * Instance of RAPIER.
     */
    RAPIER?: RAPIERCompat;
}

/**
 * Integrates the RAPIER physics engine into the XRCore lifecycle.
 * It sets up the physics in a blended world that combines virtual and physical
 * objects, steps the simulation forward in sync with the application's
 * framerate, and manages the lifecycle of physics-related objects.
 */
declare class Physics {
    initialized: boolean;
    options?: PhysicsOptions;
    RAPIER: RAPIERCompat;
    fps: number;
    blendedWorld: RAPIER_NS.World;
    eventQueue: RAPIER_NS.EventQueue;
    get timestep(): number;
    /**
     * Asynchronously initializes the RAPIER physics engine and creates the
     * blendedWorld. This is called in Core before the physics simulation starts.
     */
    init({ physicsOptions }: {
        physicsOptions: PhysicsOptions;
    }): Promise<void>;
    /**
     * Advances the physics simulation by one step.
     */
    physicsStep(): void;
    /**
     * Frees the memory allocated by the RAPIER physics blendedWorld and event
     * queue. This is crucial for preventing memory leaks when the XR session
     * ends.
     */
    dispose(): void;
}

/**
 * Misc collection of types not specific to any XR Blocks module.
 */
type Constructor<T = object> = new (...args: any[]) => T;
type ShaderUniforms = {
    [uniform: string]: THREE.IUniform;
};
/**
 * Defines the structure for a shader object compatible with PanelMesh,
 * requiring uniforms, a vertex shader, and a fragment shader.
 */
interface Shader {
    uniforms: ShaderUniforms;
    vertexShader: string;
    fragmentShader: string;
    defines?: {
        [key: string]: unknown;
    };
}
/**
 * A recursive readonly type.
 */
type DeepReadonly<T> = T extends (...args: any[]) => any ? T : T extends object ? {
    readonly [P in keyof T]: DeepReadonly<T[P]>;
} : T;
/**
 * A recursive partial type.
 */
type DeepPartial<T> = T extends (...args: any[]) => any ? T : T extends object ? {
    [P in keyof T]?: DeepPartial<T[P]>;
} : T;

/**
 * UX manages the user experience (UX) state for an interactive object in
 * the scene. It tracks interaction states like hover,
 * selection, and dragging for multiple controllers.
 */
declare class UX {
    /**
     * The object this UX state manager is attached to.
     */
    parent: THREE.Object3D<THREE.Object3DEventMap>;
    /**
     * Indicates if the parent object can be dragged.
     */
    draggable: boolean;
    /**
     * Indicates if the parent object can be selected.
     */
    selectable: boolean;
    /**
     * Indicates if the parent object can be touched.
     */
    touchable: boolean;
    /**
     * An array tracking the selection state for each controller.
     * `selected[i]` is true if controller `i` is selecting the object.
     */
    selected: boolean[];
    /**
     * An array tracking the hover state for each controller.
     * `hovered[i]` is true if controller `i` is hovering over the object.
     */
    hovered: boolean[];
    /**
     * An array tracking the touch state for each controller.
     * `touched[i]` is true if controller `i` is touching over the object.
     */
    touched: boolean[];
    /**
     * An array tracking the drag state for each controller.
     */
    activeDragged: boolean[];
    /**
     * An array storing the 3D position of the last intersection for each
     * controller.
     */
    positions: THREE.Vector3[];
    /**
     * An array storing the distance of the last intersection for each controller.
     */
    distances: number[];
    /**
     * An array storing the UV coordinates of the last intersection for each
     * controller.
     */
    uvs: THREE.Vector2[];
    /**
     * The initial position of the object when a drag operation begins.
     */
    initialPosition: THREE.Vector3;
    /**
     * The initial distance from the controller to the object at the start of a
     * drag for computing the relative dragging distances and angles.
     */
    initialDistance?: number;
    /**
     * @param parent - The script or object that owns this UX instance.
     */
    constructor(parent: THREE.Object3D);
    /**
     * Checks if the object is currently being hovered by any controller.
     */
    isHovered(): boolean;
    /**
     * Checks if the object is currently being selected by any controller.
     */
    isSelected(): boolean;
    /**
     * Checks if the object is currently being dragged by any controller.
     */
    isDragging(): boolean;
    /**
     * Updates the interaction state for a specific controller based on a new
     * intersection. This is internally called by the core input system when a
     * raycast hits the parent object.
     * @param controller - The controller performing the
     *     interaction.
     * @param intersection - The raycast intersection data.
     */
    update(controller: THREE.Object3D, intersection: THREE.Intersection): void;
    /**
     * Ensures that the internal arrays for tracking states are large enough to
     * accommodate a given controller ID.
     * @param id - The controller ID to ensure exists.
     */
    initializeVariablesForId(id: number): void;
    /**
     * Checks if the intersection object belongs to this UX's attached Script.
     * Allow overriding this function for more complex objects with multiple
     * meshes.
     * @param intersection - The raycast intersection to check.
     * @returns True if the intersection is relevant to this UX's parent object.
     */
    isRelevantIntersection(intersection: THREE.Intersection): boolean;
    /**
     * Resets the hover and selection states for all controllers. This is
     * typically called at the beginning of each frame.
     */
    reset(): void;
    /**
     * Gets the IDs of up to two controllers that are currently hovering over the
     * parent object, always returning a two-element array. This is useful for
     * shaders or components like Panels that expect a fixed number of interaction
     * points.
     *
     * @returns A fixed-size two-element array. Each element is either a
     *     controller ID (e.g., 0, 1) or null.
     */
    getPrimaryTwoControllerIds(): number[];
}

interface SelectEvent {
    target: Controller;
}
interface ObjectTouchEvent {
    handIndex: number;
    touchPosition: THREE.Vector3;
}
interface ObjectGrabEvent {
    handIndex: number;
    hand: THREE.Object3D;
}
interface KeyEvent {
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
declare function ScriptMixin<TBase extends Constructor<THREE.Object3D>>(base: TBase): {
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
         * @returns Whether the event was handled. If true, the event will not bubble up.
         */
        onObjectSelectStart(_event: SelectEvent): boolean | void;
        /**
         * Called when the controller stops selecting this object the script
         * represents, e.g. View, ModelView.
         * @param _event - event.target holds its controller.
         * @returns Whether the event was handled. If true, the event will not bubble up.
         */
        onObjectSelectEnd(_event: SelectEvent): boolean | void;
        /**
         * Called when the controller starts hovering over this object with reticle.
         * @param _controller - An XR controller.
         * @returns Whether the event was handled. If true, the event will not bubble up.
         */
        onHoverEnter(_controller: THREE.Object3D): boolean | void;
        /**
         * Called when the controller hovers over this object with reticle.
         * @param _controller - An XR controller.
         * @returns Whether the event was handled. If true, the event will not bubble up.
         */
        onHoverExit(_controller: THREE.Object3D): boolean | void;
        /**
         * Called when the controller hovers over this object with reticle.
         * @param _controller - An XR controller.
         * @returns Whether the event was handled. If true, the event will not bubble up.
         */
        onHovering(_controller: THREE.Object3D): boolean | void;
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
        customDepthMaterial?: THREE.Material | undefined;
        customDistanceMaterial?: THREE.Material | undefined;
        static: boolean;
        userData: Record<string, any>;
        pivot: THREE.Vector3 | null;
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
         * @returns Whether the event was handled. If true, the event will not bubble up.
         */
        onObjectSelectStart(_event: SelectEvent): boolean | void;
        /**
         * Called when the controller stops selecting this object the script
         * represents, e.g. View, ModelView.
         * @param _event - event.target holds its controller.
         * @returns Whether the event was handled. If true, the event will not bubble up.
         */
        onObjectSelectEnd(_event: SelectEvent): boolean | void;
        /**
         * Called when the controller starts hovering over this object with reticle.
         * @param _controller - An XR controller.
         * @returns Whether the event was handled. If true, the event will not bubble up.
         */
        onHoverEnter(_controller: THREE.Object3D): boolean | void;
        /**
         * Called when the controller hovers over this object with reticle.
         * @param _controller - An XR controller.
         * @returns Whether the event was handled. If true, the event will not bubble up.
         */
        onHoverExit(_controller: THREE.Object3D): boolean | void;
        /**
         * Called when the controller hovers over this object with reticle.
         * @param _controller - An XR controller.
         * @returns Whether the event was handled. If true, the event will not bubble up.
         */
        onHovering(_controller: THREE.Object3D): boolean | void;
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
        customDepthMaterial?: THREE.Material | undefined;
        customDistanceMaterial?: THREE.Material | undefined;
        static: boolean;
        userData: Record<string, any>;
        pivot: THREE.Vector3 | null;
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
        addEventListener<T extends keyof THREE.Object3DEventMap>(type: T, listener: THREE.EventListener<THREE.Object3DEventMap[T], T, /*elided*/ any>): void;
        hasEventListener<T extends keyof THREE.Object3DEventMap>(type: T, listener: THREE.EventListener<THREE.Object3DEventMap[T], T, /*elided*/ any>): boolean;
        removeEventListener<T extends keyof THREE.Object3DEventMap>(type: T, listener: THREE.EventListener<THREE.Object3DEventMap[T], T, /*elided*/ any>): void;
        dispatchEvent<T extends keyof THREE.Object3DEventMap>(event: THREE.BaseEvent<T> & THREE.Object3DEventMap[T]): void;
    };
} & typeof THREE.Object3D;
declare class Script<TEventMap extends THREE.Object3DEventMap = THREE.Object3DEventMap> extends ScriptMixinObject3D<TEventMap> {
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
         * @returns Whether the event was handled. If true, the event will not bubble up.
         */
        onObjectSelectStart(_event: SelectEvent): boolean | void;
        /**
         * Called when the controller stops selecting this object the script
         * represents, e.g. View, ModelView.
         * @param _event - event.target holds its controller.
         * @returns Whether the event was handled. If true, the event will not bubble up.
         */
        onObjectSelectEnd(_event: SelectEvent): boolean | void;
        /**
         * Called when the controller starts hovering over this object with reticle.
         * @param _controller - An XR controller.
         * @returns Whether the event was handled. If true, the event will not bubble up.
         */
        onHoverEnter(_controller: THREE.Object3D): boolean | void;
        /**
         * Called when the controller hovers over this object with reticle.
         * @param _controller - An XR controller.
         * @returns Whether the event was handled. If true, the event will not bubble up.
         */
        onHoverExit(_controller: THREE.Object3D): boolean | void;
        /**
         * Called when the controller hovers over this object with reticle.
         * @param _controller - An XR controller.
         * @returns Whether the event was handled. If true, the event will not bubble up.
         */
        onHovering(_controller: THREE.Object3D): boolean | void;
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
        customDepthMaterial?: THREE.Material | undefined;
        customDistanceMaterial?: THREE.Material | undefined;
        static: boolean;
        userData: Record<string, any>;
        pivot: THREE.Vector3 | null;
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
        addEventListener<T extends keyof THREE.Object3DEventMap>(type: T, listener: THREE.EventListener<THREE.Object3DEventMap[T], T, /*elided*/ any>): void;
        hasEventListener<T extends keyof THREE.Object3DEventMap>(type: T, listener: THREE.EventListener<THREE.Object3DEventMap[T], T, /*elided*/ any>): boolean;
        removeEventListener<T extends keyof THREE.Object3DEventMap>(type: T, listener: THREE.EventListener<THREE.Object3DEventMap[T], T, /*elided*/ any>): void;
        dispatchEvent<T extends keyof THREE.Object3DEventMap>(event: THREE.BaseEvent<T> & THREE.Object3DEventMap[T]): void;
    };
} & typeof THREE.Mesh;
declare class MeshScript<TGeometry extends THREE.BufferGeometry = THREE.BufferGeometry, TMaterial extends THREE.Material | THREE.Material[] = THREE.Material | THREE.Material[], TEventMap extends THREE.Object3DEventMap = THREE.Object3DEventMap> extends ScriptMixinMeshScript<TGeometry, TMaterial, TEventMap> {
    /**
     * {@inheritDoc}
     */
    constructor(geometry?: TGeometry, material?: TMaterial);
}

declare const GEMINI_DEFAULT_FLASH_MODEL = "gemini-3.5-flash";
declare const GEMINI_DEFAULT_LIVE_MODEL = "gemini-3.1-flash-live-preview";
declare const GEMINI_DEFAULT_IMAGE_MODEL = "gemini-3.1-flash-image-preview";
declare class GeminiOptions {
    apiKey: string;
    urlParam: string;
    keyValid: boolean;
    enabled: boolean;
    model: string;
    liveModel: string;
    config: GoogleGenAITypes.GenerateContentConfig;
}
declare class OpenAIOptions {
    apiKey: string;
    urlParam: string;
    model: string;
    enabled: boolean;
}
type AIModel = 'gemini' | 'openai';
declare class AIOptions {
    enabled: boolean;
    model: AIModel;
    gemini: GeminiOptions;
    openai: OpenAIOptions;
    globalUrlParams: {
        key: string;
    };
}

interface ToolCall {
    name: string;
    args: unknown;
}
/**
 * Standardized result type for tool execution.
 * @typeParam T - The type of data returned on success.
 */
interface ToolResult<T = unknown> {
    /** Whether the tool execution succeeded */
    success: boolean;
    /** The result data if successful */
    data?: T;
    /** Error message if execution failed */
    error?: string;
    /** Additional metadata about the execution */
    metadata?: Record<string, unknown>;
}
type ToolSchema = Omit<GoogleGenAITypes.Schema, 'type' | 'properties' | 'items'> & {
    properties?: Record<string, ToolSchema>;
    items?: ToolSchema;
    type?: keyof typeof GoogleGenAITypes.Type;
};
type ToolOptions = {
    /** The name of the tool. */
    name: string;
    /** A description of what the tool does. */
    description: string;
    /** The parameters of the tool */
    parameters?: ToolSchema;
    /** A callback to execute when the tool is triggered */
    onTriggered?: (args: unknown) => unknown | Promise<unknown>;
    behavior?: 'BLOCKING' | 'NON_BLOCKING' | GoogleGenAITypes.Behavior;
};
/**
 * A base class for tools that the agent can use.
 */
declare class Tool {
    name: string;
    description?: string;
    parameters?: ToolSchema;
    onTriggered?: (args: unknown) => unknown;
    behavior?: 'BLOCKING' | 'NON_BLOCKING';
    /**
     * @param options - The options for the tool.
     */
    constructor(options: ToolOptions);
    /**
     * Executes the tool's action with standardized error handling.
     * @param args - The arguments for the tool.
     * @returns A promise that resolves with a ToolResult containing success/error information.
     */
    execute(args: unknown): Promise<ToolResult>;
    /**
     * Returns a JSON representation of the tool.
     * @returns A valid FunctionDeclaration object.
     */
    toJSON(): GoogleGenAITypes.FunctionDeclaration;
}

interface GeminiResponse {
    toolCall?: ToolCall;
    text?: string | null;
}

declare abstract class BaseAIModel {
    constructor();
    abstract init(): Promise<void>;
    abstract isAvailable(): boolean;
    abstract query(_input: object, _tools: []): Promise<GeminiResponse | string | null>;
    hasApiKey(): Promise<boolean>;
}

interface GeminiQueryInput {
    type: 'live' | 'text' | 'uri' | 'base64' | 'multiPart';
    action?: 'start' | 'stop' | 'send';
    text?: string;
    uri?: string;
    base64?: string;
    mimeType?: string;
    parts?: GoogleGenAITypes.Part[];
    config?: GoogleGenAITypes.LiveConnectConfig;
    data?: GoogleGenAITypes.LiveSendRealtimeInputParameters;
    useExponentialBackoff?: boolean;
}
declare class Gemini extends BaseAIModel {
    protected options: GeminiOptions;
    inited: boolean;
    liveSession?: GoogleGenAITypes.Session;
    isLiveMode: boolean;
    liveCallbacks: Partial<GoogleGenAITypes.LiveCallbacks>;
    ai?: GoogleGenAITypes.GoogleGenAI;
    constructor(options: GeminiOptions);
    init(): Promise<void>;
    isAvailable(): boolean;
    isLiveAvailable(): false | typeof GoogleGenAITypes.Modality | undefined;
    startLiveSession(params?: GoogleGenAITypes.LiveConnectConfig, model?: string): Promise<GoogleGenAITypes.Session>;
    stopLiveSession(): Promise<void>;
    setLiveCallbacks(callbacks: GoogleGenAITypes.LiveCallbacks): void;
    sendToolResponse(response: GoogleGenAITypes.LiveSendToolResponseParameters): void;
    sendRealtimeInput(input: GoogleGenAITypes.LiveSendRealtimeInputParameters): void;
    getLiveSessionStatus(): {
        isActive: boolean;
        hasSession: boolean;
        isAvailable: boolean | typeof GoogleGenAITypes.Modality | undefined;
    };
    query(input: GeminiQueryInput | {
        prompt: string;
    }): Promise<GeminiResponse | null>;
    protected queryOnce(input: GeminiQueryInput | {
        prompt: string;
    }): Promise<GeminiResponse | null>;
    protected queryWithExponentialFalloff(input: GeminiQueryInput | {
        prompt: string;
    }): Promise<GeminiResponse | null>;
    generate(prompt: string | string[], type?: 'image', systemInstruction?: string, model?: string): Promise<string | undefined>;
    hasApiKey(): Promise<boolean>;
}

declare class OpenAI extends BaseAIModel {
    protected options: OpenAIOptions;
    openai?: OpenAIType;
    constructor(options: OpenAIOptions);
    init(): Promise<void>;
    isAvailable(): boolean;
    query(input: {
        prompt: string;
    }, _tools?: never[]): Promise<{
        text: string;
    } | null>;
    generate(): Promise<void>;
}

type ModelClass = Gemini | OpenAI;
type ModelOptions = GeminiOptions | OpenAIOptions;
type KeysJson = {
    [key: string]: string | {
        apiKey?: string;
    };
};
/**
 * AI Interface to wrap different AI models (primarily Gemini)
 * Handles both traditional query-based AI interactions and real-time live
 * sessions
 *
 * Features:
 * - Text and multimodal queries
 * - Real-time audio/video AI sessions (Gemini Live)
 * - Advanced API key management with multiple sources
 * - Session locking to prevent concurrent operations
 *
 * The URL param and key.json shortcut is only for demonstration and prototyping
 * practice and we strongly suggest not using it for production or deployment
 * purposes. One should set up a proper server to converse with AI servers in
 * deployment.
 *
 * API Key Management Features:
 *
 * 1. Multiple Key Sources (Priority Order):
 *    - URL Parameter: ?key=\<api_key\>
 *    - keys.json file: Local configuration file
 *    - User Prompt: Interactive fallback
 * 2. keys.json Support:
 *    - Structure: \{"gemini": \{"apiKey": "YOUR_KEY_HERE"\}\}
 *    - Automatically loads if present
 */
declare class AI extends Script {
    static dependencies: {
        aiOptions: typeof AIOptions;
    };
    editorIcon: string;
    model?: ModelClass;
    lock: boolean;
    options: AIOptions;
    keysCache?: KeysJson;
    /**
     * Load API keys from keys.json file if available
     * Parsed keys object or null if not found
     */
    loadKeysFromFile(): Promise<KeysJson | null>;
    init({ aiOptions }: {
        aiOptions: AIOptions;
    }): Promise<void>;
    initializeModel(ModelClass: typeof Gemini | typeof OpenAI, modelOptions: ModelOptions): Promise<void>;
    resolveApiKey(modelOptions: ModelOptions): Promise<string | null>;
    isValidApiKey(key: string): boolean | "";
    isAvailable(): boolean | undefined;
    query(input: GeminiQueryInput | {
        prompt: string;
    }, tools?: never[]): Promise<GeminiResponse | string | null>;
    startLiveSession(config?: GoogleGenAITypes.LiveConnectConfig, model?: string): Promise<GoogleGenAITypes.Session>;
    stopLiveSession(): Promise<void>;
    setLiveCallbacks(callbacks: GoogleGenAITypes.LiveCallbacks): Promise<void>;
    sendToolResponse(response: GoogleGenAITypes.LiveSendToolResponseParameters): void;
    sendRealtimeInput(input: GoogleGenAITypes.LiveSendRealtimeInputParameters): false | void;
    getLiveSessionStatus(): {
        isActive: boolean;
        hasSession: boolean;
        isAvailable: boolean | typeof GoogleGenAITypes.Modality | undefined;
    };
    isLiveAvailable(): false | typeof GoogleGenAITypes.Modality | undefined;
    /**
     * In simulator mode, pop up a 2D UI to request Gemini key;
     * In XR mode, show a 3D UI to instruct users to get an API key.
     */
    triggerKeyPopup(): void;
    generate(prompt: string | string[], type?: 'image', systemInstruction?: string, model?: undefined): Promise<string | undefined>;
    /**
     * Create a sample keys.json file structure for reference
     * @returns Sample keys.json structure
     */
    static createSampleKeysStructure(): {
        gemini: {
            apiKey: string;
        };
        openai: {
            apiKey: string;
        };
    };
    /**
     * Check if the current model has an API key available from any source
     * @returns True if API key is available
     */
    hasApiKey(): Promise<boolean | "" | null>;
}

interface MemoryEntry {
    role: 'user' | 'ai' | 'tool';
    content: string;
}
/**
 * Manages the agent's memory, including short-term, long-term, and working
 * memory.
 */
declare class Memory {
    private shortTermMemory;
    /**
     * Adds a new entry to the short-term memory.
     * @param entry - The memory entry to add.
     */
    addShortTerm(entry: MemoryEntry): void;
    /**
     * Retrieves the short-term memory.
     * @returns An array of all short-term memory entries.
     */
    getShortTerm(): MemoryEntry[];
    /**
     * Clears all memory components.
     */
    clear(): void;
}

/**
 * Builds the context to be sent to the AI for reasoning.
 */
declare class Context {
    private instructions;
    constructor(instructions?: string);
    get instruction(): string;
    /**
     * Constructs a formatted prompt from memory and available tools.
     * @param memory - The agent's memory.
     * @param tools - The list of available tools.
     * @returns A string representing the full context for the AI.
     */
    build(memory: Memory, tools: Tool[]): string;
    private formatEntry;
}

/**
 * Lifecycle callbacks for agent events.
 */
interface AgentLifecycleCallbacks {
    /** Called when a session starts */
    onSessionStart?: () => void | Promise<void>;
    /** Called when a session ends */
    onSessionEnd?: () => void | Promise<void>;
    /** Called after a tool is executed */
    onToolExecuted?: (toolName: string, result: unknown) => void;
    /** Called when an error occurs */
    onError?: (error: Error) => void;
}
/**
 * An agent that can use an AI to reason and execute tools.
 */
declare class Agent {
    static dependencies: {};
    ai: AI;
    tools: Tool[];
    memory: Memory;
    contextBuilder: Context;
    lifecycleCallbacks?: AgentLifecycleCallbacks;
    isSessionActive: boolean;
    constructor(ai: AI, tools?: Tool[], instruction?: string, callbacks?: AgentLifecycleCallbacks);
    /**
     * Starts the agent's reasoning loop with an initial prompt.
     * @param prompt - The initial prompt from the user.
     * @returns The final text response from the agent.
     */
    start(prompt: string): Promise<string>;
    /**
     * The main reasoning and action loop of the agent for non-live mode.
     * It repeatedly builds context, queries the AI, and executes tools
     * until a final text response is generated.
     */
    private run;
    findTool(name: string): Tool | undefined;
    /**
     * Get the current session state.
     * @returns Object containing session information
     */
    getSessionState(): {
        isActive: boolean;
        toolCount: number;
        memorySize: number;
    };
}

declare class Registry {
    private instances;
    /**
     * Registers an new instanceof a given type.
     * If an existing instance of the same type is already registered, it will be
     * overwritten.
     * @param instance - The instance to register.
     * @param type - Type to register the instance as. Will default to
     * `instance.constructor` if not defined.
     */
    register<T extends object>(instance: T, type?: Constructor<T>): void;
    /**
     * Gets an existing instance of a registered type.
     * @param type - The constructor function of the type to retrieve.
     * @returns The instance of the requested type.
     */
    get<T extends object>(type: Constructor<T>): T | undefined;
    /**
     * Gets an existing instance of a registered type, or creates a new one if it
     * doesn't exist.
     * @param type - The constructor function of the type to retrieve.
     * @param factory - A function that creates a new instance of the type if it
     * doesn't already exist.
     * @returns The instance of the requested type.
     */
    getOrCreate<T extends object>(type: Constructor<T>, factory: () => T): T;
    /**
     * Unregisters an instance of a given type.
     * @param type - The type to unregister.
     */
    unregister(type: Constructor): void;
}

interface AudioListenerOptions {
    sampleRate?: number;
    channelCount?: number;
    echoCancellation?: boolean;
    noiseSuppression?: boolean;
    autoGainControl?: boolean;
}
declare class AudioListener extends Script {
    static dependencies: {
        registry: typeof Registry;
    };
    private options;
    private audioStream?;
    audioContext?: AudioContext;
    private sourceNode?;
    private processorNode?;
    private isCapturing;
    private latestAudioBuffer;
    private accumulatedChunks;
    private isAccumulating;
    private registry;
    aiService?: AI;
    private onAudioData?;
    private onError?;
    constructor(options?: AudioListenerOptions);
    /**
     * Init the AudioListener.
     */
    init({ registry }: {
        registry: Registry;
    }): void;
    startCapture(callbacks?: {
        onAudioData?: (audioBuffer: ArrayBuffer) => void;
        onError?: (error: Error) => void;
        accumulate?: boolean;
    }): Promise<void>;
    stopCapture(): void;
    setupAudioCapture(): Promise<void>;
    private setupAudioWorklet;
    streamToAI(audioBuffer: ArrayBuffer): void;
    setAIStreaming(enabled: boolean): void;
    cleanup(): void;
    static isSupported(): boolean;
    getIsCapturing(): boolean;
    getLatestAudioBuffer(): ArrayBuffer | null;
    clearLatestAudioBuffer(): void;
    /**
     * Gets all accumulated audio chunks as a single combined buffer
     */
    getAccumulatedBuffer(): ArrayBuffer | null;
    /**
     * Clears accumulated chunks
     */
    clearAccumulatedBuffer(): void;
    /**
     * Gets the number of accumulated chunks
     */
    getAccumulatedChunkCount(): number;
    dispose(): void;
}

declare enum VolumeCategory {
    music = "music",
    sfx = "sfx",
    speech = "speech",
    ui = "ui"
}
declare class CategoryVolumes {
    isMuted: boolean;
    masterVolume: number;
    volumes: Record<VolumeCategory, number>;
    getCategoryVolume(category: string): number;
    getEffectiveVolume(category: string, specificVolume?: number): number;
}

interface AudioPlayerOptions {
    sampleRate?: number;
    channelCount?: number;
    category?: string;
}
declare class AudioPlayer extends Script {
    private options;
    private audioContext?;
    private audioQueue;
    private nextStartTime;
    private gainNode?;
    private categoryVolumes?;
    private volume;
    private category;
    scheduleAheadTime: number;
    constructor(options?: AudioPlayerOptions);
    /**
     * Sets the CategoryVolumes instance for this player to respect
     * master/category volumes
     */
    setCategoryVolumes(categoryVolumes: CategoryVolumes): void;
    /**
     * Sets the specific volume for this player (0.0 to 1.0)
     */
    setVolume(level: number): void;
    /**
     * Updates the gain node volume based on category volumes
     * Public so CoreSound can update it when master volume changes
     */
    updateGainNodeVolume(): void;
    initializeAudioContext(): Promise<void>;
    playAudioChunk(base64AudioData: string): Promise<void>;
    private scheduleAudioBuffers;
    clearQueue(): void;
    getIsPlaying(): boolean;
    getQueueLength(): number;
    base64ToArrayBuffer(base64: string): ArrayBuffer;
    stop(): void;
    static isSupported(): boolean;
    dispose(): void;
}

declare const musicLibrary: {
    readonly ambient: string;
    readonly background: string;
    readonly buttonHover: string;
    readonly buttonPress: string;
    readonly menuDismiss: string;
};
declare class BackgroundMusic extends Script {
    private listener;
    private categoryVolumes;
    private audioLoader;
    private currentAudio;
    private isPlaying;
    private musicLibrary;
    private specificVolume;
    private musicCategory;
    constructor(listener: THREE.AudioListener, categoryVolumes: CategoryVolumes);
    setVolume(level: number): void;
    playMusic(musicKey: keyof typeof musicLibrary, category?: string): void;
    stopMusic(): void;
    destroy(): void;
}

declare class SpeechSynthesizerOptions {
    enabled: boolean;
    /** If true, a new call to speak() will interrupt any ongoing speech. */
    allowInterruptions: boolean;
}
declare class SpeechRecognizerOptions {
    enabled: boolean;
    /** Recognition language (e.g., 'en-US'). */
    lang: string;
    /** If true, recognition continues after a pause. */
    continuous: boolean;
    /** Keywords to detect as commands. */
    commands: string[];
    /** If true, provides interim results. */
    interimResults: boolean;
    /** Minimum confidence (0-1) for a command. */
    commandConfidenceThreshold: number;
    /** If true, play activation sounds in simulator. */
    playSimulatorActivationSounds: boolean;
}
declare class SoundOptions {
    speechSynthesizer: SpeechSynthesizerOptions;
    speechRecognizer: SpeechRecognizerOptions;
}

/**
 * Defines common UI sound presets with their default parameters.
 * Each preset specifies frequency, duration, and waveform type.
 */
declare const SOUND_PRESETS: {
    readonly BEEP: {
        readonly frequency: 1000;
        readonly duration: 0.07;
        readonly waveformType: "sine";
    };
    readonly CLICK: readonly [{
        readonly frequency: 1500;
        readonly duration: 0.02;
        readonly waveformType: "triangle";
        readonly delay: 0;
    }];
    readonly ACTIVATE: readonly [{
        readonly frequency: 800;
        readonly duration: 0.05;
        readonly waveformType: "sine";
        readonly delay: 0;
    }, {
        readonly frequency: 1200;
        readonly duration: 0.07;
        readonly waveformType: "sine";
        readonly delay: 50;
    }];
    readonly DEACTIVATE: readonly [{
        readonly frequency: 1200;
        readonly duration: 0.05;
        readonly waveformType: "sine";
        readonly delay: 0;
    }, {
        readonly frequency: 800;
        readonly duration: 0.07;
        readonly waveformType: "sine";
        readonly delay: 50;
    }];
};
declare class SoundSynthesizer extends Script {
    audioContext?: AudioContext;
    isInitialized: boolean;
    debug: boolean;
    /**
     * Initializes the AudioContext.
     */
    private _initAudioContext;
    /**
     * Plays a single tone with specified parameters.
     * @param frequency - The frequency of the tone in Hz.
     * @param duration - The duration of the tone in seconds.
     * @param volume - The volume of the tone (0.0 to 1.0).
     * @param waveformType - The type of waveform ('sine', 'square', 'sawtooth',
     *     'triangle').
     */
    playTone(frequency: number, duration: number, volume: number, waveformType: OscillatorType): void;
    /**
     * Plays a predefined sound preset.
     * @param presetName - The name of the preset (e.g., 'BEEP', 'CLICK',
     *     'ACTIVATE', 'DEACTIVATE').
     * @param volume - The volume for the preset (overrides default
     *     if present, otherwise uses this).
     */
    playPresetTone(presetName: keyof typeof SOUND_PRESETS, volume?: number): void;
}

declare const spatialSoundLibrary: {
    readonly ambient: "musicLibrary/AmbientLoop.opus";
    readonly buttonHover: "musicLibrary/ButtonHover.opus";
    readonly paintOneShot1: "musicLibrary/PaintOneShot1.opus";
};
interface PlaySoundOptions {
    loop?: boolean;
    volume?: number;
    refDistance?: number;
    rolloffFactor?: number;
    onEnded?: () => void;
}
declare class SpatialAudio extends Script {
    private listener;
    private categoryVolumes;
    private audioLoader;
    private soundLibrary;
    private activeSounds;
    private specificVolume;
    private category;
    private defaultRefDistance;
    private defaultRolloffFactor;
    constructor(listener: THREE.AudioListener, categoryVolumes: CategoryVolumes);
    /**
     * Plays a sound attached to a specific 3D object.
     * @param soundKey - Key from the soundLibrary.
     * @param targetObject - The object the sound should emanate
     *     from.
     * @param options - Optional settings \{ loop: boolean, volume:
     *     number, refDistance: number, rolloffFactor: number, onEnded: function
     *     \}.
     * @returns A unique ID for the playing sound instance, or null
     *     if failed.
     */
    playSoundAtObject(soundKey: keyof typeof spatialSoundLibrary, targetObject: THREE.Object3D, options?: PlaySoundOptions): number | null;
    /**
     * Stops a specific sound instance by its ID.
     * @param soundId - The ID returned by playSoundAtObject.
     */
    stopSound(soundId: number): void;
    /**
     * Internal method to remove sound from object and map.
     * @param soundId - id
     */
    private _cleanupSound;
    /**
     * Sets the base specific volume for subsequently played spatial sounds.
     * Does NOT affect currently playing sounds (use updateAllVolumes for that).
     * @param level - Volume level (0.0 to 1.0).
     */
    setVolume(level: number): void;
    /**
     * Updates the volume of all currently playing spatial sounds managed by this
     * instance.
     */
    updateAllVolumes(): void;
    destroy(): void;
}

interface SpeechRecognizerEventMap extends THREE.Object3DEventMap {
    start: object;
    error: {
        error: string;
    };
    end: object;
    result: {
        originalEvent: SpeechRecognitionEvent;
        transcript: string;
        confidence: number;
        command?: string;
        isFinal: boolean;
    };
}
declare class SpeechRecognizer extends Script<SpeechRecognizerEventMap> {
    private soundSynthesizer;
    static dependencies: {
        soundOptions: typeof SoundOptions;
    };
    options: SpeechRecognizerOptions;
    recognition?: SpeechRecognition;
    isListening: boolean;
    lastTranscript: string;
    lastCommand?: string;
    lastConfidence: number;
    error?: string;
    playActivationSounds: boolean;
    constructor(soundSynthesizer: SoundSynthesizer);
    init({ soundOptions }: {
        soundOptions: SoundOptions;
    }): void;
    onSimulatorStarted(): void;
    start(): void;
    stop(): void;
    getLastTranscript(): string;
    getLastCommand(): string | undefined;
    getLastConfidence(): number;
    private _handleStart;
    private _handleResult;
    private _handleEnd;
    private _handleError;
    destroy(): void;
}

declare class SpeechSynthesizer extends Script {
    private categoryVolumes;
    private onStartCallback;
    private onEndCallback;
    private onErrorCallback;
    static dependencies: {
        soundOptions: typeof SoundOptions;
    };
    private synth;
    private voices;
    private selectedVoice?;
    private isSpeaking;
    private debug;
    private specificVolume;
    private speechCategory;
    private options;
    constructor(categoryVolumes: CategoryVolumes, onStartCallback?: () => void, onEndCallback?: () => void, onErrorCallback?: (_: Error) => void);
    init({ soundOptions }: {
        soundOptions: SoundOptions;
    }): void;
    loadVoices: () => void;
    setVolume(level: number): void;
    speak(text: string, lang?: string, pitch?: number, rate?: number): Promise<void>;
    tts(text: string, lang?: string, pitch?: number, rate?: number): void;
    cancel(): void;
    destroy(): void;
}

declare class CoreSound extends Script {
    static dependencies: {
        camera: typeof THREE.Camera;
        soundOptions: typeof SoundOptions;
    };
    type: string;
    name: string;
    categoryVolumes: CategoryVolumes;
    soundSynthesizer: SoundSynthesizer;
    listener: THREE.AudioListener;
    backgroundMusic: BackgroundMusic;
    spatialAudio: SpatialAudio;
    speechRecognizer?: SpeechRecognizer;
    speechSynthesizer?: SpeechSynthesizer;
    audioListener: AudioListener;
    audioPlayer: AudioPlayer;
    options: SoundOptions;
    init({ camera, soundOptions, }: {
        camera: THREE.Camera;
        soundOptions: SoundOptions;
    }): void;
    getAudioListener(): THREE.AudioListener;
    setMasterVolume(level: number): void;
    getMasterVolume(): number;
    setCategoryVolume(category: VolumeCategory, level: number): void;
    getCategoryVolume(category: VolumeCategory): number;
    enableAudio(options?: {
        streamToAI?: boolean;
        accumulate?: boolean;
    }): Promise<void>;
    disableAudio(): void;
    /**
     * Starts recording audio with chunk accumulation
     */
    startRecording(): Promise<void>;
    /**
     * Stops recording and returns the accumulated audio buffer
     */
    stopRecording(): ArrayBuffer | null;
    /**
     * Gets the accumulated recording buffer without stopping
     */
    getRecordedBuffer(): ArrayBuffer | null;
    /**
     * Clears the accumulated recording buffer
     */
    clearRecordedBuffer(): void;
    /**
     * Gets the sample rate being used for recording
     */
    getRecordingSampleRate(): number;
    setAIStreaming(enabled: boolean): void;
    isAIStreamingEnabled(): boolean;
    playAIAudio(base64AudioData: string): Promise<void>;
    stopAIAudio(): void;
    isAIAudioPlaying(): boolean;
    /**
     * Plays a raw audio buffer (Int16 PCM data) with proper sample rate
     */
    playRecordedAudio(audioBuffer: ArrayBuffer, sampleRate?: number): Promise<void>;
    isAudioEnabled(): boolean;
    getLatestAudioBuffer(): ArrayBuffer | null;
    clearLatestAudioBuffer(): void;
    getEffectiveVolume(category: VolumeCategory, specificVolume?: number): number;
    muteAll(): void;
    unmuteAll(): void;
    destroy(): void;
}

/**
 * State information for a live session.
 */
interface LiveSessionState {
    /** Whether the session is currently active */
    isActive: boolean;
    /** Timestamp when session started */
    startTime?: number;
    /** Timestamp when session ended */
    endTime?: number;
    /** Number of messages received */
    messageCount: number;
    /** Number of tool calls executed */
    toolCallCount: number;
    /** Last error message if any */
    lastError?: string;
}
/**
 * Skybox Agent for generating 360-degree equirectangular backgrounds through conversation.
 *
 * @example Basic usage
 * ```typescript
 * // 1. Enable audio (required for live sessions)
 * await xb.core.sound.enableAudio();
 *
 * // 2. Create agent
 * const agent = new xb.SkyboxAgent(xb.core.ai, xb.core.sound, xb.core.scene);
 *
 * // 3. Start session
 * await agent.startLiveSession({
 *   onopen: () => console.log('Session ready'),
 *   onmessage: (msg) => handleMessage(msg),
 *   onclose: () => console.log('Session closed')
 * });
 *
 * // 4. Clean up when done
 * await agent.stopLiveSession();
 * xb.core.sound.disableAudio();
 * ```
 *
 * @example With lifecycle callbacks
 * ```typescript
 * const agent = new xb.SkyboxAgent(
 *   xb.core.ai,
 *   xb.core.sound,
 *   xb.core.scene,
 *   {
 *     onSessionStart: () => updateUI('active'),
 *     onSessionEnd: () => updateUI('inactive'),
 *     onError: (error) => showError(error)
 *   }
 * );
 * ```
 *
 * @remarks
 * - Audio must be enabled BEFORE starting live session using `xb.core.sound.enableAudio()`
 * - Users are responsible for managing audio lifecycle
 * - Always call `stopLiveSession()` before disabling audio
 * - Session state can be checked using `getSessionState()` and `getLiveSessionState()`
 */
declare class SkyboxAgent extends Agent {
    private sound;
    private sessionState;
    constructor(ai: AI, sound: CoreSound, scene: THREE.Scene, callbacks?: AgentLifecycleCallbacks);
    /**
     * Starts a live AI session for real-time conversation.
     *
     * @param callbacks - Optional callbacks for session events. Can also be set using ai.setLiveCallbacks()
     * @throws If AI model is not initialized or live session is not available
     *
     * @remarks
     * Audio must be enabled separately using `xb.core.sound.enableAudio()` before starting the session.
     * This gives users control over when microphone permissions are requested.
     */
    startLiveSession(callbacks?: GoogleGenAITypes.LiveCallbacks): Promise<void>;
    /**
     * Stops the live AI session.
     *
     * @remarks
     * Audio must be disabled separately using `xb.core.sound.disableAudio()` after stopping the session.
     */
    stopLiveSession(): Promise<void>;
    /**
     * Wraps user callbacks to track session state and trigger lifecycle events.
     * @param callbacks - The callbacks to wrap.
     * @returns The wrapped callbacks.
     */
    private wrapCallbacks;
    /**
     * Sends tool execution results back to the AI.
     *
     * @param response - The tool response containing function results
     */
    sendToolResponse(response: GoogleGenAITypes.LiveSendToolResponseParameters): Promise<void>;
    /**
     * Validates that a tool response has the correct format.
     * @param response - The tool response to validate.
     * @returns True if the response is valid, false otherwise.
     */
    private validateToolResponse;
    /**
     * Helper to create a properly formatted tool response from a ToolResult.
     *
     * @param id - The function call ID
     * @param name - The function name
     * @param result - The ToolResult from tool execution
     * @returns A properly formatted FunctionResponse
     */
    static createToolResponse(id: string, name: string, result: ToolResult): GoogleGenAITypes.FunctionResponse;
    /**
     * Gets the current live session state.
     *
     * @returns Read-only session state information
     */
    getLiveSessionState(): Readonly<LiveSessionState>;
    /**
     * Gets the duration of the session in milliseconds.
     *
     * @returns Duration in ms, or null if session hasn't started
     */
    getSessionDuration(): number | null;
}

interface GetWeatherArgs {
    latitude: number;
    longitude: number;
}
interface WeatherData {
    temperature: number;
    weathercode: number;
}
/**
 * A tool that gets the current weather for a specific location.
 */
declare class GetWeatherTool extends Tool {
    constructor();
    /**
     * Executes the tool's action.
     * @param args - The arguments for the tool.
     * @returns A promise that resolves with a ToolResult containing weather information.
     */
    execute(args: GetWeatherArgs): Promise<ToolResult<WeatherData>>;
}

/**
 * A tool that generates a 360-degree equirectangular skybox image
 * based on a given prompt using an AI service.
 */
declare class GenerateSkyboxTool extends Tool {
    private ai;
    private scene;
    constructor(ai: AI, scene: THREE.Scene);
    /**
     * Executes the tool's action.
     * @param args - The prompt to use to generate the skybox.
     * @returns A promise that resolves with a ToolResult containing success/error information.
     */
    execute(args: {
        prompt: string;
    }): Promise<ToolResult<string>>;
}

/**
 * Parameters for RGB to depth UV mapping given different aspect ratios.
 * These parameters define the distortion model and affine transformations
 * required to align the RGB camera feed with the depth map.
 */
interface RgbToDepthParams {
    scale: number;
    scaleX: number;
    scaleY: number;
    translateU: number;
    translateV: number;
    k1: number;
    k2: number;
    k3: number;
    p1: number;
    p2: number;
    xc: number;
    yc: number;
}
/**
 * Default parameters for rgb to depth projection.
 * For RGB and depth, 4:3 and 1:1, respectively.
 */
declare const DEFAULT_RGB_TO_DEPTH_PARAMS: RgbToDepthParams;
/**
 * Configuration options for the device camera.
 */
declare class DeviceCameraOptions {
    enabled: boolean;
    /**
     * Constraints for `getUserMedia`. This will guide the initial camera
     * selection.
     */
    videoConstraints?: MediaTrackConstraints;
    /**
     * Hint for performance optimization on frequent captures.
     */
    willCaptureFrequently: boolean;
    /**
     * Parameters for RGB to depth UV mapping given different aspect ratios.
     */
    rgbToDepthParams: RgbToDepthParams;
    cameraLabel?: string;
    constructor(options?: DeepReadonly<DeepPartial<DeviceCameraOptions>>);
}
declare const xrDeviceCameraEnvironmentOptions: {
    readonly enabled: boolean;
    readonly videoConstraints?: {
        readonly advanced?: readonly {
            readonly aspectRatio?: number | {
                readonly exact?: number | undefined;
                readonly ideal?: number | undefined;
                readonly max?: number | undefined;
                readonly min?: number | undefined;
            } | undefined;
            readonly autoGainControl?: boolean | {
                readonly exact?: boolean | undefined;
                readonly ideal?: boolean | undefined;
            } | undefined;
            readonly backgroundBlur?: boolean | {
                readonly exact?: boolean | undefined;
                readonly ideal?: boolean | undefined;
            } | undefined;
            readonly channelCount?: number | {
                readonly exact?: number | undefined;
                readonly ideal?: number | undefined;
                readonly max?: number | undefined;
                readonly min?: number | undefined;
            } | undefined;
            readonly deviceId?: string | readonly string[] | {
                readonly exact?: string | readonly string[] | undefined;
                readonly ideal?: string | readonly string[] | undefined;
            } | undefined;
            readonly displaySurface?: string | readonly string[] | {
                readonly exact?: string | readonly string[] | undefined;
                readonly ideal?: string | readonly string[] | undefined;
            } | undefined;
            readonly echoCancellation?: string | boolean | {
                readonly exact?: boolean | string | undefined;
                readonly ideal?: boolean | string | undefined;
            } | undefined;
            readonly facingMode?: string | readonly string[] | {
                readonly exact?: string | readonly string[] | undefined;
                readonly ideal?: string | readonly string[] | undefined;
            } | undefined;
            readonly frameRate?: number | {
                readonly exact?: number | undefined;
                readonly ideal?: number | undefined;
                readonly max?: number | undefined;
                readonly min?: number | undefined;
            } | undefined;
            readonly groupId?: string | readonly string[] | {
                readonly exact?: string | readonly string[] | undefined;
                readonly ideal?: string | readonly string[] | undefined;
            } | undefined;
            readonly height?: number | {
                readonly exact?: number | undefined;
                readonly ideal?: number | undefined;
                readonly max?: number | undefined;
                readonly min?: number | undefined;
            } | undefined;
            readonly noiseSuppression?: boolean | {
                readonly exact?: boolean | undefined;
                readonly ideal?: boolean | undefined;
            } | undefined;
            readonly sampleRate?: number | {
                readonly exact?: number | undefined;
                readonly ideal?: number | undefined;
                readonly max?: number | undefined;
                readonly min?: number | undefined;
            } | undefined;
            readonly sampleSize?: number | {
                readonly exact?: number | undefined;
                readonly ideal?: number | undefined;
                readonly max?: number | undefined;
                readonly min?: number | undefined;
            } | undefined;
            readonly width?: number | {
                readonly exact?: number | undefined;
                readonly ideal?: number | undefined;
                readonly max?: number | undefined;
                readonly min?: number | undefined;
            } | undefined;
        }[] | undefined;
        readonly aspectRatio?: number | {
            readonly exact?: number | undefined;
            readonly ideal?: number | undefined;
            readonly max?: number | undefined;
            readonly min?: number | undefined;
        } | undefined;
        readonly autoGainControl?: boolean | {
            readonly exact?: boolean | undefined;
            readonly ideal?: boolean | undefined;
        } | undefined;
        readonly backgroundBlur?: boolean | {
            readonly exact?: boolean | undefined;
            readonly ideal?: boolean | undefined;
        } | undefined;
        readonly channelCount?: number | {
            readonly exact?: number | undefined;
            readonly ideal?: number | undefined;
            readonly max?: number | undefined;
            readonly min?: number | undefined;
        } | undefined;
        readonly deviceId?: string | readonly string[] | {
            readonly exact?: string | readonly string[] | undefined;
            readonly ideal?: string | readonly string[] | undefined;
        } | undefined;
        readonly displaySurface?: string | readonly string[] | {
            readonly exact?: string | readonly string[] | undefined;
            readonly ideal?: string | readonly string[] | undefined;
        } | undefined;
        readonly echoCancellation?: string | boolean | {
            readonly exact?: boolean | string | undefined;
            readonly ideal?: boolean | string | undefined;
        } | undefined;
        readonly facingMode?: string | readonly string[] | {
            readonly exact?: string | readonly string[] | undefined;
            readonly ideal?: string | readonly string[] | undefined;
        } | undefined;
        readonly frameRate?: number | {
            readonly exact?: number | undefined;
            readonly ideal?: number | undefined;
            readonly max?: number | undefined;
            readonly min?: number | undefined;
        } | undefined;
        readonly groupId?: string | readonly string[] | {
            readonly exact?: string | readonly string[] | undefined;
            readonly ideal?: string | readonly string[] | undefined;
        } | undefined;
        readonly height?: number | {
            readonly exact?: number | undefined;
            readonly ideal?: number | undefined;
            readonly max?: number | undefined;
            readonly min?: number | undefined;
        } | undefined;
        readonly noiseSuppression?: boolean | {
            readonly exact?: boolean | undefined;
            readonly ideal?: boolean | undefined;
        } | undefined;
        readonly sampleRate?: number | {
            readonly exact?: number | undefined;
            readonly ideal?: number | undefined;
            readonly max?: number | undefined;
            readonly min?: number | undefined;
        } | undefined;
        readonly sampleSize?: number | {
            readonly exact?: number | undefined;
            readonly ideal?: number | undefined;
            readonly max?: number | undefined;
            readonly min?: number | undefined;
        } | undefined;
        readonly width?: number | {
            readonly exact?: number | undefined;
            readonly ideal?: number | undefined;
            readonly max?: number | undefined;
            readonly min?: number | undefined;
        } | undefined;
    } | undefined;
    readonly willCaptureFrequently: boolean;
    readonly rgbToDepthParams: {
        readonly scale: number;
        readonly scaleX: number;
        readonly scaleY: number;
        readonly translateU: number;
        readonly translateV: number;
        readonly k1: number;
        readonly k2: number;
        readonly k3: number;
        readonly p1: number;
        readonly p2: number;
        readonly xc: number;
        readonly yc: number;
    };
    readonly cameraLabel?: string | undefined;
};
declare const xrDeviceCameraUserOptions: {
    readonly enabled: boolean;
    readonly videoConstraints?: {
        readonly advanced?: readonly {
            readonly aspectRatio?: number | {
                readonly exact?: number | undefined;
                readonly ideal?: number | undefined;
                readonly max?: number | undefined;
                readonly min?: number | undefined;
            } | undefined;
            readonly autoGainControl?: boolean | {
                readonly exact?: boolean | undefined;
                readonly ideal?: boolean | undefined;
            } | undefined;
            readonly backgroundBlur?: boolean | {
                readonly exact?: boolean | undefined;
                readonly ideal?: boolean | undefined;
            } | undefined;
            readonly channelCount?: number | {
                readonly exact?: number | undefined;
                readonly ideal?: number | undefined;
                readonly max?: number | undefined;
                readonly min?: number | undefined;
            } | undefined;
            readonly deviceId?: string | readonly string[] | {
                readonly exact?: string | readonly string[] | undefined;
                readonly ideal?: string | readonly string[] | undefined;
            } | undefined;
            readonly displaySurface?: string | readonly string[] | {
                readonly exact?: string | readonly string[] | undefined;
                readonly ideal?: string | readonly string[] | undefined;
            } | undefined;
            readonly echoCancellation?: string | boolean | {
                readonly exact?: boolean | string | undefined;
                readonly ideal?: boolean | string | undefined;
            } | undefined;
            readonly facingMode?: string | readonly string[] | {
                readonly exact?: string | readonly string[] | undefined;
                readonly ideal?: string | readonly string[] | undefined;
            } | undefined;
            readonly frameRate?: number | {
                readonly exact?: number | undefined;
                readonly ideal?: number | undefined;
                readonly max?: number | undefined;
                readonly min?: number | undefined;
            } | undefined;
            readonly groupId?: string | readonly string[] | {
                readonly exact?: string | readonly string[] | undefined;
                readonly ideal?: string | readonly string[] | undefined;
            } | undefined;
            readonly height?: number | {
                readonly exact?: number | undefined;
                readonly ideal?: number | undefined;
                readonly max?: number | undefined;
                readonly min?: number | undefined;
            } | undefined;
            readonly noiseSuppression?: boolean | {
                readonly exact?: boolean | undefined;
                readonly ideal?: boolean | undefined;
            } | undefined;
            readonly sampleRate?: number | {
                readonly exact?: number | undefined;
                readonly ideal?: number | undefined;
                readonly max?: number | undefined;
                readonly min?: number | undefined;
            } | undefined;
            readonly sampleSize?: number | {
                readonly exact?: number | undefined;
                readonly ideal?: number | undefined;
                readonly max?: number | undefined;
                readonly min?: number | undefined;
            } | undefined;
            readonly width?: number | {
                readonly exact?: number | undefined;
                readonly ideal?: number | undefined;
                readonly max?: number | undefined;
                readonly min?: number | undefined;
            } | undefined;
        }[] | undefined;
        readonly aspectRatio?: number | {
            readonly exact?: number | undefined;
            readonly ideal?: number | undefined;
            readonly max?: number | undefined;
            readonly min?: number | undefined;
        } | undefined;
        readonly autoGainControl?: boolean | {
            readonly exact?: boolean | undefined;
            readonly ideal?: boolean | undefined;
        } | undefined;
        readonly backgroundBlur?: boolean | {
            readonly exact?: boolean | undefined;
            readonly ideal?: boolean | undefined;
        } | undefined;
        readonly channelCount?: number | {
            readonly exact?: number | undefined;
            readonly ideal?: number | undefined;
            readonly max?: number | undefined;
            readonly min?: number | undefined;
        } | undefined;
        readonly deviceId?: string | readonly string[] | {
            readonly exact?: string | readonly string[] | undefined;
            readonly ideal?: string | readonly string[] | undefined;
        } | undefined;
        readonly displaySurface?: string | readonly string[] | {
            readonly exact?: string | readonly string[] | undefined;
            readonly ideal?: string | readonly string[] | undefined;
        } | undefined;
        readonly echoCancellation?: string | boolean | {
            readonly exact?: boolean | string | undefined;
            readonly ideal?: boolean | string | undefined;
        } | undefined;
        readonly facingMode?: string | readonly string[] | {
            readonly exact?: string | readonly string[] | undefined;
            readonly ideal?: string | readonly string[] | undefined;
        } | undefined;
        readonly frameRate?: number | {
            readonly exact?: number | undefined;
            readonly ideal?: number | undefined;
            readonly max?: number | undefined;
            readonly min?: number | undefined;
        } | undefined;
        readonly groupId?: string | readonly string[] | {
            readonly exact?: string | readonly string[] | undefined;
            readonly ideal?: string | readonly string[] | undefined;
        } | undefined;
        readonly height?: number | {
            readonly exact?: number | undefined;
            readonly ideal?: number | undefined;
            readonly max?: number | undefined;
            readonly min?: number | undefined;
        } | undefined;
        readonly noiseSuppression?: boolean | {
            readonly exact?: boolean | undefined;
            readonly ideal?: boolean | undefined;
        } | undefined;
        readonly sampleRate?: number | {
            readonly exact?: number | undefined;
            readonly ideal?: number | undefined;
            readonly max?: number | undefined;
            readonly min?: number | undefined;
        } | undefined;
        readonly sampleSize?: number | {
            readonly exact?: number | undefined;
            readonly ideal?: number | undefined;
            readonly max?: number | undefined;
            readonly min?: number | undefined;
        } | undefined;
        readonly width?: number | {
            readonly exact?: number | undefined;
            readonly ideal?: number | undefined;
            readonly max?: number | undefined;
            readonly min?: number | undefined;
        } | undefined;
    } | undefined;
    readonly willCaptureFrequently: boolean;
    readonly rgbToDepthParams: {
        readonly scale: number;
        readonly scaleX: number;
        readonly scaleY: number;
        readonly translateU: number;
        readonly translateV: number;
        readonly k1: number;
        readonly k2: number;
        readonly k3: number;
        readonly p1: number;
        readonly p2: number;
        readonly xc: number;
        readonly yc: number;
    };
    readonly cameraLabel?: string | undefined;
};
declare const xrDeviceCameraEnvironmentContinuousOptions: {
    readonly enabled: boolean;
    readonly videoConstraints?: {
        readonly advanced?: readonly {
            readonly aspectRatio?: number | {
                readonly exact?: number | undefined;
                readonly ideal?: number | undefined;
                readonly max?: number | undefined;
                readonly min?: number | undefined;
            } | undefined;
            readonly autoGainControl?: boolean | {
                readonly exact?: boolean | undefined;
                readonly ideal?: boolean | undefined;
            } | undefined;
            readonly backgroundBlur?: boolean | {
                readonly exact?: boolean | undefined;
                readonly ideal?: boolean | undefined;
            } | undefined;
            readonly channelCount?: number | {
                readonly exact?: number | undefined;
                readonly ideal?: number | undefined;
                readonly max?: number | undefined;
                readonly min?: number | undefined;
            } | undefined;
            readonly deviceId?: string | readonly string[] | {
                readonly exact?: string | readonly string[] | undefined;
                readonly ideal?: string | readonly string[] | undefined;
            } | undefined;
            readonly displaySurface?: string | readonly string[] | {
                readonly exact?: string | readonly string[] | undefined;
                readonly ideal?: string | readonly string[] | undefined;
            } | undefined;
            readonly echoCancellation?: string | boolean | {
                readonly exact?: boolean | string | undefined;
                readonly ideal?: boolean | string | undefined;
            } | undefined;
            readonly facingMode?: string | readonly string[] | {
                readonly exact?: string | readonly string[] | undefined;
                readonly ideal?: string | readonly string[] | undefined;
            } | undefined;
            readonly frameRate?: number | {
                readonly exact?: number | undefined;
                readonly ideal?: number | undefined;
                readonly max?: number | undefined;
                readonly min?: number | undefined;
            } | undefined;
            readonly groupId?: string | readonly string[] | {
                readonly exact?: string | readonly string[] | undefined;
                readonly ideal?: string | readonly string[] | undefined;
            } | undefined;
            readonly height?: number | {
                readonly exact?: number | undefined;
                readonly ideal?: number | undefined;
                readonly max?: number | undefined;
                readonly min?: number | undefined;
            } | undefined;
            readonly noiseSuppression?: boolean | {
                readonly exact?: boolean | undefined;
                readonly ideal?: boolean | undefined;
            } | undefined;
            readonly sampleRate?: number | {
                readonly exact?: number | undefined;
                readonly ideal?: number | undefined;
                readonly max?: number | undefined;
                readonly min?: number | undefined;
            } | undefined;
            readonly sampleSize?: number | {
                readonly exact?: number | undefined;
                readonly ideal?: number | undefined;
                readonly max?: number | undefined;
                readonly min?: number | undefined;
            } | undefined;
            readonly width?: number | {
                readonly exact?: number | undefined;
                readonly ideal?: number | undefined;
                readonly max?: number | undefined;
                readonly min?: number | undefined;
            } | undefined;
        }[] | undefined;
        readonly aspectRatio?: number | {
            readonly exact?: number | undefined;
            readonly ideal?: number | undefined;
            readonly max?: number | undefined;
            readonly min?: number | undefined;
        } | undefined;
        readonly autoGainControl?: boolean | {
            readonly exact?: boolean | undefined;
            readonly ideal?: boolean | undefined;
        } | undefined;
        readonly backgroundBlur?: boolean | {
            readonly exact?: boolean | undefined;
            readonly ideal?: boolean | undefined;
        } | undefined;
        readonly channelCount?: number | {
            readonly exact?: number | undefined;
            readonly ideal?: number | undefined;
            readonly max?: number | undefined;
            readonly min?: number | undefined;
        } | undefined;
        readonly deviceId?: string | readonly string[] | {
            readonly exact?: string | readonly string[] | undefined;
            readonly ideal?: string | readonly string[] | undefined;
        } | undefined;
        readonly displaySurface?: string | readonly string[] | {
            readonly exact?: string | readonly string[] | undefined;
            readonly ideal?: string | readonly string[] | undefined;
        } | undefined;
        readonly echoCancellation?: string | boolean | {
            readonly exact?: boolean | string | undefined;
            readonly ideal?: boolean | string | undefined;
        } | undefined;
        readonly facingMode?: string | readonly string[] | {
            readonly exact?: string | readonly string[] | undefined;
            readonly ideal?: string | readonly string[] | undefined;
        } | undefined;
        readonly frameRate?: number | {
            readonly exact?: number | undefined;
            readonly ideal?: number | undefined;
            readonly max?: number | undefined;
            readonly min?: number | undefined;
        } | undefined;
        readonly groupId?: string | readonly string[] | {
            readonly exact?: string | readonly string[] | undefined;
            readonly ideal?: string | readonly string[] | undefined;
        } | undefined;
        readonly height?: number | {
            readonly exact?: number | undefined;
            readonly ideal?: number | undefined;
            readonly max?: number | undefined;
            readonly min?: number | undefined;
        } | undefined;
        readonly noiseSuppression?: boolean | {
            readonly exact?: boolean | undefined;
            readonly ideal?: boolean | undefined;
        } | undefined;
        readonly sampleRate?: number | {
            readonly exact?: number | undefined;
            readonly ideal?: number | undefined;
            readonly max?: number | undefined;
            readonly min?: number | undefined;
        } | undefined;
        readonly sampleSize?: number | {
            readonly exact?: number | undefined;
            readonly ideal?: number | undefined;
            readonly max?: number | undefined;
            readonly min?: number | undefined;
        } | undefined;
        readonly width?: number | {
            readonly exact?: number | undefined;
            readonly ideal?: number | undefined;
            readonly max?: number | undefined;
            readonly min?: number | undefined;
        } | undefined;
    } | undefined;
    readonly willCaptureFrequently: boolean;
    readonly rgbToDepthParams: {
        readonly scale: number;
        readonly scaleX: number;
        readonly scaleY: number;
        readonly translateU: number;
        readonly translateV: number;
        readonly k1: number;
        readonly k2: number;
        readonly k3: number;
        readonly p1: number;
        readonly p2: number;
        readonly xc: number;
        readonly yc: number;
    };
    readonly cameraLabel?: string | undefined;
};
declare const xrDeviceCameraUserContinuousOptions: {
    readonly enabled: boolean;
    readonly videoConstraints?: {
        readonly advanced?: readonly {
            readonly aspectRatio?: number | {
                readonly exact?: number | undefined;
                readonly ideal?: number | undefined;
                readonly max?: number | undefined;
                readonly min?: number | undefined;
            } | undefined;
            readonly autoGainControl?: boolean | {
                readonly exact?: boolean | undefined;
                readonly ideal?: boolean | undefined;
            } | undefined;
            readonly backgroundBlur?: boolean | {
                readonly exact?: boolean | undefined;
                readonly ideal?: boolean | undefined;
            } | undefined;
            readonly channelCount?: number | {
                readonly exact?: number | undefined;
                readonly ideal?: number | undefined;
                readonly max?: number | undefined;
                readonly min?: number | undefined;
            } | undefined;
            readonly deviceId?: string | readonly string[] | {
                readonly exact?: string | readonly string[] | undefined;
                readonly ideal?: string | readonly string[] | undefined;
            } | undefined;
            readonly displaySurface?: string | readonly string[] | {
                readonly exact?: string | readonly string[] | undefined;
                readonly ideal?: string | readonly string[] | undefined;
            } | undefined;
            readonly echoCancellation?: string | boolean | {
                readonly exact?: boolean | string | undefined;
                readonly ideal?: boolean | string | undefined;
            } | undefined;
            readonly facingMode?: string | readonly string[] | {
                readonly exact?: string | readonly string[] | undefined;
                readonly ideal?: string | readonly string[] | undefined;
            } | undefined;
            readonly frameRate?: number | {
                readonly exact?: number | undefined;
                readonly ideal?: number | undefined;
                readonly max?: number | undefined;
                readonly min?: number | undefined;
            } | undefined;
            readonly groupId?: string | readonly string[] | {
                readonly exact?: string | readonly string[] | undefined;
                readonly ideal?: string | readonly string[] | undefined;
            } | undefined;
            readonly height?: number | {
                readonly exact?: number | undefined;
                readonly ideal?: number | undefined;
                readonly max?: number | undefined;
                readonly min?: number | undefined;
            } | undefined;
            readonly noiseSuppression?: boolean | {
                readonly exact?: boolean | undefined;
                readonly ideal?: boolean | undefined;
            } | undefined;
            readonly sampleRate?: number | {
                readonly exact?: number | undefined;
                readonly ideal?: number | undefined;
                readonly max?: number | undefined;
                readonly min?: number | undefined;
            } | undefined;
            readonly sampleSize?: number | {
                readonly exact?: number | undefined;
                readonly ideal?: number | undefined;
                readonly max?: number | undefined;
                readonly min?: number | undefined;
            } | undefined;
            readonly width?: number | {
                readonly exact?: number | undefined;
                readonly ideal?: number | undefined;
                readonly max?: number | undefined;
                readonly min?: number | undefined;
            } | undefined;
        }[] | undefined;
        readonly aspectRatio?: number | {
            readonly exact?: number | undefined;
            readonly ideal?: number | undefined;
            readonly max?: number | undefined;
            readonly min?: number | undefined;
        } | undefined;
        readonly autoGainControl?: boolean | {
            readonly exact?: boolean | undefined;
            readonly ideal?: boolean | undefined;
        } | undefined;
        readonly backgroundBlur?: boolean | {
            readonly exact?: boolean | undefined;
            readonly ideal?: boolean | undefined;
        } | undefined;
        readonly channelCount?: number | {
            readonly exact?: number | undefined;
            readonly ideal?: number | undefined;
            readonly max?: number | undefined;
            readonly min?: number | undefined;
        } | undefined;
        readonly deviceId?: string | readonly string[] | {
            readonly exact?: string | readonly string[] | undefined;
            readonly ideal?: string | readonly string[] | undefined;
        } | undefined;
        readonly displaySurface?: string | readonly string[] | {
            readonly exact?: string | readonly string[] | undefined;
            readonly ideal?: string | readonly string[] | undefined;
        } | undefined;
        readonly echoCancellation?: string | boolean | {
            readonly exact?: boolean | string | undefined;
            readonly ideal?: boolean | string | undefined;
        } | undefined;
        readonly facingMode?: string | readonly string[] | {
            readonly exact?: string | readonly string[] | undefined;
            readonly ideal?: string | readonly string[] | undefined;
        } | undefined;
        readonly frameRate?: number | {
            readonly exact?: number | undefined;
            readonly ideal?: number | undefined;
            readonly max?: number | undefined;
            readonly min?: number | undefined;
        } | undefined;
        readonly groupId?: string | readonly string[] | {
            readonly exact?: string | readonly string[] | undefined;
            readonly ideal?: string | readonly string[] | undefined;
        } | undefined;
        readonly height?: number | {
            readonly exact?: number | undefined;
            readonly ideal?: number | undefined;
            readonly max?: number | undefined;
            readonly min?: number | undefined;
        } | undefined;
        readonly noiseSuppression?: boolean | {
            readonly exact?: boolean | undefined;
            readonly ideal?: boolean | undefined;
        } | undefined;
        readonly sampleRate?: number | {
            readonly exact?: number | undefined;
            readonly ideal?: number | undefined;
            readonly max?: number | undefined;
            readonly min?: number | undefined;
        } | undefined;
        readonly sampleSize?: number | {
            readonly exact?: number | undefined;
            readonly ideal?: number | undefined;
            readonly max?: number | undefined;
            readonly min?: number | undefined;
        } | undefined;
        readonly width?: number | {
            readonly exact?: number | undefined;
            readonly ideal?: number | undefined;
            readonly max?: number | undefined;
            readonly min?: number | undefined;
        } | undefined;
    } | undefined;
    readonly willCaptureFrequently: boolean;
    readonly rgbToDepthParams: {
        readonly scale: number;
        readonly scaleX: number;
        readonly scaleY: number;
        readonly translateU: number;
        readonly translateV: number;
        readonly k1: number;
        readonly k2: number;
        readonly k3: number;
        readonly p1: number;
        readonly p2: number;
        readonly xc: number;
        readonly yc: number;
    };
    readonly cameraLabel?: string | undefined;
};

declare class SimulatorMediaDeviceInfo {
    deviceId: string;
    groupId: string;
    kind: MediaDeviceKind;
    label: string;
    constructor(deviceId?: string, groupId?: string, kind?: MediaDeviceKind, label?: string);
}

declare class SimulatorCamera {
    private renderer;
    private cameraCreated;
    private cameraInfo?;
    private mediaStream?;
    private canvas?;
    private context?;
    private fps;
    matchRenderingCamera: boolean;
    width: number;
    height: number;
    camera: THREE.PerspectiveCamera;
    constructor(renderer: THREE.WebGLRenderer);
    init(): void;
    createSimulatorCamera(): void;
    enumerateDevices(): Promise<SimulatorMediaDeviceInfo[]>;
    onBeforeSimulatorSceneRender(camera: THREE.Camera, renderScene: (_: THREE.Camera) => void): void;
    onSimulatorSceneRendered(): void;
    restartVideoTrack(): void;
    getMedia(constraints?: MediaTrackConstraints): MediaStream | null | undefined;
}

/**
 * Enum for video stream states.
 */
declare enum StreamState {
    IDLE = "idle",
    INITIALIZING = "initializing",
    STREAMING = "streaming",
    ERROR = "error",
    NO_DEVICES_FOUND = "no_devices_found"
}
type VideoStreamDetails = {
    force?: boolean;
    error?: Error;
};
interface VideoStreamEventMap<T> extends THREE.Object3DEventMap {
    statechange: {
        state: StreamState;
        details?: T;
    };
}
type VideoStreamGetSnapshotImageDataOptionsBase = {
    /** The target width, defaults to the video width. */
    width?: number;
    /** The target height, defaults to the video height. */
    height?: number;
};
type VideoStreamGetSnapshotImageDataOptions = VideoStreamGetSnapshotImageDataOptionsBase & {
    outputFormat: 'imageData';
};
type VideoStreamGetSnapshotBase64Options = VideoStreamGetSnapshotImageDataOptionsBase & {
    outputFormat: 'base64';
    mimeType?: string;
    quality?: number;
};
type VideoStreamGetSnapshotBlobOptions = VideoStreamGetSnapshotImageDataOptionsBase & {
    outputFormat: 'blob';
    mimeType?: string;
    quality?: number;
};
type VideoStreamGetSnapshotTextureOptions = VideoStreamGetSnapshotImageDataOptionsBase & {
    outputFormat?: 'texture';
};
type VideoStreamGetSnapshotOptions = VideoStreamGetSnapshotImageDataOptions | VideoStreamGetSnapshotBase64Options | VideoStreamGetSnapshotTextureOptions | VideoStreamGetSnapshotBlobOptions;
type VideoStreamOptions = {
    /** Hint for performance optimization for frequent captures. */
    willCaptureFrequently?: boolean;
};
/**
 * The base class for handling video streams (from camera or file), managing
 * the underlying <video> element, streaming state, and snapshot logic.
 */
declare class VideoStream<T extends VideoStreamDetails = VideoStreamDetails> extends Script<VideoStreamEventMap<T>> {
    loaded: boolean;
    width?: number;
    height?: number;
    aspectRatio?: number;
    texture: THREE.Texture;
    state: StreamState;
    protected stream_: MediaStream | null;
    protected video_: HTMLVideoElement;
    get video(): HTMLVideoElement;
    private willCaptureFrequently_;
    private frozenTexture_;
    private canvas_;
    private context_;
    /**
     * @param options - The configuration options.
     */
    constructor({ willCaptureFrequently }?: VideoStreamOptions);
    /**
     * Sets the stream's state and dispatches a 'statechange' event.
     * @param state - The new state.
     * @param details - Additional data for the event payload.
     */
    protected setState_(state: StreamState, details?: VideoStreamDetails | T): void;
    /**
     * Processes video metadata, sets dimensions, and resolves a promise.
     * @param resolve - The resolve function of the wrapping Promise.
     * @param reject - The reject function of the wrapping Promise.
     * @param allowRetry - Whether to allow a retry attempt on failure.
     */
    protected handleVideoStreamLoadedMetadata(resolve: () => void, reject: (_: Error) => void, allowRetry?: boolean): void;
    /**
     * Captures the current video frame.
     * @param options - The options for the snapshot.
     * @returns The captured data.
     */
    getSnapshot(options: VideoStreamGetSnapshotImageDataOptions): ImageData;
    getSnapshot(options: VideoStreamGetSnapshotBase64Options): Promise<string | null>;
    getSnapshot(options: VideoStreamGetSnapshotTextureOptions): THREE.Texture;
    getSnapshot(options: VideoStreamGetSnapshotBlobOptions): Promise<Blob | null>;
    /**
     * Stops the current video stream tracks.
     */
    protected stop_(): void;
    /**
     * Disposes of all resources used by this stream.
     */
    dispose(): void;
}

type MediaOrSimulatorMediaDeviceInfo = MediaDeviceInfo | SimulatorMediaDeviceInfo;
type XRDeviceCameraDetails = VideoStreamDetails & {
    width?: number;
    height?: number;
    aspectRatio?: number;
    device?: MediaOrSimulatorMediaDeviceInfo;
};
/**
 * Handles video capture from a device camera, manages the device list,
 * and reports its state using VideoStream's event model.
 */
declare class XRDeviceCamera extends VideoStream<XRDeviceCameraDetails> {
    private options;
    private static readonly XR_CAMERA_ACCESS_TIMEOUT_MS;
    simulatorCamera?: SimulatorCamera;
    rgbToDepthParams: RgbToDepthParams;
    protected videoConstraints_: MediaTrackConstraints;
    private isInitializing_;
    private availableDevices_;
    private currentDeviceIndex_;
    private currentTrackSettings_?;
    private renderer_?;
    private useXRCameraAccess_;
    private xrCameraTexture_?;
    private xrCameraAccessTimeout_;
    /**
     * @param options - The configuration options.
     */
    constructor(options: DeviceCameraOptions);
    /**
     * Retrieves the list of available video input devices.
     * @returns A promise that resolves with an
     * array of video devices.
     */
    getAvailableVideoDevices(): Promise<MediaOrSimulatorMediaDeviceInfo[]>;
    /**
     * Sets the renderer reference, needed for WebXR camera access fallback.
     */
    setRenderer(renderer: THREE.WebGLRenderer): void;
    /**
     * Initializes the camera based on the initial constraints.
     */
    init(): Promise<void>;
    protected getDeviceIdFromLabel(label: string): string | null;
    /**
     * Initializes the media stream from the user's camera. After the stream
     * starts, it updates the current device index based on the stream's active
     * track.
     */
    protected initStream_(): Promise<void>;
    /**
     * Sets the active camera by its device ID. Removes potentially conflicting
     * constraints such as facingMode.
     * @param deviceId - Device ID
     */
    setDeviceId(deviceId: string): Promise<void>;
    /**
     * Sets the active camera by its facing mode ('user' or 'environment').
     * @param facingMode - facing mode
     */
    setFacingMode(facingMode: VideoFacingModeEnum): Promise<void>;
    /**
     * Gets the list of enumerated video devices.
     */
    getAvailableDevices(): MediaOrSimulatorMediaDeviceInfo[];
    /**
     * Gets the currently active device info, if available.
     */
    getCurrentDevice(): MediaOrSimulatorMediaDeviceInfo | undefined;
    /**
     * Gets the settings of the currently active video track.
     */
    getCurrentTrackSettings(): MediaTrackSettings | undefined;
    /**
     * Gets the index of the currently active device.
     */
    getCurrentDeviceIndex(): number;
    /**
     * Whether the camera is using the WebXR Raw Camera Access API fallback.
     */
    get isUsingXRCameraAccess(): boolean;
    /**
     * Updates the camera texture from the WebXR Raw Camera Access API.
     * Must be called each frame from the render loop when in XR camera mode.
     */
    updateXRCamera(frame: XRFrame): void;
    registerSimulatorCamera(simulatorCamera: SimulatorCamera): void;
    private startXRCameraAccessFallback_;
    private isXRCameraAccessGranted_;
    private clearXRCameraAccessTimeout_;
}

type DeviceCameraParameters = {
    projectionMatrix: THREE.Matrix4;
    getCameraPose: (camera: THREE.Camera, xrCameras: THREE.WebXRArrayCamera, target: THREE.Matrix4) => void;
};
declare const DEVICE_CAMERA_PARAMETERS: {
    [key: string]: DeviceCameraParameters;
};
declare function getDeviceCameraClipFromView(renderCamera: THREE.PerspectiveCamera, deviceCamera: XRDeviceCamera, targetDevice: string): THREE.Matrix4;
declare function getDeviceCameraWorldFromView(renderCamera: THREE.PerspectiveCamera, xrCameras: THREE.WebXRArrayCamera | null, deviceCamera: XRDeviceCamera, targetDevice: string): THREE.Matrix4;
declare function getDeviceCameraWorldFromClip(renderCamera: THREE.PerspectiveCamera, xrCameras: THREE.WebXRArrayCamera | null, deviceCamera: XRDeviceCamera, targetDevice: string): THREE.Matrix4;
type CameraParametersSnapshot = {
    clipFromView: THREE.Matrix4;
    viewFromClip: THREE.Matrix4;
    worldFromView: THREE.Matrix4;
    worldFromClip: THREE.Matrix4;
};
/**
 * Whether a device-camera pose can currently be resolved. This is false during
 * the brief startup window before either the simulator camera is registered or
 * the WebXR session exposes its cameras. While false, camera parameters are
 * genuinely unavailable, and camera-dependent work should be skipped rather
 * than run against a camera that does not exist yet.
 *
 * @param deviceCamera - The device camera, if configured.
 * @param xrCameras - The WebXR array camera, or null outside an XR session.
 * @returns True once a camera pose can be resolved.
 */
declare function isDeviceCameraPoseAvailable(deviceCamera: XRDeviceCamera | undefined, xrCameras: THREE.WebXRArrayCamera | null): boolean;
/**
 * Builds a snapshot of the device camera's view/projection matrices, or returns
 * `null` while no camera pose is available yet (see
 * {@link isDeviceCameraPoseAvailable}). Returning `null` lets per-frame callers
 * skip cleanly during startup instead of throwing on every frame until a
 * camera appears.
 */
declare function getCameraParametersSnapshot(camera: THREE.PerspectiveCamera, xrCameras: THREE.WebXRArrayCamera | null, deviceCamera: XRDeviceCamera, targetDevice: string): CameraParametersSnapshot | null;
/**
 * Raycasts to the depth mesh to find the world position and normal at a given UV coordinate.
 * @param rgbUv - The UV coordinate to raycast from.
 * @param depthMeshSnapshot - The depth mesh to raycast against.
 * @param cameraParametersSnapshot - Parameters of the device camera relative to the render camera's world.
 * @returns The world position, normal, and depth at the given UV coordinate.
 */
declare function transformRgbUvToWorld(rgbUv: THREE.Vector2, depthMeshSnapshot: THREE.Mesh, cameraParametersSnapshot: {
    worldFromView: THREE.Matrix4;
    worldFromClip: THREE.Matrix4;
}): {
    worldPosition: THREE.Vector3;
    worldNormal: THREE.Vector3;
    depthInMeters: number;
} | null;
/**
 * Asynchronously crops an image (provided as a base64 string or ImageData) using a THREE.Box2 bounding box.
 * This function draws a specified portion of the image to a canvas and returns the canvas content as a new base64 string.
 * @param imageSource - The source image as a base64 string or ImageData object.
 * @param boundingBox - The bounding box with relative coordinates (0-1) for cropping.
 * @returns A promise that resolves with the base64 string of the cropped image.
 */
declare function cropImage(imageSource: string | ImageData, boundingBox: THREE.Box2): Promise<string>;

declare function intrinsicsToProjectionMatrix(K: number[], width: number, height: number, near: number, far: number, target: THREE.Matrix4): THREE.Matrix4;

/**
 * The number of hands tracked in a typical XR session (left and right).
 */
declare const NUM_HANDS = 2;
/**
 * The number of joints per hand tracked in a typical XR session.
 */
declare const HAND_JOINT_COUNT = 25;
/**
 * The pairs of joints as an adjcent list.
 */
declare const HAND_JOINT_IDX_CONNECTION_MAP: number[][];
/**
 * The pairs of bones' ids per angle as an adjcent list.
 */
declare const HAND_BONE_IDX_CONNECTION_MAP: number[][];
/**
 * A small depth offset (in meters) applied between layered UI elements to
 * prevent Z-fighting, which is a visual artifact where surfaces at similar
 * depths appear to flicker.
 */
declare const VIEW_DEPTH_GAP = 0.002;
/**
 * The THREE.js rendering layer used exclusively for objects that should only be
 * visible to the left eye's camera in stereoscopic rendering.
 */
declare const LEFT_VIEW_ONLY_LAYER = 1;
/**
 * The THREE.js rendering layer used exclusively for objects that should only be
 * visible to the right eye's camera in stereoscopic rendering.
 */
declare const RIGHT_VIEW_ONLY_LAYER = 2;
/**
 * The THREE.js rendering layer for virtual objects that should be realistically
 * occluded by real-world objects when depth sensing is active.
 */
declare const OCCLUDABLE_ITEMS_LAYER = 3;
/**
 * Layer used for rendering overlaid UI text. Currently only used for LabelView.
 */
declare const UI_OVERLAY_LAYER = 4;
/**
 * The default ideal width in pixels for requesting the device camera stream.
 * Corresponds to a 720p resolution.
 */
declare const DEFAULT_DEVICE_CAMERA_WIDTH = 1280;
/**
 * The default ideal height in pixels for requesting the device camera stream.
 * Corresponds to a 720p resolution.
 */
declare const DEFAULT_DEVICE_CAMERA_HEIGHT = 720;
declare const XR_BLOCKS_ASSETS_PATH = "https://cdn.jsdelivr.net/gh/xrblocks/assets@d872cfdb7668443da5cd38361fc3a3d131aca04c/";

declare class Raycaster extends THREE.Raycaster {
    sortFunction: (a: THREE.Intersection, b: THREE.Intersection) => number;
    /**
     * Intersects a single object with the raycaster, using the custom sort function.
     * @param object - The object to intersect with.
     * @param recursive - Whether to intersect with the object's children.
     * @param intersects - The array to store the intersections in.
     * @returns The intersections found.
     */
    intersectObject<TIntersected extends THREE.Object3D>(object: THREE.Object3D, recursive?: boolean, intersects?: Array<THREE.Intersection<TIntersected>>): Array<THREE.Intersection<TIntersected>>;
    /**
     * Intersects multiple objects with the raycaster, using the custom sort function.
     * @param objects - The objects to intersect with.
     * @param recursive - Whether to intersect with the objects' children.
     * @param intersects - The array to store the intersections in.
     * @returns The intersections found.
     */
    intersectObjects<TIntersected extends THREE.Object3D>(objects: THREE.Object3D[], recursive?: boolean, intersects?: Array<THREE.Intersection<TIntersected>>): Array<THREE.Intersection<TIntersected>>;
}

declare class ScreenshotSynthesizer {
    private pendingScreenshotRequests;
    private virtualCanvas?;
    private virtualBuffer;
    private virtualRenderTarget?;
    private virtualRealCanvas?;
    private virtualRealBuffer;
    private virtualRealRenderTarget?;
    private fullScreenQuad?;
    private renderTargetWidth;
    onAfterRender(renderer: THREE.WebGLRenderer, renderSceneFn: () => void, deviceCamera?: XRDeviceCamera): Promise<void>;
    private createVirtualImageDataURL;
    private resolveVirtualOnlyRequests;
    private createVirtualRealImageDataURL;
    private resolveVirtualRealRequests;
    private getFullScreenQuad;
    /**
     * Requests a screenshot from the scene as a DataURL.
     * @param overlayOnCamera - If true, overlays the image on a camera image
     *     without any projection or aspect ratio correction.
     * @returns Promise which returns the screenshot as a data uri.
     */
    getScreenshot(overlayOnCamera?: boolean): Promise<string>;
}

declare enum ScriptsManagerEventType {
    EXCEPTION = "exception"
}
type ScriptsManagerEventMap = THREE.Object3DEventMap & {
    [ScriptsManagerEventType.EXCEPTION]: {
        scriptName: string;
        context: string;
        error: Error;
        timestamp: number;
    };
};
declare class ScriptsManager extends THREE.EventDispatcher<ScriptsManagerEventMap> {
    private initScriptFunction;
    /** The set of all currently initialized scripts. */
    scripts: Set<Script<THREE.Object3DEventMap>>;
    /** The set of scripts currently being initialized. */
    private initializingScripts;
    private seenScripts;
    private syncPromises;
    /** Whether to catch all exceptions thrown by developer scripts. */
    catchExceptions: boolean;
    constructor(initScriptFunction: (script: Script) => Promise<void>);
    private handleException;
    /**
     * Initializes a script and adds it to the set of scripts which will receive
     * callbacks. This will be called automatically by Core when a script is found
     * in the scene but can also be called manually.
     * @param script - The script to initialize
     * @returns A promise which resolves when the script is initialized.
     */
    initScript(script: Script): Promise<void>;
    /**
     * Uninitializes a script calling dispose and removes it from the set of
     * scripts which will receive callbacks.
     * @param script - The script to uninitialize.
     */
    uninitScript(script: Script): void;
    /**
     * Helper for scene traversal to avoid closure allocation.
     */
    private checkScript;
    /**
     * Finds all scripts in the scene and initializes them or uninitailizes them.
     * Returns a promise which resolves when all new scripts are finished
     * initalizing.
     * @param scene - The main scene which is used to find scripts.
     */
    syncScriptsWithScene(scene: THREE.Scene): Promise<PromiseSettledResult<void>[]>;
    resetUX: () => void;
    callSelecting: (controller: Controller) => void;
    callSqueezing: (controller: Controller) => void;
    update: (time: number, frame: XRFrame) => void;
    physicsStep: () => void;
    callSelectStart: (event: SelectEvent) => void;
    callSelectEnd: (event: SelectEvent) => void;
    callSelect: (event: SelectEvent) => void;
    callSqueezeStart: (event: SelectEvent) => void;
    callSqueezeEnd: (event: SelectEvent) => void;
    callSqueeze: (event: SelectEvent) => void;
    callKeyDown: (event: KeyEvent) => void;
    callKeyUp: (event: KeyEvent) => void;
    onXRSessionStarted: (session: XRSession) => void;
    onXRSessionEnded: () => void;
    onSimulatorStarted: () => void;
}

declare class WaitFrame {
    private callbacks;
    /**
     * Executes all registered callbacks and clears the list.
     */
    onFrame(): void;
    /**
     * Wait for the next frame.
     */
    waitFrame(): Promise<void>;
}

/**
 * Interface representing the result of a permission request.
 */
interface PermissionResult {
    granted: boolean;
    status: PermissionState | 'unknown' | 'error';
    error?: string;
}
interface PermissionRequestOptions {
    allowVideoFallback?: boolean;
}
/**
 * A utility class to manage and request browser permissions for
 * Location, Camera, and Microphone.
 */
declare class PermissionsManager {
    /**
     * Requests permission to access the user's geolocation.
     * Note: This actually attempts to fetch the position to trigger the prompt.
     */
    requestLocationPermission(): Promise<PermissionResult>;
    /**
     * Requests permission to access the microphone.
     * Opens a stream to trigger the prompt, then immediately closes it.
     */
    requestMicrophonePermission(): Promise<PermissionResult>;
    /**
     * Requests permission to access the camera.
     * Opens a stream to trigger the prompt, then immediately closes it.
     */
    requestCameraPermission(options?: PermissionRequestOptions): Promise<PermissionResult>;
    /**
     * Requests permission for both camera and microphone simultaneously.
     */
    requestAVPermission(): Promise<PermissionResult>;
    /**
     * Internal helper to handle getUserMedia requests.
     * Crucially, this stops the tracks immediately after permission is granted
     * so the hardware doesn't remain active.
     */
    private requestMediaPermission;
    private shouldAllowVideoFallback;
    private isVideoOnlyRequest;
    /**
     * Requests multiple permissions sequentially.
     * Returns a single result: granted is true only if ALL requested permissions are granted.
     */
    checkAndRequestPermissions({ geolocation, camera, microphone, }: {
        geolocation?: boolean;
        camera?: boolean;
        microphone?: boolean;
    }, options?: PermissionRequestOptions): Promise<PermissionResult>;
    /**
     * Checks the current status of a permission without triggering a prompt.
     * Useful for UI state (e.g., disabling buttons if already denied).
     * * @param permissionName - 'geolocation', 'camera', or 'microphone'
     */
    checkPermissionStatus(permissionName: 'geolocation' | 'camera' | 'microphone'): Promise<PermissionState | 'unknown'>;
}

declare enum WebXRSessionEventType {
    UNSUPPORTED = "unsupported",
    READY = "ready",
    SESSION_START = "sessionstart",
    SESSION_END = "sessionend"
}
type WebXRSessionManagerEventMap = THREE.Object3DEventMap & {
    [WebXRSessionEventType.UNSUPPORTED]: object;
    [WebXRSessionEventType.READY]: {
        sessionOptions: XRSessionInit;
    };
    [WebXRSessionEventType.SESSION_START]: {
        session: XRSession;
    };
    [WebXRSessionEventType.SESSION_END]: object;
};
/**
 * Manages the WebXR session lifecycle by extending THREE.EventDispatcher
 * to broadcast its state to any listener.
 */
declare class WebXRSessionManager extends THREE.EventDispatcher<WebXRSessionManagerEventMap> {
    private renderer;
    private sessionInit;
    private mode;
    currentSession?: XRSession;
    private sessionOptions?;
    private xrModeSupported?;
    private waitingForXRSession;
    constructor(renderer: THREE.WebGLRenderer, sessionInit: XRSessionInit, mode: XRSessionMode);
    /**
     * Checks for WebXR support and availability of the requested session mode.
     * This should be called to initialize the manager and trigger the first
     * events.
     */
    initialize(): Promise<void>;
    /**
     * Ends the WebXR session.
     */
    startSession(): void;
    /**
     * Ends the WebXR session.
     */
    endSession(): void;
    /**
     * Returns whether XR is supported. Will be undefined until initialize is
     * complete.
     */
    isXRSupported(): boolean | undefined;
    getSessionOptions(): XRSessionInit | undefined;
    /** Internal callback for when a session successfully starts. */
    private onSessionStartedInternal;
    /** Internal callback for when the session ends. */
    private onSessionEndedInternal;
}

declare class XRButton {
    private sessionManager;
    private permissionsManager;
    private appTitle;
    private appDescription;
    private startText;
    private endText;
    private invalidText;
    private startSimulatorText;
    startSimulator: () => void;
    private permissions;
    domElement: HTMLDivElement;
    simulatorButtonElement: HTMLButtonElement;
    xrButtonElement: HTMLButtonElement;
    constructor(sessionManager: WebXRSessionManager, permissionsManager: PermissionsManager, appTitle?: string, appDescription?: string, startText?: string, endText?: string, invalidText?: string, startSimulatorText?: string, showEnterSimulatorButton?: boolean, startSimulator?: () => void, permissions?: {
        geolocation: boolean;
        camera: boolean;
        microphone: boolean;
    });
    private createSimulatorButton;
    private createXRAppTitle;
    private createXRAppDescription;
    private createXRButtonElement;
    private onSessionReady;
    private showXRNotSupported;
    private onSessionStarted;
    private onSessionEnded;
}

declare class XRPass extends Pass {
    render(_renderer: THREE.WebGLRenderer, _writeBuffer: THREE.WebGLRenderTarget, _readBuffer: THREE.WebGLRenderTarget, _deltaTime: number, _maskActive: boolean, _viewId?: number): void;
}
/**
 * XREffects manages the XR rendering pipeline.
 * Use core.effects
 * It handles multiple passes and render targets for applying effects to XR
 * scenes.
 */
declare class XREffects {
    private renderer;
    private scene;
    private timer;
    passes: XRPass[];
    renderTargets: THREE.WebGLRenderTarget[];
    dimensions: THREE.Vector2;
    constructor(renderer: THREE.WebGLRenderer, scene: THREE.Scene, timer: THREE.Timer);
    /**
     * Adds a pass to the effect pipeline.
     */
    addPass(pass: XRPass): void;
    /**
     * Sets up render targets for the effect pipeline.
     */
    setupRenderTargets(dimensions: THREE.Vector2): void;
    /**
     * Renders the XR effects.
     */
    render(): void;
    private renderXr;
    private renderSimulator;
}

declare class DepthMeshOptions {
    enabled: boolean;
    updateVertexNormals: boolean;
    showDebugTexture: boolean;
    useDepthTexture: boolean;
    renderShadow: boolean;
    shadowOpacity: number;
    patchHoles: boolean;
    patchHolesUpper: boolean;
    opacity: number;
    useDualCollider: boolean;
    useDownsampledGeometry: boolean;
    updateFullResolutionGeometry: boolean;
    colliderUpdateFps: number;
    /** FPS cap for depth mesh geometry updates. 0 = update every frame. */
    depthMeshUpdateFps: number;
    depthFullResolution: number;
    ignoreEdgePixels: number;
}
declare class DepthOptions {
    debugging: boolean;
    enabled: boolean;
    depthMesh: DepthMeshOptions;
    depthTexture: {
        enabled: boolean;
        constantKernel: boolean;
        applyGaussianBlur: boolean;
        applyKawaseBlur: boolean;
    };
    occlusion: {
        enabled: boolean;
    };
    usagePreference: XRDepthUsage[];
    dataFormatPreference: XRDepthDataFormat[];
    depthTypeRequest: XRDepthType[];
    matchDepthView: boolean;
    constructor(options?: DeepReadonly<DeepPartial<DepthOptions>>);
}
declare const xrDepthMeshOptions: {
    readonly debugging: boolean;
    readonly enabled: boolean;
    readonly depthMesh: {
        readonly enabled: boolean;
        readonly updateVertexNormals: boolean;
        readonly showDebugTexture: boolean;
        readonly useDepthTexture: boolean;
        readonly renderShadow: boolean;
        readonly shadowOpacity: number;
        readonly patchHoles: boolean;
        readonly patchHolesUpper: boolean;
        readonly opacity: number;
        readonly useDualCollider: boolean;
        readonly useDownsampledGeometry: boolean;
        readonly updateFullResolutionGeometry: boolean;
        readonly colliderUpdateFps: number;
        readonly depthMeshUpdateFps: number;
        readonly depthFullResolution: number;
        readonly ignoreEdgePixels: number;
    };
    readonly depthTexture: {
        readonly enabled: boolean;
        readonly constantKernel: boolean;
        readonly applyGaussianBlur: boolean;
        readonly applyKawaseBlur: boolean;
    };
    readonly occlusion: {
        readonly enabled: boolean;
    };
    readonly usagePreference: readonly XRDepthUsage[];
    readonly dataFormatPreference: readonly XRDepthDataFormat[];
    readonly depthTypeRequest: readonly XRDepthType[];
    readonly matchDepthView: boolean;
};
declare const xrDepthMeshVisualizationOptions: {
    readonly debugging: boolean;
    readonly enabled: boolean;
    readonly depthMesh: {
        readonly enabled: boolean;
        readonly updateVertexNormals: boolean;
        readonly showDebugTexture: boolean;
        readonly useDepthTexture: boolean;
        readonly renderShadow: boolean;
        readonly shadowOpacity: number;
        readonly patchHoles: boolean;
        readonly patchHolesUpper: boolean;
        readonly opacity: number;
        readonly useDualCollider: boolean;
        readonly useDownsampledGeometry: boolean;
        readonly updateFullResolutionGeometry: boolean;
        readonly colliderUpdateFps: number;
        readonly depthMeshUpdateFps: number;
        readonly depthFullResolution: number;
        readonly ignoreEdgePixels: number;
    };
    readonly depthTexture: {
        readonly enabled: boolean;
        readonly constantKernel: boolean;
        readonly applyGaussianBlur: boolean;
        readonly applyKawaseBlur: boolean;
    };
    readonly occlusion: {
        readonly enabled: boolean;
    };
    readonly usagePreference: readonly XRDepthUsage[];
    readonly dataFormatPreference: readonly XRDepthDataFormat[];
    readonly depthTypeRequest: readonly XRDepthType[];
    readonly matchDepthView: boolean;
};
declare const xrDepthMeshPhysicsOptions: {
    readonly debugging: boolean;
    readonly enabled: boolean;
    readonly depthMesh: {
        readonly enabled: boolean;
        readonly updateVertexNormals: boolean;
        readonly showDebugTexture: boolean;
        readonly useDepthTexture: boolean;
        readonly renderShadow: boolean;
        readonly shadowOpacity: number;
        readonly patchHoles: boolean;
        readonly patchHolesUpper: boolean;
        readonly opacity: number;
        readonly useDualCollider: boolean;
        readonly useDownsampledGeometry: boolean;
        readonly updateFullResolutionGeometry: boolean;
        readonly colliderUpdateFps: number;
        readonly depthMeshUpdateFps: number;
        readonly depthFullResolution: number;
        readonly ignoreEdgePixels: number;
    };
    readonly depthTexture: {
        readonly enabled: boolean;
        readonly constantKernel: boolean;
        readonly applyGaussianBlur: boolean;
        readonly applyKawaseBlur: boolean;
    };
    readonly occlusion: {
        readonly enabled: boolean;
    };
    readonly usagePreference: readonly XRDepthUsage[];
    readonly dataFormatPreference: readonly XRDepthDataFormat[];
    readonly depthTypeRequest: readonly XRDepthType[];
    readonly matchDepthView: boolean;
};

declare class DepthTextures {
    private options;
    private float32Arrays;
    private uint8Arrays;
    private dataTextures;
    private nativeTextures;
    depthData: XRCPUDepthInformation[];
    constructor(options: DepthOptions);
    private createDataDepthTextures;
    updateData(depthData: XRCPUDepthInformation, viewId: number, depthDataFormat: XRDepthDataFormat): void;
    updateNativeTexture(depthData: XRWebGLDepthInformation, renderer: THREE.WebGLRenderer, viewId: number): void;
    get(viewId: number): THREE.DataTexture | THREE.ExternalTexture;
}

declare class DepthMesh extends MeshScript {
    private depthOptions;
    private depthTextures?;
    static dependencies: {
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
    downsampledGeometry?: THREE.BufferGeometry;
    downsampledMesh?: THREE.Mesh;
    private collider?;
    private colliders;
    private colliderUpdateFps;
    private renderer;
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
    init({ renderer }: {
        renderer: THREE.WebGLRenderer;
    }): void;
    /**
     * Updates the depth data and geometry positions based on the provided camera
     * and depth data.
     */
    updateDepth(depthData: Readonly<XRCPUDepthInformation>, projectionMatrixInverse: Readonly<THREE.Matrix4>, depthDataFormat: XRDepthDataFormat): void;
    updatePose(translation: THREE.Vector3, quaternion: THREE.Quaternion): void;
    /**
     * Method to manually update the full resolution geometry.
     * Only needed if options.updateFullResolutionGeometry is false.
     */
    updateFullResolutionGeometry(depthData: XRCPUDepthInformation, depthDataFormat: XRDepthDataFormat): void;
    /**
     * Internal method to update the geometry of the depth mesh.
     */
    private updateGeometry;
    /**
     * Optimizes collider updates to run periodically based on the specified FPS.
     */
    private updateColliderIfNeeded;
    initRapierPhysics(RAPIER: typeof RAPIER_NS, blendedWorld: RAPIER_NS.World): void;
    /**
     * Customizes raycasting to compute normals for intersections.
     * @param raycaster - The raycaster object.
     * @param intersects - Array to store intersections.
     * @returns - True if intersections are found.
     */
    raycast(raycaster: THREE.Raycaster, intersects: THREE.Intersection[]): boolean;
    getColliderFromHandle(handle: RAPIER_NS.ColliderHandle): RAPIER_NS.Collider | undefined;
}

type DepthArray = Float32Array | Uint16Array;
declare class Depth {
    static instance?: Depth;
    private camera;
    private renderer;
    private gpuDepthConverter?;
    enabled: boolean;
    view: XRView[];
    cpuDepthData: XRCPUDepthInformation[];
    gpuDepthData: XRWebGLDepthInformation[];
    depthArray: DepthArray[];
    depthDataFormat?: XRDepthDataFormat;
    depthMesh?: DepthMesh;
    private depthTextures?;
    options: DepthOptions;
    width: number;
    height: number;
    get rawValueToMeters(): number;
    occludableShaders: Set<Shader>;
    private occlusionPass?;
    private depthClientsInitialized;
    private depthClients;
    depthProjectionMatrices: THREE.Matrix4[];
    depthProjectionInverseMatrices: THREE.Matrix4[];
    depthViewMatrices: THREE.Matrix4[];
    depthViewProjectionMatrices: THREE.Matrix4[];
    depthCameraPositions: THREE.Vector3[];
    depthCameraRotations: THREE.Quaternion[];
    /**
     * Transforms from normalized view coordinates to normalized depth buffer
     * coordinates. Identity when matchDepthView is true.
     */
    normDepthBufferFromNormViewMatrices: THREE.Matrix4[];
    /** Timestamp of the last depth mesh geometry update. */
    private lastDepthMeshUpdateTime;
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
     * Note: The UV coordinates are with respect to the user's view, not the depth camera view.
     * @param u - Normalized horizontal coordinate.
     * @param v - Normalized vertical coordinate.
     * @returns Depth value at the specified coordinates.
     */
    getDepth(u: number, v: number): number;
    /**
     * Projects the given world position to depth camera's clip space and then
     * to the depth camera's view space using the depth.
     * @param position - The world position to project.
     * @returns The depth camera view space position.
     */
    getProjectedDepthViewPositionFromWorldPosition(position: THREE.Vector3, target?: THREE.Vector3): THREE.Vector3;
    /**
     * Retrieves the depth at normalized coordinates (u, v).
     * Note: The UV coordinates are with respect to the user's view, not the depth camera view.
     * @param u - Normalized horizontal coordinate.
     * @param v - Normalized vertical coordinate.
     * @returns Vertex at (u, v)
     */
    getVertex(u: number, v: number): THREE.Vector3 | null;
    private updateDepthMatrices;
    updateCPUDepthData(depthData: XRCPUDepthInformation, viewId: number, depthDataFormat: XRDepthDataFormat): void;
    updateGPUDepthData(depthData: XRWebGLDepthInformation, viewId: number): void;
    /**
     * Checks whether the depth mesh geometry should be updated this frame,
     * based on the configured depthMeshUpdateFps. The pose is always updated
     * every frame so the mesh tracks the depth camera smoothly, but the
     * expensive geometry rebuild can be throttled.
     */
    private shouldUpdateDepthMesh;
    getTexture(viewId: number): THREE.DataTexture | THREE.ExternalTexture | undefined;
    update(frame?: XRFrame): void;
    updateLocalDepth(frame: XRFrame): void;
    renderOcclusionPass(): void;
    debugLog(): void;
    resumeDepth(client: object): void;
    pauseDepth(client: object): void;
    /**
     * Manually updates the depth mesh geometry using the cached depth.
     */
    updateFullResolutionDepthMesh(): void;
}

declare const HAND_JOINT_NAMES: readonly ["wrist", "thumb-metacarpal", "thumb-phalanx-proximal", "thumb-phalanx-distal", "thumb-tip", "index-finger-metacarpal", "index-finger-phalanx-proximal", "index-finger-phalanx-intermediate", "index-finger-phalanx-distal", "index-finger-tip", "middle-finger-metacarpal", "middle-finger-phalanx-proximal", "middle-finger-phalanx-intermediate", "middle-finger-phalanx-distal", "middle-finger-tip", "ring-finger-metacarpal", "ring-finger-phalanx-proximal", "ring-finger-phalanx-intermediate", "ring-finger-phalanx-distal", "ring-finger-tip", "pinky-finger-metacarpal", "pinky-finger-phalanx-proximal", "pinky-finger-phalanx-intermediate", "pinky-finger-phalanx-distal", "pinky-finger-tip"];

type JointName = (typeof HAND_JOINT_NAMES)[number];
/**
 * Utility class for managing WebXR hand tracking data based on
 * reported Handedness.
 */
/**
 * Enum for handedness, using WebXR standard strings.
 */
declare enum Handedness {
    NONE = -1,// Represents unknown or unspecified handedness
    LEFT = 0,
    RIGHT = 1
}
/**
 * Represents and provides access to WebXR hand tracking data.
 * Uses the 'handedness' property of input hands for identification.
 */
declare class Hands {
    hands: THREE.XRHandSpace[];
    dominant: Handedness;
    /**
     * @param hands - An array containing XRHandSpace objects from Three.js.
     */
    constructor(hands: THREE.XRHandSpace[]);
    /**
     * Retrieves a specific joint object for a given hand.
     * @param jointName - The name of the joint to retrieve (e.g.,
     *     'index-finger-tip').
     * @param targetHandednessEnum - The hand enum value
     *     (Handedness.LEFT or Handedness.RIGHT)
     *        to retrieve the joint from. If Handedness.NONE, uses the dominant
     * hand.
     * @returns The requested joint object, or null if not
     *     found or invalid input.
     */
    getJoint(jointName: JointName, targetHandednessEnum: Handedness): THREE.XRJointSpace | undefined;
    /**
     * Gets the index finger tip joint.
     * @param handedness - Optional handedness
     *     ('left'/'right'),
     * defaults to NONE (uses dominant hand).
     * @returns The joint object or null.
     */
    getIndexTip(handedness?: Handedness): THREE.XRJointSpace | undefined;
    /**
     * Gets the thumb tip joint.
     * @param handedness - Optional handedness
     *     ('left'/'right'),
     * defaults to NONE (uses dominant hand).
     * @returns The joint object or null.
     */
    getThumbTip(handedness?: Handedness): THREE.XRJointSpace | undefined;
    /**
     * Gets the middle finger tip joint.
     * @param handedness - Optional handedness
     *     ('left'/'right'),
     * defaults to NONE (uses dominant hand).
     * @returns The joint object or null.
     */
    getMiddleTip(handedness?: Handedness): THREE.XRJointSpace | undefined;
    /**
     * Gets the ring finger tip joint.
     * @param handedness - Optional handedness
     *     ('left'/'right'),
     * defaults to NONE (uses dominant hand).
     * @returns The joint object or null.
     */
    getRingTip(handedness?: Handedness): THREE.XRJointSpace | undefined;
    /**
     * Gets the pinky finger tip joint.
     * @param handedness - Optional handedness
     *     ('left'/'right'),
     * defaults to NONE (uses dominant hand).
     * @returns The joint object or null.
     */
    getPinkyTip(handedness?: Handedness): THREE.XRJointSpace | undefined;
    /**
     * Gets the wrist joint.
     * @param handedness - Optional handedness enum value
     *     (LEFT/RIGHT/NONE),
     * defaults to NONE (uses dominant hand).
     * @returns The joint object or null.
     */
    getWrist(handedness?: Handedness): THREE.XRJointSpace | undefined;
    /**
     * Generates a string representation of the hand joint data for both hands.
     * Always lists LEFT hand data first, then RIGHT hand data, if available.
     * @returns A string containing position data for all available
     * joints.
     */
    toString(): string;
    /**
     * Converts the pose data (position and quaternion) of all joints for both
     * hands into a single flat array. Each joint is represented by 7 numbers
     * (3 for position, 4 for quaternion). Missing joints or hands are represented
     * by zeros. Ensures a consistent output order: all left hand joints first,
     * then all right hand joints.
     * @returns A flat array containing position (x, y, z) and
     * quaternion (x, y, z, w) data for all joints, ordered [left...,
     * right...]. Size is always 2 * HAND_JOINT_NAMES.length * 7.
     */
    toPositionQuaternionArray(): number[];
    /**
     * Checks for the availability of hand data.
     * If an integer (0 for LEFT, 1 for RIGHT) is provided, it checks for that
     * specific hand. If no integer is provided, it checks that data for *both*
     * hands is available.
     * @param handIndex - Optional. The index of the hand to validate
     *     (0 or 1).
     * @returns `true` if the specified hand(s) have data, `false`
     *     otherwise.
     */
    isValid(handIndex?: number): boolean;
}

declare class HandsOptions {
    /** Whether hand tracking is enabled. */
    enabled: boolean;
    /** Whether to show any hand visualization. */
    visualization: boolean;
    /** Whether to show the tracked hand joints. */
    visualizeJoints: boolean;
    /** Whether to show the virtual hand meshes. */
    visualizeMeshes: boolean;
    debugging: boolean;
    constructor(options?: DeepReadonly<DeepPartial<HandsOptions>>);
    /**
     * Enables hands tracking.
     * @returns The instance for chaining.
     */
    enableHands(): this;
    enableHandsVisualization(): this;
}

type HandLabel = 'left' | 'right';
declare const HAND_INDEX_TO_LABEL: Partial<Record<Handedness, HandLabel>>;
type JointPositions = Map<JointName, THREE.Vector3>;
interface HandContext {
    handedness: Handedness;
    handLabel: HandLabel;
    joints: JointPositions;
    getJoint(jointName: JointName): THREE.Vector3 | undefined;
}
type GestureDetectionResult = {
    confidence: number;
    data?: Record<string, unknown>;
};
type GestureScoreMap = Record<string, GestureDetectionResult | undefined>;
type HeuristicGestureDetector = (context: HandContext, config: GestureConfiguration) => GestureDetectionResult | undefined;
interface GestureRecognizer {
    init?(): Promise<void>;
    recognize(context: HandContext): GestureScoreMap | Promise<GestureScoreMap>;
    getGestureConfigurations?(): Record<string, GestureConfiguration>;
    dispose?(): void;
}
interface PoseEstimator {
    init?(dependencies?: {
        user?: User;
    }): Promise<void>;
    getHandContext(handedness: Handedness): HandContext | null;
    getHandContexts(): Partial<Record<HandLabel, HandContext>>;
    dispose?(): void;
}

type GestureConfiguration = {
    enabled: boolean;
    threshold?: number;
};
declare class GestureRecognitionOptions {
    enabled: boolean;
    minimumConfidence: number;
    updateIntervalMs: number;
    poseEstimator: PoseEstimator;
    gestureRecognizer: GestureRecognizer;
    gestures: Record<string, GestureConfiguration>;
    constructor(options?: DeepReadonly<DeepPartial<GestureRecognitionOptions>>);
    enable(): this;
    setGestureEnabled(name: string, enabled: boolean): this;
    setPoseEstimator(poseEstimator: PoseEstimator): this;
    setGestureRecognizer(gestureRecognizer: GestureRecognizer): this;
    setGestureConfig(name: string, config: Partial<GestureConfiguration>): this;
    private applyGestureRecognizerConfigurations;
}

type StrokeProvider = 'onedollar';
declare class StrokeRecognitionOptions {
    /** Master switch for the stroke recognition block. */
    enabled: boolean;
    /**
     * Configuration for the stroke recognition provider.
     */
    providerConfig: {
        /**
         * Backing provider that recognizes strokes.
         *  - 'onedollar': $1 Unistroke recognizer.
         */
        provider: StrokeProvider;
        /**
         * Options specific to the 'onedollar' provider.
         */
        onedollar: {
            supportedShapes: string[];
        };
    };
    /**
     * Delay in seconds after gesture start before recording points.
     */
    startDelay: number;
    /**
     * Delay in seconds to ignore points before gesture end.
     */
    endDelay: number;
    /**
     * The hand joint to track for stroke recognition.
     */
    joint: JointName;
    /**
     * Maximum number of points to capture in a single stroke.
     */
    maxPoints: number;
    constructor(options?: DeepReadonly<DeepPartial<StrokeRecognitionOptions>>);
    enable(): this;
}

/**
 * Default options for controlling Lighting module features.
 */
declare class LightingOptions {
    /** Enables debugging renders and logs. */
    debugging: boolean;
    /** Enables XR lighting. */
    enabled: boolean;
    /** Add ambient spherical harmonics to lighting. */
    useAmbientSH: boolean;
    /** Add main diredtional light to lighting. */
    useDirectionalLight: boolean;
    /** Cast shadows using diretional light. */
    castDirectionalLightShadow: boolean;
    /**
     * Adjust hardness of shadows according to relative brightness of main light.
     */
    useDynamicSoftShadow: boolean;
    constructor(options?: DeepReadonly<DeepPartial<LightingOptions>>);
}

/**
 * A frozen object containing standardized string values for `event.code`.
 * Used for desktop simulation.
 */
declare enum Keycodes {
    W_CODE = "KeyW",
    A_CODE = "KeyA",
    S_CODE = "KeyS",
    D_CODE = "KeyD",
    UP = "ArrowUp",
    DOWN = "ArrowDown",
    LEFT = "ArrowLeft",
    RIGHT = "ArrowRight",
    Q_CODE = "KeyQ",// Often used for 'down' or 'strafe left'
    E_CODE = "KeyE",// Often used for 'up' or 'strafe right'
    PAGE_UP = "PageUp",
    PAGE_DOWN = "PageDown",
    SPACE_CODE = "Space",
    ENTER_CODE = "Enter",
    T_CODE = "KeyT",// General purpose 'toggle' or 'tool' key
    LEFT_SHIFT_CODE = "ShiftLeft",
    RIGHT_SHIFT_CODE = "ShiftRight",
    LEFT_CTRL_CODE = "ControlLeft",
    RIGHT_CTRL_CODE = "ControlRight",
    LEFT_ALT_CODE = "AltLeft",
    RIGHT_ALT_CODE = "AltRight",
    CAPS_LOCK_CODE = "CapsLock",
    ESCAPE_CODE = "Escape",
    TAB_CODE = "Tab",
    B_CODE = "KeyB",
    C_CODE = "KeyC",
    F_CODE = "KeyF",
    G_CODE = "KeyG",
    H_CODE = "KeyH",
    I_CODE = "KeyI",
    J_CODE = "KeyJ",
    K_CODE = "KeyK",
    L_CODE = "KeyL",
    M_CODE = "KeyM",
    N_CODE = "KeyN",
    O_CODE = "KeyO",
    P_CODE = "KeyP",
    R_CODE = "KeyR",
    U_CODE = "KeyU",
    V_CODE = "KeyV",
    X_CODE = "KeyX",
    Y_CODE = "KeyY",
    Z_CODE = "KeyZ",
    DIGIT_0 = "Digit0",
    DIGIT_1 = "Digit1",
    DIGIT_2 = "Digit2",
    DIGIT_3 = "Digit3",
    DIGIT_4 = "Digit4",
    DIGIT_5 = "Digit5",
    DIGIT_6 = "Digit6",
    DIGIT_7 = "Digit7",
    DIGIT_8 = "Digit8",
    DIGIT_9 = "Digit9",
    BACKQUOTE = "Backquote"
}

declare enum SimulatorMode {
    USER = "User",
    POSE = "Navigation",
    CONTROLLER = "Hands",
    POINTER_LOCK = "PointerLock"
}
interface SimulatorCustomInstruction {
    header: string | TemplateResult;
    videoSrc?: string;
    description: string | TemplateResult;
}
interface SimulatorEnvironment {
    name: string;
    scenePath?: string | null;
    scenePlanesPath?: string | null;
    navMeshPath?: string | null;
    videoPath?: string;
}
declare class SimulatorOptions {
    initialCameraPosition: {
        x: number;
        y: number;
        z: number;
    };
    environments: SimulatorEnvironment[];
    activeEnvironmentIndex: number;
    initialScenePosition: {
        x: number;
        y: number;
        z: number;
    };
    defaultMode: SimulatorMode;
    defaultHand: Handedness;
    modeToggle: {
        enabled: boolean;
        toggleKey: Keycodes | null;
        toggleOrder: {
            User: SimulatorMode;
            Navigation: SimulatorMode;
            Hands: SimulatorMode;
            PointerLock: SimulatorMode;
        };
    };
    simulatorSettingsPanel: {
        enabled: boolean;
        element: string;
    };
    instructions: {
        enabled: boolean;
        showAutomatically: boolean;
        element: string;
        customInstructions: SimulatorCustomInstruction[];
    };
    handPosePanel: {
        enabled: boolean;
        element: string;
    };
    geminiLivePanel: {
        enabled: boolean;
        element: string;
    };
    stereo: {
        enabled: boolean;
    };
    navMesh: {
        enabled: boolean;
        eyeHeight: number;
    };
    deviceCamera: {
        enabled: boolean;
    };
    renderToRenderTexture: boolean;
    blendingMode: 'normal' | 'screen';
    /** Limits how far each hand controller can travel from the user's shoulder origin. */
    reachDistance: {
        enabled: boolean;
        /** The maximum distance in meters a controller can move from its origin point. */
        radius: number;
        /** The shoulder/chest origin point for the left hand in local camera space. */
        leftHandOrigin: {
            x: number;
            y: number;
            z: number;
        };
        /** The shoulder/chest origin point for the right hand in local camera space. */
        rightHandOrigin: {
            x: number;
            y: number;
            z: number;
        };
    };
    /** Limits the angular cone in front of the user within which controllers can move. */
    reachAngle: {
        enabled: boolean;
        /** The maximum full cone angle in radians around the camera's forward direction (default is Math.PI, a front hemisphere). */
        angle: number;
    };
    constructor(options?: DeepReadonly<DeepPartial<SimulatorOptions>>);
}

/**
 * Options for configuring integration with \@pmndrs/uikit.
 */
declare class UIKitOptions {
    /** Whether UIKit support is enabled. */
    enabled: boolean;
    /** The custom sorting function provided by \@pmndrs/uikit. */
    reversePainterSortStable?: (a: RenderItem, b: RenderItem) => number;
    /**
     * Enables \@pmndrs/uikit integration.
     *
     * @param uikit - The imported `@pmndrs/uikit` module instance.
     * @returns The instance for chaining.
     */
    enable(uikit: {
        reversePainterSortStable: (a: RenderItem, b: RenderItem) => number;
    }): this;
}

declare class MeshDetectionOptions {
    showDebugVisualizations: boolean;
    enabled: boolean;
    constructor(options?: DeepPartial<MeshDetectionOptions>);
    /**
     * Enables the mesh detector.
     */
    enable(): this;
}

/**
 * Configuration options for the ObjectDetector.
 */
declare class ObjectsOptions {
    debugging: boolean;
    enabled: boolean;
    showDebugVisualizations: boolean;
    /**
     * Minimum delay in milliseconds between continuous object detection runs.
     * A value of 0 runs again as soon as the previous detection finishes.
     */
    pollingIntervalMs: number;
    /**
     * Margin to add when cropping the object image, as a percentage of image
     * size.
     */
    objectImageMargin: number;
    /**
     * Configuration for the detection backends.
     */
    backendConfig: {
        /** The active backend to use for detection. */
        activeBackend: "gemini" | "mediapipe";
        gemini: {
            systemInstruction: string;
            /**
             * Extra Gemini generation config merged into the per-call config (over
             * the SDK defaults). Use to pin sampling parameters such as
             * `temperature: 0` for deterministic detections.
             */
            generationConfig: Record<string, unknown>;
            responseSchema: {
                type: string;
                items: {
                    type: string;
                    required: string[];
                    properties: {
                        objectName: {
                            type: string;
                        };
                        ymin: {
                            type: string;
                        };
                        xmin: {
                            type: string;
                        };
                        ymax: {
                            type: string;
                        };
                        xmax: {
                            type: string;
                        };
                    };
                };
            };
        };
        /** Configuration for MediaPipe backend. */
        mediapipe: {
            wasmFilesUrl: string;
            modelAssetPath: string;
            scoreThreshold: number;
        };
    };
    constructor(options?: DeepPartial<ObjectsOptions>);
    /**
     * Enables the object detector.
     */
    enable(): this;
}

declare class PlanesOptions {
    debugging: boolean;
    enabled: boolean;
    showDebugVisualizations: boolean;
    constructor(options?: DeepPartial<PlanesOptions>);
    enable(): this;
}

declare class SoundsOptions {
    enabled: boolean;
    showDebugInfo: boolean;
    backendConfig: {
        activeBackend: string;
        mediapipe: {
            wasmFilesUrl: string;
            modelAssetPath: string;
            chunkSamples: number;
        };
    };
    constructor(options?: DeepPartial<SoundsOptions>);
    /**
     * Enables sound detection.
     */
    enable(): this;
}

/**
 * Configuration options for the Human Pose Detection system.
 */
declare class HumansOptions {
    enabled: boolean;
    /**
     * Minimum delay in milliseconds between continuous pose detection runs.
     * A value of 0 runs again as soon as the previous detection finishes.
     */
    pollingIntervalMs: number;
    /**
     * Configuration options for the active pose detection backend.
     */
    backendConfig: {
        activeBackend: string;
        mediapipe: {
            wasmFilesUrl: string;
            modelAssetPath: string;
            /**
             * The maximum number of simultaneous human poses/bodies to track.
             */
            numPoses: number;
            /**
             * The minimum confidence score [0.0, 1.0] required for a pose to be detected.
             */
            minPoseDetectionConfidence: number;
            /**
             * The minimum confidence score [0.0, 1.0] required to confirm a pose is still present.
             */
            minPosePresenceConfidence: number;
            /**
             * The minimum confidence score [0.0, 1.0] required for tracking landmarks between frames.
             */
            minTrackingConfidence: number;
        };
    };
    constructor(options?: DeepPartial<HumansOptions>);
    enable(): this;
}

/**
 * Configuration options for the Face Landmark Detection system.
 */
declare class FacesOptions {
    enabled: boolean;
    /**
     * Minimum delay in milliseconds between continuous face detection runs.
     * A value of 0 runs again as soon as the previous detection finishes.
     */
    pollingIntervalMs: number;
    /**
     * Configuration options for the active face detection backend.
     */
    backendConfig: {
        activeBackend: string;
        mediapipe: {
            wasmFilesUrl: string;
            modelAssetPath: string;
            /**
             * The maximum number of simultaneous faces to track.
             */
            numFaces: number;
            /**
             * The minimum confidence score [0.0, 1.0] required for a face to be
             * detected.
             */
            minFaceDetectionConfidence: number;
            /**
             * The minimum confidence score [0.0, 1.0] required to confirm a face is
             * still present.
             */
            minFacePresenceConfidence: number;
            /**
             * The minimum confidence score [0.0, 1.0] required for tracking
             * landmarks between frames.
             */
            minTrackingConfidence: number;
            /**
             * Whether to compute and emit per-face blendshape weights (52
             * ARKit-compatible categories). Required for facial expression
             * mirroring, lipsync feeds, and avatar animation.
             */
            outputFaceBlendshapes: boolean;
            /**
             * Whether to compute and emit the 4x4 facial transformation matrix
             * for each face. Provides a stable rigid head pose for parenting
             * objects to the head (glasses, masks, hats).
             */
            outputFacialTransformationMatrixes: boolean;
        };
    };
    constructor(options?: DeepPartial<FacesOptions>);
    enable(): this;
}

/**
 * Configuration options for the semantic segmentation system. Mirrors the
 * other `world/*` perception options (humans, faces, objects).
 */
declare class SegmentationOptions {
    enabled: boolean;
    /**
     * Minimum delay in milliseconds between continuous segmentation runs.
     * A value of 0 runs again as soon as the previous inference finishes.
     * Defaults to 66 (~15 fps), the rate the magic_window grab loop used before
     * segmentation moved onto its own polling loop.
     */
    pollingIntervalMs: number;
    /**
     * Configuration options for the active segmentation backend.
     */
    backendConfig: {
        activeBackend: string;
        mediapipe: {
            wasmFilesUrl: string;
            modelAssetPath: string;
            /**
             * Output the per-pixel category mask. Required to produce a
             * {@link SegmentationMask}.
             */
            outputCategoryMask: boolean;
        };
    };
    constructor(options?: DeepPartial<SegmentationOptions>);
    enable(): this;
}

declare class WorldOptions {
    debugging: boolean;
    enabled: boolean;
    initiateRoomCapture: boolean;
    planes: PlanesOptions;
    objects: ObjectsOptions;
    meshes: MeshDetectionOptions;
    sounds: SoundsOptions;
    humans: HumansOptions;
    faces: FacesOptions;
    segmentation: SegmentationOptions;
    constructor(options?: DeepPartial<WorldOptions>);
    /**
     * Enables plane detection.
     */
    enablePlaneDetection(): this;
    /**
     * Enables object detection.
     */
    enableObjectDetection(): this;
    /**
     * Enables mesh detection.
     */
    enableMeshDetection(): this;
    /**
     * Enables sound detection.
     */
    enableSoundDetection(): this;
    /**
     * Enables human detection.
     */
    enableHumanDetection(): this;
    /**
     * Enables face landmark detection.
     */
    enableFaceDetection(): this;
    /**
     * Enables semantic segmentation (person / background category masks).
     */
    enableSegmentation(): this;
}

/**
 * Default options for XR controllers, which encompass hands by default in
 * Android XR, mouse input on desktop, tracked controllers, and gamepads.
 */
declare class InputOptions {
    /** Whether controller input is enabled. */
    enabled: boolean;
    /** Whether mouse input should act as a controller on desktop. */
    enabledMouse: boolean;
    /** Whether to enable debugging features for controllers. */
    debug: boolean;
    /** Whether to show controller models. */
    visualization: boolean;
    /** Whether to show the ray lines extending from the controllers. */
    visualizeRays: boolean;
    /** Whether to perform raycast on update. This is needed for the reticle to work properly. */
    performRaycastOnUpdate: boolean;
}
/**
 * Default options for the reticle (pointing cursor).
 */
declare class ReticleOptions {
    enabled: boolean;
    /**
     * When set to a positive value, the reticle is placed at this distance
     * (in meters) along the controller ray when no intersection is found,
     * instead of being hidden. Set to 0 to hide the reticle on miss.
     */
    defaultDistance: number;
}
/**
 * Options for the XR transition effect.
 */
declare class XRTransitionOptions {
    /** Whether the transition effect is enabled. */
    enabled: boolean;
    /** The duration of the transition in seconds. */
    transitionTime: number;
    /** The default background color for VR transitions. */
    defaultBackgroundColor: number;
}
declare const FORM_FACTORS: readonly ["auto", "xr", "hud", "vr", "desktop", "mobile"];
type FormFactor = (typeof FORM_FACTORS)[number];
type AutomationModeOptions = {
    hideSimulatorUi?: boolean;
    defaultHand?: Handedness;
    defaultMode?: SimulatorMode;
    enableHands?: boolean;
    enableCamera?: boolean;
};
/**
 * A central configuration class for the entire XR Blocks system. It aggregates
 * all settings and provides chainable methods for enabling common features.
 */
declare class Options {
    /**
     * Whether to use antialiasing.
     */
    antialias: boolean;
    /**
     * Whether to use a logarithmic depth buffer. Useful for depth-aware
     * occlusions.
     */
    logarithmicDepthBuffer: boolean;
    /**
     * Global flag for enabling various debugging features.
     */
    debugging: boolean;
    /**
     * Whether to request a stencil buffer.
     */
    stencil: boolean;
    /**
     * Canvas element to use for rendering.
     * If not defined, a new element will be added to document body.
     */
    canvas?: HTMLCanvasElement;
    /**
     * Any additional required features when initializing webxr.
     */
    webxrRequiredFeatures: string[];
    /**
     * Any additional optional features when initializing webxr.
     */
    webxrOptionalFeatures: string[];
    referenceSpaceType: XRReferenceSpaceType;
    controllers: InputOptions;
    depth: DepthOptions;
    lighting: LightingOptions;
    deviceCamera: DeviceCameraOptions;
    hands: HandsOptions;
    gestures: GestureRecognitionOptions;
    strokes: StrokeRecognitionOptions;
    reticles: ReticleOptions;
    sound: SoundOptions;
    ai: AIOptions;
    simulator: SimulatorOptions;
    world: WorldOptions;
    uikit: UIKitOptions;
    physics: PhysicsOptions;
    transition: XRTransitionOptions;
    camera: {
        near: number;
        far: number;
    };
    /**
     * Whether to use post-processing effects.
     */
    usePostprocessing: boolean;
    enableSimulator: boolean;
    /**
     * Whether to catch all exceptions thrown by developer scripts in the main update loop
     * and physics step, and log them using console.error instead of crashing the application.
     * When enabled, exceptions in one script will not prevent other scripts or subsystems from updating.
     */
    catchScriptExceptions: boolean;
    /**
     * Configuration for the XR session button.
     */
    xrButton: {
        appTitle: string;
        appDescription: string;
        enabled: boolean;
        startText: string;
        endText: string;
        invalidText: string;
        startSimulatorText: string;
        showEnterSimulatorButton: boolean;
        alwaysAutostartSimulator: boolean;
    };
    /**
     * Which permissions to request before entering the XR session.
     */
    permissions: {
        geolocation: boolean;
        camera: boolean;
        microphone: boolean;
    };
    xrSessionMode: XRSessionMode;
    private _formFactor;
    get formFactor(): FormFactor;
    /**
     * Form factor is a preset that configures the experience for a specific
     * device type. Currently it only controls whether the simulator is enabled
     * and should always be autostarted.
     */
    set formFactor(formFactor: FormFactor);
    /**
     * Constructs the Options object by merging default values with provided
     * custom options.
     * @param options - A custom options object to override the defaults.
     */
    constructor(options?: DeepReadonly<DeepPartial<Options>>);
    protected parseUrlParams(): void;
    /**
     * Sets the session mode to VR and disables the simulator passthrough scene.
     */
    enableVR(): this;
    /**
     * Enables a standard set of options for a UI-focused experience.
     * @returns The instance for chaining.
     */
    enableUI(): this;
    /**
     * Enables a standard simulator-driven setup for automation and external test
     * harnesses.
     * @returns The instance for chaining.
     */
    enableAutomationMode(config?: AutomationModeOptions): this;
    /**
     * Enables reticles for visualizing targets of hand rays in WebXR.
     * @returns The instance for chaining.
     */
    enableReticles(): this;
    /**
     * Enables depth sensing in WebXR with default options.
     * @returns The instance for chaining.
     */
    enableDepth(): this;
    /**
     * Enables plane detection.
     * @returns The instance for chaining.
     */
    enablePlaneDetection(): this;
    /**
     * Enables object detection.
     * @returns The instance for chaining.
     */
    enableObjectDetection(): this;
    /**
     * Enables human pose detection.
     * @returns The instance for chaining.
     */
    enableHumanDetection(): this;
    /**
     * Enables face landmark detection. Provides 478 per-face landmarks in
     * world space, optional 52 ARKit-style blendshape weights, and an
     * optional rigid 4x4 facial transformation matrix per detected face.
     * @returns The instance for chaining.
     */
    enableFaceDetection(): this;
    /**
     * Enables semantic segmentation. Produces per-pixel person / background
     * category masks from the device camera (MediaPipe, on-device). Unlike face
     * and human detection it does not require depth.
     * @returns The instance for chaining.
     */
    enableSegmentation(): this;
    /**
     * Enables device camera (passthrough) with a specific facing mode.
     * @param facingMode - The desired camera facing mode, either 'environment' or
     *     'user'.
     * @returns The instance for chaining.
     */
    enableCamera(facingMode?: 'environment' | 'user'): this;
    /**
     * Enables hand tracking.
     * @returns The instance for chaining.
     */
    enableHands(): this;
    /**
     * Enables the gesture recognition block and ensures hands are available.
     * @returns The instance for chaining.
     */
    enableGestures(): this;
    /**
     * Enables the stroke recognition block and ensures gestures are available.
     * @returns The instance for chaining.
     */
    enableStrokes(): this;
    /**
     * Enables the visualization of rays for hand tracking.
     * @returns The instance for chaining.
     */
    enableHandRays(): this;
    /**
     * Enables a standard set of AI features, including Gemini Live.
     * @returns The instance for chaining.
     */
    enableAI(): this;
    /**
     * Enables the XR transition component for toggling VR.
     * @returns The instance for chaining.
     */
    enableXRTransitions(): this;
    /**
     * Enables input from hands and controllers.
     * Note that this is enabled by default and can also be changed at runtime with
     * xb.core.input.enableControllers() and xb.core.input.disableControllers().
     * @returns The instance for chaining.
     */
    enableControllers(): this;
    /**
     * Sets the title of the app to be displayed above the XR button.
     * @param title - The title of the app.
     * @returns The instance for chaining.
     */
    setAppTitle(title: string): this;
    /**
     * Sets the description of the app to be displayed above the XR button.
     * @param description - The description of the app.
     * @returns The instance for chaining.
     */
    setAppDescription(description: string): this;
}

type GamepadAction = 'select' | 'cycleHandPoseLeft' | 'cycleHandPoseRight' | 'cycleSimulatorMode' | 'toggleUI' | 'toggleHand' | 'moveDown' | 'moveUp' | 'openSettings';
/**
 * Manages gamepad button-to-action mappings with localStorage persistence.
 * One button per action — assigning a button removes it from any previous action.
 */
declare class GamepadBindings {
    private bindings;
    constructor();
    getBinding(action: GamepadAction): number;
    getAllBindings(): Record<GamepadAction, number>;
    setBinding(action: GamepadAction, buttonIndex: number): void;
    resetDefaults(): void;
    private load;
    private save;
}

/** Defines the event map for the GamepadController's custom events. */
interface GamepadControllerEventMap extends THREE.Object3DEventMap {
    connected: {
        target: GamepadController;
    };
    disconnected: {
        target: GamepadController;
    };
    selectstart: {
        target: GamepadController;
    };
    selectend: {
        target: GamepadController;
    };
}
/**
 * Simulates an XR controller using a connected gamepad (Xbox/PS).
 * The controller ray always points forward from the camera center,
 * similar to GazeController but with button-driven selection.
 */
declare class GamepadController extends Script<GamepadControllerEventMap> implements Controller {
    static dependencies: {
        camera: typeof THREE.Camera;
    };
    type: string;
    name: string;
    userData: {
        id: number;
        connected: boolean;
        selected: boolean;
    };
    camera?: THREE.Camera;
    bindings: GamepadBindings;
    /** The browser Gamepad object, refreshed each frame. */
    activeGamepad?: Gamepad | null;
    gamepad?: Gamepad;
    /** True if the toast has been shown this session. */
    hasShownToast: boolean;
    /** Callback set by SimulatorInterface for opening settings. */
    onOpenSettings?: () => void;
    /** When true, normal gamepad UI/select actions are suppressed (modal menu). */
    menuActive: boolean;
    private _prevButtons;
    private _risingEdges;
    private _captureCallback;
    constructor();
    init({ camera }: {
        camera: THREE.Camera;
    }): void;
    /**
     * Enters capture mode — the next button press will invoke the callback
     * instead of triggering normal actions, then exit capture mode.
     */
    captureNextButtonPress(callback: (buttonIndex: number) => void): void;
    cancelCapture(): void;
    get captureActive(): boolean;
    updatePose(): void;
    update(): void;
    callSelectStart(): void;
    callSelectEnd(): void;
    connect(): void;
    disconnect(): void;
    /**
     * Returns the axes of the active gamepad with deadzone applied.
     * [leftX, leftY, rightX, rightY]
     */
    getAxes(): [number, number, number, number];
    static applyDeadzone(value: number): number;
    /**
     * Returns the analog value (0..1) of the given button index, or 0 if
     * unbound or no gamepad. Useful for triggers (which expose .value).
     */
    getButtonValue(index: number): number;
    /**
     * Returns the analog values of the left and right triggers (LT, RT) on a
     * standard-mapped gamepad, in [0, 1]. Returns [0, 0] when no gamepad.
     */
    getTriggers(): [number, number];
    /**
     * Returns true if the given button index had a rising edge this frame.
     * Safe to call from any update order — uses pre-computed edges.
     */
    isButtonJustPressed(buttonIndex: number): boolean;
    private _updatePrevButtons;
    private _pollGamepad;
    private _onDisconnect;
}

/**
 * A simple utility class for linearly animating a numeric value over
 * time. It clamps the value within a specified min/max range and updates it
 * based on a given speed.
 */
declare class AnimatableNumber {
    value: number;
    minValue: number;
    maxValue: number;
    speed: number;
    constructor(value?: number, minValue?: number, maxValue?: number, speed?: number);
    /**
     * Updates the value based on the elapsed time.
     * @param deltaTimeSeconds - The time elapsed since the last update, in
     * seconds.
     */
    update(deltaTimeSeconds: number): void;
}

interface GazeControllerEventMap extends THREE.Object3DEventMap {
    connected: {
        target: GazeController;
    };
    disconnected: {
        target: GazeController;
    };
    selectstart: {
        target: GazeController;
    };
    selectend: {
        target: GazeController;
    };
}
/**
 * Implements a gaze-based controller for XR interactions.
 * This allows users to select objects by looking at them for a set duration.
 * It functions as a virtual controller that is always aligned with the user's
 * camera (head pose).
 * WebXR Eye Tracking is not yet available. This API simulates a reticle
 * at the center of the field of view for simulating gaze-based interaction.
 */
declare class GazeController extends Script<GazeControllerEventMap> implements Controller {
    static dependencies: {
        camera: typeof THREE.Camera;
        timer: typeof THREE.Timer;
    };
    /**
     * User data for the controller, including its connection status, unique ID,
     * and selection state.
     */
    userData: {
        connected: boolean;
        id: number;
        selected: boolean;
    };
    /**
     * The visual indicator for where the user is looking.
     */
    reticle: Reticle;
    /**
     * The time in seconds the user must gaze at an object to trigger a selection.
     */
    activationTimeSeconds: number;
    /**
     * An animatable number that tracks the progress of the gaze selection, from
     * 0.0 to 1.0.
     */
    activationAmount: AnimatableNumber;
    /**
     * Stores the reticle's position from the previous frame to calculate movement
     * speed.
     */
    lastReticlePosition: THREE.Vector3;
    /**
     * A timer to measure the time delta between frames for smooth animation and
     * movement calculation.
     */
    timer: THREE.Timer;
    camera: THREE.Camera;
    init({ camera, timer }: {
        camera: THREE.Camera;
        timer: THREE.Timer;
    }): void;
    /**
     * The main update loop, called every frame by the core engine.
     * It handles syncing the controller with the camera and manages the gaze
     * selection logic.
     */
    updatePose(): void;
    update(): void;
    /**
     * Updates the reticle's scale and shader uniforms to provide visual feedback
     * for gaze activation. The reticle shrinks and fills in as the activation
     * timer progresses.
     */
    updateReticleScale(): void;
    /**
     * Dispatches a 'selectstart' event, signaling that a gaze selection has been
     * initiated.
     */
    callSelectStart(): void;
    /**
     * Dispatches a 'selectend' event, signaling that a gaze selection has been
     * released (e.g., by moving gaze).
     */
    callSelectEnd(): void;
    /**
     * Connects the gaze controller to the input system.
     */
    connect(): void;
    /**
     * Disconnects the gaze controller from the input system.
     */
    disconnect(): void;
}

/** Defines the event map for the MouseController's custom events. */
interface MouseControllerEventMap extends THREE.Object3DEventMap {
    connected: {
        target: MouseController;
    };
    disconnected: {
        target: MouseController;
    };
    selectstart: {
        target: MouseController;
    };
    selectend: {
        target: MouseController;
    };
}
/**
 * Simulates an XR controller using the mouse for desktop
 * environments. This class translates 2D mouse movements on the screen into a
 * 3D ray in the scene, allowing for point-and-click interactions in a
 * non-immersive context. It functions as a virtual controller that is always
 * aligned with the user's pointer.
 */
declare class MouseController extends Script<MouseControllerEventMap> implements Controller {
    static dependencies: {
        camera: typeof THREE.Camera;
    };
    type: string;
    name: string;
    editorIcon: string;
    /**
     * User data for the controller, including its connection status, unique ID,
     * and selection state (mouse button pressed).
     */
    userData: {
        id: number;
        connected: boolean;
        selected: boolean;
    };
    /** A THREE.Raycaster used to determine the 3D direction of the mouse. */
    raycaster: THREE.Raycaster;
    /** A normalized vector representing the default forward direction. */
    forwardVector: THREE.Vector3;
    /** A reference to the main scene camera. */
    camera?: THREE.Camera;
    private lastNormalizedMouse;
    constructor();
    /**
     * Initialize the MouseController
     */
    init({ camera }: {
        camera: THREE.Camera;
    }): void;
    /** Updates the mouse position/rotation using camera state. */
    updatePose(): void;
    /**
     * The main update loop, called every frame.
     * If connected, it syncs the controller's origin point with the camera's
     * position.
     */
    update(): void;
    /**
     * Updates the controller's transform based on the mouse's position on the
     * screen. This method sets both the position and rotation, ensuring the
     * object has a valid world matrix for raycasting.
     * @param event - The mouse event containing clientX and clientY coordinates.
     */
    updateMousePositionFromEvent(event: MouseEvent): void;
    /**
     * Dispatches a 'selectstart' event, simulating the start of a controller
     * press (e.g., mouse down).
     */
    callSelectStart(): void;
    /**
     * Dispatches a 'selectend' event, simulating the end of a controller press
     * (e.g., mouse up).
     */
    callSelectEnd(): void;
    /**
     * "Connects" the virtual controller, notifying the input system that it is
     * active.
     */
    connect(): void;
    /**
     * "Disconnects" the virtual controller.
     */
    disconnect(): void;
}

/**
 * A node to hold all XR Blocks Systems.
 */
declare class XRSystems extends THREE.Group {
    type: string;
    name: string;
}

declare class ActiveControllers extends THREE.Group {
    type: string;
    name: string;
}
declare class Reticles extends THREE.Group {
    type: string;
    name: string;
}
type HasIgnoreReticleRaycast = {
    ignoreReticleRaycast: boolean;
};
type MaybeHasIgnoreReticleRaycast = Partial<HasIgnoreReticleRaycast>;
/**
 * The XRInput class holds all the controllers and performs raycasts through the
 * scene each frame.
 */
declare class Input {
    options: Options;
    controllers: Controller[];
    controllerGrips: THREE.Group[];
    hands: THREE.XRHandSpace[];
    raycaster: Raycaster;
    initialized: boolean;
    pivotsEnabled: boolean;
    gazeController: GazeController;
    mouseController: MouseController;
    gamepadController: GamepadController;
    controllersEnabled: boolean;
    listeners: Map<any, any>;
    intersectionsForController: Map<Controller, THREE.Intersection<THREE.Object3D<THREE.Object3DEventMap>>[]>;
    intersections: never[];
    activeControllers: ActiveControllers;
    leftController?: Controller;
    rightController?: Controller;
    reticles: Reticles;
    scene?: THREE.Scene;
    /**
     * Initializes an instance with XR controllers, grips, hands, raycaster, and
     * default options. Only called by Core.
     */
    init({ scene, systemsGroup, options, renderer, }: {
        scene: THREE.Scene;
        systemsGroup: XRSystems;
        options: Options;
        renderer: THREE.WebGLRenderer;
    }): void;
    /**
     * Retrieves the controller object by its ID.
     * @param id - The ID of the controller.
     * @returns The controller with the specified ID.
     */
    get(id: number): THREE.Object3D;
    /**
     * Adds an object to both controllers by creating a new group and cloning it.
     * @param obj - The object to add to each controller.
     */
    addObject(obj: THREE.Object3D): void;
    /**
     * Creates a pivot point for each hand, primarily used as a reference
     * point.
     */
    enablePivots(): void;
    /**
     * Adds reticles to the controllers and scene, with initial visibility set to
     * false.
     */
    addReticles(): void;
    /**
     * Default action to handle the start of a selection, setting the selecting
     * state to true.
     */
    defaultOnSelectStart(event: ControllerEvent): void;
    /**
     * Default action to handle the end of a selection, setting the selecting
     * state to false.
     */
    defaultOnSelectEnd(event: ControllerEvent): void;
    defaultOnSqueezeStart(event: ControllerEvent): void;
    defaultOnSqueezeEnd(event: ControllerEvent): void;
    defaultOnConnected(event: ControllerEvent): void;
    defaultOnDisconnected(event: ControllerEvent): void;
    /**
     * Binds a listener to both controllers.
     * @param listenerName - Event name
     * @param listener - Function to call
     */
    bindListener(listenerName: keyof ControllerEventMap, listener: (event: ControllerEvent) => void): void;
    unbindListener(listenerName: keyof ControllerEventMap, listener: (event: ControllerEvent) => void): void;
    dispatchEvent(event: ControllerEvent): void;
    /**
     * Binds an event listener to handle 'selectstart' events for both
     * controllers.
     * @param event - The event listener function.
     */
    bindSelectStart(event: (event: ControllerEvent) => void): void;
    /**
     * Binds an event listener to handle 'selectend' events for both controllers.
     * @param event - The event listener function.
     */
    bindSelectEnd(event: (event: ControllerEvent) => void): void;
    /**
     * Binds an event listener to handle 'select' events for both controllers.
     * @param event - The event listener function.
     */
    bindSelect(event: (event: ControllerEvent) => void): void;
    /**
     * Binds an event listener to handle 'squeezestart' events for both
     * controllers.
     * @param event - The event listener function.
     */
    bindSqueezeStart(event: (event: ControllerEvent) => void): void;
    /**
     * Binds an event listener to handle 'squeezeend' events for both controllers.
     * @param event - The event listener function.
     */
    bindSqueezeEnd(event: (event: ControllerEvent) => void): void;
    bindSqueeze(event: (event: ControllerEvent) => void): void;
    bindKeyDown(event: (event: KeyEvent) => void): void;
    bindKeyUp(event: (event: KeyEvent) => void): void;
    unbindKeyDown(event: (event: KeyEvent) => void): void;
    unbindKeyUp(event: (event: KeyEvent) => void): void;
    /**
     * Finds intersections between a controller's ray and a specified object.
     * @param controller - The controller casting the ray.
     * @param obj - The object to intersect.
     * @returns Array of intersection points, if any.
     */
    intersectObjectByController(controller: THREE.Object3D, obj: THREE.Object3D): THREE.Intersection[];
    /**
     * Finds intersections based on an event's target controller and a specified
     * object.
     * @param event - The event containing the controller reference.
     * @param obj - The object to intersect.
     * @returns Array of intersection points, if any.
     */
    intersectObjectByEvent(event: ControllerEvent, obj: THREE.Object3D): THREE.Intersection[];
    /**
     * Finds intersections with an object from either controller.
     * @param obj - The object to intersect.
     * @returns Array of intersection points, if any.
     */
    intersectObject(obj: THREE.Object3D): THREE.Intersection[];
    update(): void;
    updateController(controller: Controller): void;
    /**
     * Sets the raycaster's origin and direction from any Object3D that
     * represents a controller. This replaces the non-standard
     * `setFromXRController`.
     * @param controller - The controller to cast a ray from.
     */
    setRaycasterFromController(controller: THREE.Object3D): void;
    updateReticleFromIntersections(controller: Controller): void;
    enableGazeController(): void;
    disableGazeController(): void;
    private registerController;
    enableController(controller: Controller): void;
    disableController(controller: Controller): void;
    disableControllers(): void;
    enableControllers(): void;
    performRaycastOnScene(controller: Controller): void;
}

/**
 * User is an embodied instance to manage hands, controllers, speech, and
 * avatars. It extends Script to update human-world interaction.
 *
 * In the long run, User is to manages avatars, hands, and everything of Human
 * I/O. In third-person view simulation, it should come with an low-poly avatar.
 * To support multi-user social XR planned for future iterations.
 */
declare class User extends Script {
    static dependencies: {
        input: typeof Input;
        scene: typeof THREE.Scene;
    };
    /**
     * Whether to represent a local user, or another user in a multi-user session.
     */
    local: boolean;
    /**
     * The number of hands associated with the XR user.
     */
    numHands: number;
    /**
     * The height of the user in meters.
     */
    height: number;
    /**
     * The default distance of a UI panel from the user in meters.
     */
    panelDistance: number;
    /**
     * The handedness (primary hand) of the user (0 for left, 1 for right, 2 for
     * both).
     */
    handedness: number;
    /**
     * The radius of the safe space around the user in meters.
     */
    safeSpaceRadius: number;
    /**
     * The distance of a newly spawned object from the user in meters.
     */
    objectDistance: number;
    /**
     * The angle of a newly spawned object from the user in radians.
     */
    objectAngle: number;
    /**
     * An array of pivot objects. Pivot are sphere at the **starting** tip of
     * user's hand / controller / mouse rays for debugging / drawing applications.
     */
    pivots: THREE.Object3D[];
    /**
     * Public data for user interactions, typically holding references to XRHand.
     */
    hands?: Hands;
    /**
     * Maps a controller to the object it is currently hovering over.
     */
    hoveredObjectsForController: Map<Controller, THREE.Object3D<THREE.Object3DEventMap> | null>;
    /**
     * Maps a controller to the object it has currently selected.
     */
    selectedObjectsForController: Map<Controller, THREE.Object3D<THREE.Object3DEventMap>>;
    /**
     * Maps a hand index (0 or 1) to a set of meshes it is currently touching.
     */
    touchedObjects: Map<number, Set<THREE.Mesh<THREE.BufferGeometry<THREE.NormalBufferAttributes, THREE.BufferGeometryEventMap>, THREE.Material<THREE.MaterialEventMap> | THREE.Material<THREE.MaterialEventMap>[], THREE.Object3DEventMap>>>;
    /**
     * Maps a hand index to another map that associates a grabbed mesh with its
     * initial grab event data.
     */
    grabbedObjects: Map<number, Map<THREE.Mesh<THREE.BufferGeometry<THREE.NormalBufferAttributes, THREE.BufferGeometryEventMap>, THREE.Material<THREE.MaterialEventMap> | THREE.Material<THREE.MaterialEventMap>[], THREE.Object3DEventMap>, ObjectGrabEvent>>;
    input: Input;
    scene: THREE.Scene;
    controllers: Controller[];
    /**
     * Constructs a new User.
     */
    constructor();
    /**
     * Initializes the User.
     */
    init({ input, scene }: {
        input: Input;
        scene: THREE.Scene;
    }): void;
    /**
     * Sets the user's height on the first frame.
     * @param camera -
     */
    setHeight(camera: THREE.Camera): void;
    /**
     * Adds pivots at the starting tip of user's hand / controller / mouse rays.
     */
    enablePivots(): void;
    /**
     * Gets the pivot object for a given controller id.
     * @param id - The controller id.
     * @returns The pivot object.
     */
    getPivot(id: number): THREE.Object3D<THREE.Object3DEventMap> | undefined;
    /**
     * Gets the world position of the pivot for a given controller id.
     * @param id - The controller id.
     * @returns The world position of the pivot.
     */
    getPivotPosition(id: number): THREE.Vector3 | undefined;
    /**
     * Gets reticle's direction in THREE.Vector3.
     * Requires reticle enabled to be called.
     * @param controllerId -
     */
    getReticleDirection(controllerId: number): THREE.Vector3 | undefined;
    /**
     * Gets the object targeted by the reticle.
     * Requires `options.reticle.enabled`.
     * @param id - The controller id.
     * @returns The targeted object, or null.
     */
    getReticleTarget(id: number): THREE.Object3D<THREE.Object3DEventMap> | undefined;
    /**
     * Gets the intersection details from the reticle's raycast.
     * Requires `options.reticle.enabled`.
     * @param id - The controller id.
     * @returns The intersection object, or null if no intersection.
     */
    getReticleIntersection(id: number): THREE.Intersection<THREE.Object3D<THREE.Object3DEventMap>> | undefined;
    /**
     * Checks if any controller is pointing at the given object or its children.
     * @param obj - The object to check against.
     * @returns True if a controller is pointing at the object.
     */
    isPointingAt(obj: THREE.Object3D): boolean;
    /**
     * Checks if any controller is selecting the given object or its children.
     * @param obj - The object to check against.
     * @returns True if a controller is selecting the object.
     */
    isSelectingAt(obj: THREE.Object3D): boolean;
    /**
     * Gets the intersection point on a specific object.
     * Not recommended for general use, since a View / ModelView's
     * ux.positions contains the intersected points.
     * @param obj - The object to check for intersection.
     * @param id - The controller ID, or -1 for any controller.
     * @returns The intersection details, or null if no intersection.
     */
    getIntersectionAt(obj: THREE.Object3D, id?: number): THREE.Intersection<THREE.Object3D<THREE.Object3DEventMap>> | null | undefined;
    /**
     * Gets the world position of a controller.
     * @param id - The controller id.
     * @param target - The target vector to
     * store the result.
     * @returns The world position of the controller.
     */
    getControllerPosition(id: number, target?: THREE.Vector3): THREE.Vector3;
    /**
     * Calculates the distance between a controller and an object.
     * @param id - The controller id.
     * @param object - The object to measure the distance to.
     * @returns The distance between the controller and the object.
     */
    getControllerObjectDistance(id: number, object: THREE.Object3D): number;
    /**
     * Checks if either controller is selecting.
     * @param id - The controller id. If -1, check both controllers.
     * @returns True if selecting, false otherwise.
     */
    isSelecting(id?: number): any;
    /**
     * Checks if either controller is squeezing.
     * @param id - The controller id. If -1, check both controllers.
     * @returns True if squeezing, false otherwise.
     */
    isSqueezing(id?: number): any;
    /**
     * Handles the select start event for a controller.
     * @param event - The event object.
     */
    onSelectStart(event: SelectEvent): void;
    /**
     * Handles the select end event for a controller.
     * @param event - The event object.
     */
    onSelectEnd(event: SelectEvent): void;
    /**
     * Handles the squeeze start event for a controller.
     * @param _event - The event object.
     */
    onSqueezeStart(_event: SelectEvent): void;
    /**
     * Handles the squeeze end event for a controller.
     * @param _event - The event object.
     */
    onSqueezeEnd(_event: SelectEvent): void;
    /**
     * The main update loop called each frame. Updates hover state for all
     * controllers.
     */
    update(): void;
    /**
     * Checks for and handles grab events (touching + pinching).
     */
    updateGrabState(): void;
    /**
     * Checks for and handles touch events for the hands' index fingers.
     */
    updateTouchState(): void;
    /**
     * Updates the hover state for a single controller.
     * @param controller - The controller to update.
     */
    updateForController(controller: Controller): void;
    /**
     * Recursively calls onHoverExit on a target and its ancestors.
     * @param controller - The controller exiting hover.
     * @param target - The object being exited.
     */
    callHoverExit(controller: Controller, target: THREE.Object3D | null): void;
    /**
     * Recursively calls onHoverEnter on a target and its ancestors.
     * @param controller - The controller entering hover.
     * @param target - The object being entered.
     */
    callHoverEnter(controller: Controller, target: THREE.Object3D | null): void;
    /**
     * Recursively calls onHovering on a target and its ancestors.
     * @param controller - The controller hovering.
     * @param target - The object being entered.
     */
    callOnHovering(controller: Controller, target: THREE.Object3D | null): void;
    /**
     * Recursively calls onObjectSelectStart on a target and its ancestors until
     * the event is handled.
     * @param event - The original select start event.
     * @param target - The object being selected.
     */
    callObjectSelectStart(event: SelectEvent, target: THREE.Object3D | null): void;
    /**
     * Recursively calls onObjectSelectEnd on a target and its ancestors until
     * the event is handled.
     * @param event - The original select end event.
     * @param target - The object being un-selected.
     */
    callObjectSelectEnd(event: SelectEvent, target: THREE.Object3D | null): void;
    /**
     * Recursively calls onObjectTouchStart on a target and its ancestors.
     * @param event - The original touch start event.
     * @param target - The object being touched.
     */
    callObjectTouchStart(event: ObjectTouchEvent, target: THREE.Object3D | null): void;
    /**
     * Recursively calls onObjectTouching on a target and its ancestors.
     * @param event - The original touch event.
     * @param target - The object being touched.
     */
    callObjectTouching(event: ObjectTouchEvent, target: THREE.Object3D | null): void;
    /**
     * Recursively calls onObjectTouchEnd on a target and its ancestors.
     * @param event - The original touch end event.
     * @param target - The object being un-touched.
     */
    callObjectTouchEnd(event: ObjectTouchEvent, target: THREE.Object3D | null): void;
    /**
     * Recursively calls onObjectGrabStart on a target and its ancestors.
     * @param event - The original grab start event.
     * @param target - The object being grabbed.
     */
    callObjectGrabStart(event: ObjectGrabEvent, target: THREE.Object3D | null): void;
    /**
     * Recursively calls onObjectGrabbing on a target and its ancestors.
     * @param event - The original grabbing event.
     * @param target - The object being grabbed.
     */
    callObjectGrabbing(event: ObjectGrabEvent, target: THREE.Object3D | null): void;
    /**
     * Recursively calls onObjectGrabEnd on a target and its ancestors.
     * @param event - The original grab end event.
     * @param target - The object being released.
     */
    callObjectGrabEnd(event: ObjectGrabEvent, target: THREE.Object3D | null): void;
    /**
     * Checks if a controller is selecting a specific object. Returns the
     * intersection details if true.
     * @param obj - The object to check for selection.
     * @param controller - The controller performing the select.
     * @returns The intersection object if a match is found, else null.
     */
    select(obj: THREE.Object3D, controller: THREE.Object3D): THREE.Intersection<THREE.Object3D<THREE.Object3DEventMap>> | null;
}

type GestureEventType = 'gesturestart' | 'gestureupdate' | 'gestureend';
type GestureHandedness = 'left' | 'right';
interface GestureEventDetail {
    /**
     * The canonical gesture identifier from the configured gesture recognizer.
     */
    name: string;
    /** Which hand triggered the gesture. */
    hand: GestureHandedness;
    /** Gesture recognizer confidence score, normalized to [0, 1]. */
    confidence: number;
    /**
     * Optional payload for recognizer specific values (e.g. pinch distance,
     * velocity vectors).
     */
    data?: Record<string, unknown>;
}
interface GestureEvent {
    type: GestureEventType;
    detail: GestureEventDetail;
}

type GestureScriptEvent = THREE.Event & {
    type: GestureEventType;
    target: GestureRecognition;
    detail: GestureEventDetail;
};
interface GestureRecognitionEventMap extends THREE.Object3DEventMap {
    gesturestart: GestureScriptEvent;
    gestureupdate: GestureScriptEvent;
    gestureend: GestureScriptEvent;
}
declare class GestureRecognition extends Script<GestureRecognitionEventMap> {
    static dependencies: {
        user: typeof User;
        options: typeof GestureRecognitionOptions;
    };
    private options;
    private activeGestures;
    private latestScores;
    private pendingRecognition;
    private lastEvaluation;
    init({ options, user, }: {
        options: GestureRecognitionOptions;
        user: User;
    }): Promise<void>;
    update(): void;
    private evaluateHand;
    private recognizeHand;
    private emitFromScores;
    private emitGesture;
    dispose(): void;
}

/**
 * Lighting provides XR lighting capabilities within the XR Blocks framework.
 * It uses webXR to propvide estimated lighting that matches the environment
 * and supports casting shadows from the estimated light.
 */
declare class Lighting {
    static instance?: Lighting;
    /** WebXR estimated lighting. */
    private xrLight?;
    /** Main Directional light. */
    dirLight: THREE.DirectionalLight;
    /** Ambient spherical harmonics light. */
    ambientProbe: THREE.LightProbe;
    /** Ambient RGB light. */
    ambientLight: THREE.Vector3;
    /** Opacity of cast shadow. */
    private shadowOpacity;
    /** Light group to attach to scene. */
    private lightGroup;
    /** Lighting options. Set during initialiation.*/
    private options;
    /** Depth manager. Used to get depth mesh on which to cast shadow. */
    private depth?;
    /** Flag to indicate if simulator is running. Controlled by Core. */
    simulatorRunning: boolean;
    /**
     * Lighting is a lightweight manager based on three.js to simply prototyping
     * with Lighting features within the XR Blocks framework.
     */
    constructor();
    /**
     * Initializes the lighting module with the given options. Sets up lights and
     * shadows and adds necessary components to the scene.
     * @param lightingOptions - Lighting options.
     * @param renderer - Main renderer.
     * @param scene - Main scene.
     * @param depth - Depth manager.
     */
    init(lightingOptions: LightingOptions, renderer: THREE.WebGLRenderer, scene: THREE.Scene, depth?: Depth): void;
    /**
     * Updates the lighting and shadow setup used to render. Called every frame
     * in the render loop.
     */
    update(): void;
    /**
     * Logs current estimate light parameters for debugging.
     */
    debugLog(): void;
}

declare const AVERAGE_IPD_METERS = 0.063;
declare enum SimulatorRenderMode {
    DEFAULT = "default",
    STEREO_LEFT = "left",
    STEREO_RIGHT = "right"
}

declare class SimulatorControllerState {
    localControllerPositions: THREE.Vector3[];
    localControllerOrientations: THREE.Quaternion[];
    currentControllerIndex: number;
}

type SimulatorHandPoseJoints = {
    t: number[];
    r: number[];
    s?: number[];
}[];
/**
 * Semantic biomechanical hand angles in radians, ordered as [x, y, z].
 *
 * Long fingers:
 * - x: positive flexes toward the palm; negative extends away.
 * - y: positive abducts away from the middle-finger axis; negative adducts.
 * - z: positive axial roll toward the thumb; negative rolls away.
 *
 * Middle finger:
 * - y: positive radial deviation toward index/thumb; negative ulnar deviation.
 *
 * Thumb:
 * - x: positive flexes across the palm; negative extends/repositions.
 * - y: positive palmar abduction away from the palm; negative adducts back.
 * - z: positive opposition/internal roll into the hand; negative repositions away.
 */
type SimulatorHandJointRotationArray = [number, number, number];
type SimulatorHandPoseRotations = Partial<Record<JointName, SimulatorHandJointRotationArray>>;
type SimulatorHandPoseRotationRangeDegrees = readonly [
    minDegrees: number,
    maxDegrees: number
];
type SimulatorHandPoseRotationConstraintsDegrees = Partial<Record<JointName, readonly [
    x: SimulatorHandPoseRotationRangeDegrees,
    y: SimulatorHandPoseRotationRangeDegrees,
    z: SimulatorHandPoseRotationRangeDegrees
]>>;
declare const SIMULATOR_HAND_COMMON_BIOMECHANICAL_CONSTRAINTS_DEGREES: {
    readonly 'thumb-metacarpal': readonly [readonly [-10, 55], readonly [-15, 45], readonly [-20, 45]];
    readonly 'thumb-phalanx-proximal': readonly [readonly [-10, 70], readonly [-15, 15], readonly [0, 0]];
    readonly 'thumb-phalanx-distal': readonly [readonly [-15, 80], readonly [0, 0], readonly [0, 0]];
    readonly 'index-finger-metacarpal': readonly [readonly [0, 0], readonly [0, 0], readonly [0, 0]];
    readonly 'index-finger-phalanx-proximal': readonly [readonly [-30, 90], readonly [-20, 20], readonly [-10, 10]];
    readonly 'index-finger-phalanx-intermediate': readonly [readonly [0, 110], readonly [0, 0], readonly [0, 0]];
    readonly 'index-finger-phalanx-distal': readonly [readonly [0, 80], readonly [0, 0], readonly [0, 0]];
    readonly 'middle-finger-metacarpal': readonly [readonly [0, 0], readonly [0, 0], readonly [0, 0]];
    readonly 'middle-finger-phalanx-proximal': readonly [readonly [-30, 90], readonly [-10, 10], readonly [-10, 10]];
    readonly 'middle-finger-phalanx-intermediate': readonly [readonly [0, 110], readonly [0, 0], readonly [0, 0]];
    readonly 'middle-finger-phalanx-distal': readonly [readonly [0, 80], readonly [0, 0], readonly [0, 0]];
    readonly 'ring-finger-metacarpal': readonly [readonly [0, 0], readonly [0, 0], readonly [0, 0]];
    readonly 'ring-finger-phalanx-proximal': readonly [readonly [-30, 90], readonly [-15, 15], readonly [-10, 10]];
    readonly 'ring-finger-phalanx-intermediate': readonly [readonly [0, 110], readonly [0, 0], readonly [0, 0]];
    readonly 'ring-finger-phalanx-distal': readonly [readonly [0, 80], readonly [0, 0], readonly [0, 0]];
    readonly 'pinky-finger-metacarpal': readonly [readonly [0, 0], readonly [0, 0], readonly [0, 0]];
    readonly 'pinky-finger-phalanx-proximal': readonly [readonly [-30, 90], readonly [-20, 20], readonly [-10, 10]];
    readonly 'pinky-finger-phalanx-intermediate': readonly [readonly [0, 110], readonly [0, 0], readonly [0, 0]];
    readonly 'pinky-finger-phalanx-distal': readonly [readonly [0, 80], readonly [0, 0], readonly [0, 0]];
};
declare function parseSimulatorHandPoseRotations(json: unknown): SimulatorHandPoseRotations;

declare enum SimulatorHandPose {
    NEUTRAL = "neutral",
    RELAXED = "relaxed",
    PINCHING = "pinching",
    FIST = "fist",
    THUMBS_UP = "thumbs_up",
    POINTING = "pointing",
    ROCK = "rock",
    THUMBS_DOWN = "thumbs_down",
    VICTORY = "victory"
}
declare const SIMULATOR_HAND_POSE_NAMES: Readonly<Record<SimulatorHandPose, string>>;

type SimulatorHandPoseHTMLElement = HTMLElement & {
    visible: boolean;
    handPose?: SimulatorHandPose;
};
declare class SimulatorHands {
    private simulatorControllerState;
    private simulatorScene;
    leftController: THREE.Object3D<THREE.Object3DEventMap>;
    rightController: THREE.Object3D<THREE.Object3DEventMap>;
    leftHand?: THREE.Group;
    rightHand?: THREE.Group;
    leftHandBones: THREE.Object3D[];
    rightHandBones: THREE.Object3D[];
    leftHandPose?: SimulatorHandPose | undefined;
    rightHandPose?: SimulatorHandPose | undefined;
    leftHandAtMaxRange: boolean;
    rightHandAtMaxRange: boolean;
    leftHandCurrentRotations: Partial<Record<"wrist" | "thumb-metacarpal" | "thumb-phalanx-proximal" | "thumb-phalanx-distal" | "thumb-tip" | "index-finger-metacarpal" | "index-finger-phalanx-proximal" | "index-finger-phalanx-intermediate" | "index-finger-phalanx-distal" | "index-finger-tip" | "middle-finger-metacarpal" | "middle-finger-phalanx-proximal" | "middle-finger-phalanx-intermediate" | "middle-finger-phalanx-distal" | "middle-finger-tip" | "ring-finger-metacarpal" | "ring-finger-phalanx-proximal" | "ring-finger-phalanx-intermediate" | "ring-finger-phalanx-distal" | "ring-finger-tip" | "pinky-finger-metacarpal" | "pinky-finger-phalanx-proximal" | "pinky-finger-phalanx-intermediate" | "pinky-finger-phalanx-distal" | "pinky-finger-tip", SimulatorHandJointRotationArray>>;
    rightHandCurrentRotations: Partial<Record<"wrist" | "thumb-metacarpal" | "thumb-phalanx-proximal" | "thumb-phalanx-distal" | "thumb-tip" | "index-finger-metacarpal" | "index-finger-phalanx-proximal" | "index-finger-phalanx-intermediate" | "index-finger-phalanx-distal" | "index-finger-tip" | "middle-finger-metacarpal" | "middle-finger-phalanx-proximal" | "middle-finger-phalanx-intermediate" | "middle-finger-phalanx-distal" | "middle-finger-tip" | "ring-finger-metacarpal" | "ring-finger-phalanx-proximal" | "ring-finger-phalanx-intermediate" | "ring-finger-phalanx-distal" | "ring-finger-tip" | "pinky-finger-metacarpal" | "pinky-finger-phalanx-proximal" | "pinky-finger-phalanx-intermediate" | "pinky-finger-phalanx-distal" | "pinky-finger-tip", SimulatorHandJointRotationArray>>;
    leftHandTargetRotations: Partial<Record<"wrist" | "thumb-metacarpal" | "thumb-phalanx-proximal" | "thumb-phalanx-distal" | "thumb-tip" | "index-finger-metacarpal" | "index-finger-phalanx-proximal" | "index-finger-phalanx-intermediate" | "index-finger-phalanx-distal" | "index-finger-tip" | "middle-finger-metacarpal" | "middle-finger-phalanx-proximal" | "middle-finger-phalanx-intermediate" | "middle-finger-phalanx-distal" | "middle-finger-tip" | "ring-finger-metacarpal" | "ring-finger-phalanx-proximal" | "ring-finger-phalanx-intermediate" | "ring-finger-phalanx-distal" | "ring-finger-tip" | "pinky-finger-metacarpal" | "pinky-finger-phalanx-proximal" | "pinky-finger-phalanx-intermediate" | "pinky-finger-phalanx-distal" | "pinky-finger-tip", SimulatorHandJointRotationArray>>;
    rightHandTargetRotations: Partial<Record<"wrist" | "thumb-metacarpal" | "thumb-phalanx-proximal" | "thumb-phalanx-distal" | "thumb-tip" | "index-finger-metacarpal" | "index-finger-phalanx-proximal" | "index-finger-phalanx-intermediate" | "index-finger-phalanx-distal" | "index-finger-tip" | "middle-finger-metacarpal" | "middle-finger-phalanx-proximal" | "middle-finger-phalanx-intermediate" | "middle-finger-phalanx-distal" | "middle-finger-tip" | "ring-finger-metacarpal" | "ring-finger-phalanx-proximal" | "ring-finger-phalanx-intermediate" | "ring-finger-phalanx-distal" | "ring-finger-tip" | "pinky-finger-metacarpal" | "pinky-finger-phalanx-proximal" | "pinky-finger-phalanx-intermediate" | "pinky-finger-phalanx-distal" | "pinky-finger-tip", SimulatorHandJointRotationArray>>;
    lerpSpeed: number;
    handPosePanelElement?: SimulatorHandPoseHTMLElement;
    input: Input;
    loader: GLTFLoader;
    private leftXRHand;
    private rightXRHand;
    private leftHandRawTargetJoints?;
    private rightHandRawTargetJoints?;
    constructor(simulatorControllerState: SimulatorControllerState, simulatorScene: THREE.Scene);
    /**
     * Initialize Simulator Hands.
     */
    init({ input }: {
        input: Input;
    }): Promise<void>;
    loadMeshes(): Promise<[void, void]>;
    private loadHandMesh;
    setLeftHandLerpPose(pose: SimulatorHandPose): void;
    setRightHandLerpPose(pose: SimulatorHandPose): void;
    /** Applies semantic biomechanical rotations from SimulatorHandPoseRotations. */
    setLeftHandRotations(rotations: SimulatorHandPoseRotations, applyConstraints?: boolean): void;
    /** Applies semantic biomechanical rotations from SimulatorHandPoseRotations. */
    setRightHandRotations(rotations: SimulatorHandPoseRotations, applyConstraints?: boolean): void;
    setLeftHandJoints(joints: DeepReadonly<SimulatorHandPoseJoints>): void;
    setRightHandJoints(joints: DeepReadonly<SimulatorHandPoseJoints>): void;
    update(): void;
    lerpLeftHandPose(): void;
    lerpRightHandPose(): void;
    syncHandJoints(): void;
    setLeftHandPinching(pinching?: boolean): void;
    setRightHandPinching(pinching?: boolean): void;
    showHands(): void;
    hideHands(): void;
    updateHandPosePanel(): void;
    setHandPosePanelElement(element: HTMLElement): void;
    onHandPoseChangeRequest: (event: Event) => void;
    toggleHandedness(): void;
    /** Optional callback fired after the active hand changes. */
    onHandednessChanged?: (handedness: 'left' | 'right') => void;
}

interface SimulatorNavMeshPath {
    target: THREE.Vector3;
    path: THREE.Vector3[];
}
declare class SimulatorNavMesh {
    enabled: boolean;
    ready: boolean;
    private Pathfinding?;
    private pathfinding?;
    private zone?;
    private zoneId;
    private groupId;
    private currentNode;
    private eyeHeight;
    get constrained(): boolean;
    init(options: SimulatorOptions): Promise<void>;
    setEnvironment(environment: SimulatorEnvironment | null, options: SimulatorOptions): Promise<void>;
    setGeometry(geometry: THREE.BufferGeometry): Promise<void>;
    applyUserMovement(camera: THREE.Camera, desiredCameraPosition: THREE.Vector3): void;
    findPathTo(startCameraPosition: THREE.Vector3, targetGroundPosition: THREE.Vector3): THREE.Vector3[] | null;
    findRandomPathFrom(startCameraPosition: THREE.Vector3): SimulatorNavMeshPath | null;
    isGroundPositionReachable(startCameraPosition: THREE.Vector3, targetGroundPosition: THREE.Vector3): boolean;
    isLocationReachable(startCameraPosition: THREE.Vector3, targetGroundPosition: THREE.Vector3): boolean;
    isObjectReachable(startCameraPosition: THREE.Vector3, object: THREE.Object3D): boolean;
    private getGroup;
    private getRandomPointInGroup;
    private getNodeArea;
    private sampleNode;
    private loadGeometry;
    private disposeGLTFResources;
    private disposeMaterial;
    private findFirstMesh;
    private loadPathfinding;
}

declare class SimulatorControlMode {
    protected simulatorControllerState: SimulatorControllerState;
    protected downKeys: Set<Keycodes>;
    protected hands: SimulatorHands;
    protected navMesh: SimulatorNavMesh;
    protected setStereoRenderMode: (_: SimulatorRenderMode) => void;
    protected toggleUserInterface: () => void;
    protected cycleSimulatorMode: () => void;
    camera: THREE.Camera;
    input: Input;
    timer: THREE.Timer;
    domElement?: HTMLCanvasElement;
    simulatorOptions?: SimulatorOptions;
    /**
     * Create a SimulatorControlMode
     */
    constructor(simulatorControllerState: SimulatorControllerState, downKeys: Set<Keycodes>, hands: SimulatorHands, navMesh: SimulatorNavMesh, setStereoRenderMode: (_: SimulatorRenderMode) => void, toggleUserInterface: () => void, cycleSimulatorMode?: () => void);
    /**
     * Initialize the simulator control mode.
     */
    init({ camera, input, timer, domElement, simulatorOptions, }: {
        camera: THREE.Camera;
        input: Input;
        timer: THREE.Timer;
        domElement?: HTMLCanvasElement;
        simulatorOptions?: SimulatorOptions;
    }): void;
    onPointerDown(_: MouseEvent): void;
    onPointerUp(_: MouseEvent): void;
    onPointerMove(_: MouseEvent): void;
    onKeyDown(event: KeyboardEvent): void;
    onModeActivated(): void;
    onModeDeactivated(): void;
    update(): void;
    /**
     * Poll the gamepad and handle button actions. Called from all modes.
     */
    updateGamepad(): void;
    updateCameraPosition(): void;
    private applyYawRelativeMovement;
    /**
     * Handle gamepad buttons for simulator UI using configurable bindings.
     */
    updateGamepadUI(gp: GamepadController): void;
    cycleHandPose(direction: number): void;
    private getHandOrigin;
    limitMovementAtReachEdge(idx: number, localPos: THREE.Vector3, delta: THREE.Vector3): void;
    updateControllerPositions(): void;
    rotateOnPointerMove(event: MouseEvent, objectQuaternion: THREE.Quaternion, multiplier?: number): void;
    enableSimulatorHands(): void;
    disableSimulatorHands(): void;
}

declare class SimulatorScene extends THREE.Scene {
    gltf?: GLTF;
    constructor();
    init(simulatorOptions: SimulatorOptions): Promise<void>;
    setEnvironment(path: string | null, initialPosition: THREE.Vector3): Promise<void>;
    addLights(): void;
    loadGLTF(path: string, initialPosition: THREE.Vector3): Promise<unknown>;
}

declare class SimulatorInterface {
    private elements;
    private interfaceVisible;
    private _gamepadToast?;
    private _gamepadSettings?;
    /**
     * Initialize the simulator interface.
     */
    init(simulatorOptions: SimulatorOptions, simulatorControls: SimulatorControls, simulatorHands: SimulatorHands, input?: Input, simulatorScene?: SimulatorScene, simulatorNavMesh?: SimulatorNavMesh): void;
    createSimulatorSettingsPanel(simulatorOptions: SimulatorOptions, simulatorControls: SimulatorControls, simulatorScene: SimulatorScene, simulatorNavMesh?: SimulatorNavMesh): void;
    showInstructions(simulatorOptions: SimulatorOptions): void;
    showGeminiLivePanel(simulatorOptions: SimulatorOptions): void;
    createHandPosePanel(simulatorOptions: SimulatorOptions, simulatorHands: SimulatorHands): void;
    hideUiElements(): void;
    showUiElements(): void;
    getInterfaceVisible(): boolean;
    toggleInterfaceVisible(): void;
    private _initGamepadUI;
    private _ensureGamepadToast;
    showGamepadToast(gp: GamepadController): void;
    toggleGamepadSettings(gp: GamepadController): void;
}

interface ISimulatorSettingsPanelElement extends HTMLElement {
    environments: SimulatorEnvironment[];
    activeEnvironmentIndex: number;
    simulatorMode: SimulatorMode;
    instructionsEnabled?: boolean;
}

declare class SimulatorControls {
    #private;
    simulatorControllerState: SimulatorControllerState;
    hands: SimulatorHands;
    navMesh: SimulatorNavMesh;
    private userInterface;
    pointerDown: boolean;
    downKeys: Set<Keycodes>;
    simulatorSettingsPanelElement?: ISimulatorSettingsPanelElement;
    simulatorMode: SimulatorMode;
    simulatorModeControls: SimulatorControlMode;
    simulatorModes: {
        [key: string]: SimulatorControlMode;
    };
    renderer: THREE.WebGLRenderer;
    private simulatorOptions?;
    get enabled(): boolean;
    set enabled(value: boolean);
    /**
     * Create the simulator controls.
     * @param hands - The simulator hands manager.
     * @param setStereoRenderMode - A function to set the stereo mode.
     * @param userInterface - The simulator user interface manager.
     */
    constructor(simulatorControllerState: SimulatorControllerState, hands: SimulatorHands, navMesh: SimulatorNavMesh, setStereoRenderMode: (_: SimulatorRenderMode) => void, userInterface: SimulatorInterface);
    /**
     * Initialize the simulator controls.
     */
    init({ camera, input, timer, renderer, simulatorOptions, }: {
        camera: THREE.Camera;
        input: Input;
        timer: THREE.Timer;
        renderer: THREE.WebGLRenderer;
        simulatorOptions: SimulatorOptions;
    }): void;
    connect(): void;
    update(): void;
    onPointerMove: (event: MouseEvent) => void;
    onPointerDown: (event: MouseEvent) => void;
    onPointerUp: (event: MouseEvent) => void;
    onKeyDown: (event: KeyboardEvent) => void;
    onKeyUp: (event: KeyboardEvent) => void;
    onBlur: () => void;
    setSimulatorMode(mode: SimulatorMode): void;
    setSimulatorSettingsPanelElement(element: ISimulatorSettingsPanelElement): void;
    setEnabled(value: boolean): void;
}

declare class SimulatorDepthMaterial extends THREE.MeshBasicMaterial {
    onBeforeCompile(shader: {
        vertexShader: string;
        fragmentShader: string;
        uniforms: object;
    }): void;
}

declare class SimulatorDepth {
    private simulatorScene;
    private renderer;
    private camera;
    private depth;
    depthWidth: number;
    depthHeight: number;
    depthBufferSlice: Float32Array<ArrayBuffer>;
    depthMaterial: SimulatorDepthMaterial;
    depthRenderTarget: THREE.WebGLRenderTarget;
    depthBuffer: Float32Array;
    depthCamera: THREE.Camera;
    /**
     * If true, copies the rendering camera's projection matrix each frame.
     */
    autoUpdateDepthCameraProjection: boolean;
    /**
     * If true, copies the rendering camera's transform each frame.
     */
    autoUpdateDepthCameraTransform: boolean;
    private projectionMatrixArray;
    private updateInFlight;
    constructor(simulatorScene: SimulatorScene);
    /**
     * Initialize Simulator Depth.
     */
    init(renderer: THREE.WebGLRenderer, camera: THREE.Camera, depth: Depth): void;
    createRenderTarget(): void;
    update(): void;
    private updateDepthCamera;
    private renderDepthScene;
    private updateDepth;
}

type InjectableConstructor = Function & {
    dependencies?: Record<string, Constructor>;
};
interface Injectable {
    init(...args: unknown[]): Promise<void> | void;
    constructor: InjectableConstructor;
}
/**
 * Call init on a script or subsystem with dependency injection.
 */
declare function callInitWithDependencyInjection(script: Injectable, registry: Registry, fallback: unknown): Promise<void>;

declare class SimulatorUserAction implements Injectable {
    static dependencies: {};
    init(_options?: object): Promise<void>;
    play(_options?: object): Promise<void>;
}

declare class SimulatorUser extends Script {
    static dependencies: {
        waitFrame: typeof WaitFrame;
        registry: typeof Registry;
    };
    name: string;
    journeyId: number;
    waitFrame: WaitFrame;
    registry: Registry;
    constructor();
    init({ waitFrame, registry }: {
        waitFrame: WaitFrame;
        registry: Registry;
    }): void;
    stopJourney(): void;
    isOnJourneyId(id: number): boolean;
    loadJourney(actions: SimulatorUserAction[]): Promise<void>;
}

/**
 * Represents a single detected object in the XR environment and holds metadata
 * about the object's properties. Note: 3D object position is stored in the
 * position property of `Three.Object3D`.
 */
declare class DetectedObject<T> extends THREE.Object3D {
    label: string;
    image: string | null;
    detection2DBoundingBox: THREE.Box2;
    data: T;
    /**
     * @param label - The semantic label of the object.
     * @param image - The base64 encoded cropped image of the object.
     * @param detection2DBoundingBox - The 2D bounding box of the detected object in normalized screen
     * coordinates. Values are between 0 and 1. Centerpoint of this bounding is
     * used for backproject to obtain 3D object position (i.e., this.position).
     * @param data - Additional properties from the detector.
     * This includes any object proparties that is requested through the
     * schema but is not assigned a class property by default (e.g., color, size).
     */
    constructor(label: string, image: string | null, detection2DBoundingBox: THREE.Box2, data: T);
}

/**
 * Represents a detected object in a normalized format, independent of the specific detector backend used.
 * Coordinates are normalized typically in the range [0, 1].
 *
 * T - The type of additional data associated with the detected object.
 */
interface NormalizedDetectedObject<T> {
    ymin: number;
    xmin: number;
    ymax: number;
    xmax: number;
    objectName: string;
    additionalData?: T;
}
/**
 * Represents a snapshot taken from the device camera.
 * Can contain either a base64 encoded image string or raw ImageData.
 */
interface CameraSnapshot {
    base64?: string;
    imageData?: ImageData;
}
/**
 * Detects objects in the user's environment using a specified backend.
 * It queries an AI model with the device camera feed and returns located
 * objects with 2D and 3D positioning data.
 */
declare class ObjectDetector extends Script {
    static dependencies: {
        options: typeof WorldOptions;
        ai: typeof AI;
        aiOptions: typeof AIOptions;
        deviceCamera: typeof XRDeviceCamera;
        depth: typeof Depth;
        camera: typeof THREE.Camera;
        renderer: typeof THREE.WebGLRenderer;
    };
    /**
     * A map from the object's UUID to our custom `DetectedObject` instance.
     */
    private _detectedObjects;
    private _detectorBackends;
    private activeClients;
    private currentDetectionPromise;
    private lastContinuousDetectionStartedAtMs;
    private _debugVisualsGroup?;
    /**
     * The latest detected objects.
     */
    detectedObjects: DetectedObject<unknown>[];
    private options;
    private ai;
    private aiOptions;
    private deviceCamera;
    private depth;
    private camera;
    private renderer;
    /**
     * Target device profile used to look up RGB camera intrinsics and pose
     * for converting detection bounding boxes into world space. Defaults to
     * `'galaxyxr'`; auto-overridden to `'quest3'` in {@link init} when the
     * Meta Quest browser is detected. Can be overridden manually before init.
     */
    targetDevice: string;
    /**
     * Initializes the ObjectDetector.
     * @override
     */
    init({ options, ai, aiOptions, deviceCamera, depth, camera, renderer, }: {
        options: WorldOptions;
        ai: AI;
        aiOptions: AIOptions;
        deviceCamera: XRDeviceCamera;
        depth: Depth;
        camera: THREE.PerspectiveCamera;
        renderer: THREE.WebGLRenderer;
    }): void;
    /**
     * Starts continuous object detection for the given client.
     * If this is the first client, starts the background detection loop.
     * @param client - The client object requesting object detection.
     */
    start(client: object): void;
    /**
     * Stops continuous object detection for the given client.
     * If this was the last client, stops the background detection loop.
     * @param client - The client object that no longer needs object detection.
     */
    stop(client: object): void;
    /**
     * Called per frame by the engine. If there are active clients,
     * ensures the continuous object detection is running.
     */
    update(): void;
    private runContinuousDetection;
    /**
     * Runs object detection or returns the ongoing detection promise.
     *
     * - If continuous detection is started (has active clients), returns the
     *   promise for the next detection result.
     * - If continuous detection is not started, performs a one-off detection and
     *   returns the result. If a one-off detection is already in progress, returns
     *   the promise for that ongoing detection.
     *
     * @returns A promise that resolves with an
     * array of detected `DetectedObject` instances.
     */
    runDetection<T = null>(): Promise<DetectedObject<T>[]>;
    private runDetectionInternal;
    private getDetectorContext;
    private getOrCreateDetectorBackend;
    private getDepthMeshSnapshot;
    /**
     * Retrieves a list of currently detected objects.
     *
     * @param label - The semantic label to filter by (e.g., 'chair'). If null,
     * all objects are returned.
     * @returns An array of `Object` instances.
     */
    get<T = null>(label?: null): DetectedObject<T>[];
    /**
     * Removes all currently detected objects from the scene and internal
     * tracking.
     */
    clear(): this;
    private clearDetectedObjects;
    /**
     * Toggles the visibility of all debug visualizations for detected objects.
     * @param visible - Whether the visualizations should be visible.
     */
    showDebugVisualizations(visible?: boolean): void;
}

type SimulatorPlaneType = 'horizontal' | 'vertical';
interface SimulatorPlane {
    /** 'horizontal' or 'vertical' */
    type: SimulatorPlaneType;
    /** Optional semantic label for the plane (e.g., 'table', 'floor') */
    label?: string;
    /** Total surface area in square meters */
    area: number;
    /** * The center point of the plane in World Space.
     * This corresponds to the origin of the plane's local coordinate system.
     */
    position: THREE.Vector3;
    /** * Rotation of the plane in World Space.
     * Applying this rotation to (0,1,0) yields the plane's normal.
     */
    quaternion: THREE.Quaternion;
    /** * The boundary points of the plane in Local Space (X, Z).
     * Since +Y is normal, these points lie on the flat surface.
     */
    polygon: THREE.Vector2[];
}

/**
 * Represents a single detected plane in the XR environment. It's a THREE.Mesh
 * that also holds metadata about the plane's properties.
 * Note: This requires chrome://flags/#openxr-spatial-entities to be enabled.
 */
declare class DetectedPlane extends THREE.Mesh {
    xrPlane: XRPlane | null;
    simulatorPlane?: SimulatorPlane | undefined;
    /**
     * A semantic label for the plane (e.g., 'floor', 'wall', 'ceiling', 'table').
     * Since xrPlane.semanticLabel is readonly, this allows user authoring.
     */
    label?: string;
    /**
     * The orientation of the plane ('Horizontal' or 'Vertical').
     */
    orientation?: XRPlaneOrientation;
    /**
     * @param xrPlane - The plane object from the WebXR API.
     * @param material - The material for the mesh.
     */
    constructor(xrPlane: XRPlane | null, material: THREE.Material, simulatorPlane?: SimulatorPlane | undefined);
}

/**
 * Detects and manages real-world planes provided by the WebXR Plane Detection
 * API. It creates, updates, and removes `Plane` mesh objects in the scene.
 */
declare class PlaneDetector extends Script {
    static dependencies: {
        options: typeof WorldOptions;
        renderer: typeof THREE.WebGLRenderer;
    };
    /**
     * A map from the WebXR `XRPlane` object to our custom `DetectedPlane` mesh.
     */
    private _detectedPlanes;
    /**
     * The material used for visualizing planes when debugging.
     */
    private _debugMaterial;
    /**
     * The reference space used for poses.
     */
    private _xrRefSpace?;
    private renderer;
    private usingSimulatorPlanes;
    /**
     * Initializes the PlaneDetector.
     */
    init({ options, renderer, }: {
        options: WorldOptions;
        renderer: THREE.WebGLRenderer;
    }): void;
    /**
     * Processes the XRFrame to update plane information.
     */
    update(_: number, frame: XRFrame): void;
    /**
     * Creates and adds a new `Plane` mesh to the scene.
     * @param frame - WebXR frame.
     * @param xrPlane - The new WebXR plane object.
     */
    private _addPlaneMesh;
    /**
     * Updates an existing `DetectedPlane` mesh's geometry and pose.
     * @param frame - WebXR frame.
     * @param planeMesh - The mesh to update.
     * @param xrPlane - The updated plane data.
     */
    private _updatePlaneMesh;
    /**
     * Removes a `Plane` mesh from the scene and disposes of its resources.
     * @param xrPlane - The WebXR plane object to remove.
     */
    private _removePlaneMesh;
    /**
     * Updates the position and orientation of a `DetectedPlane` mesh from its XR
     * pose.
     * @param frame - The current XRFrame.
     * @param planeMesh - The mesh to update.
     * @param xrPlane - The plane data with the pose.
     */
    private _updatePlanePose;
    /**
     * Retrieves a list of detected planes, optionally filtered by a semantic
     * label.
     *
     * @param label - The semantic label to filter by (e.g.,
     *     'floor', 'wall').
     * If null or undefined, all detected planes are returned.
     * @returns An array of `DetectedPlane` objects
     *     matching the criteria.
     */
    get(label?: string): DetectedPlane[];
    /**
     * Toggles the visibility of the debug meshes for all planes.
     * Requires `showDebugVisualizations` to be true in the options.
     * @param visible - Whether to show or hide the planes.
     */
    showDebugVisualizations(visible?: boolean): void;
    private _addSimulatorPlaneMesh;
    setSimulatorPlanes(planes: SimulatorPlane[]): void;
}

/**
 * A mesh injected into the {@link MeshDetector} by the desktop simulator.
 *
 * The real WebXR Mesh Detection API only produces meshes from
 * `frame.detectedMeshes`, which the simulator never provides. This is the
 * mesh-detection analog of {@link SimulatorPlane}: the simulator extracts the
 * ground-truth geometry of the loaded environment and feeds it to the
 * `MeshDetector` via `setSimulatorMeshes()`.
 */
interface SimulatorMesh {
    /** Vertex positions as flat xyz triples, in world space. */
    vertices: Float32Array;
    /** Triangle indices into {@link vertices}. */
    indices: Uint32Array;
    /**
     * Timestamp of the last geometry change, analogous to `XRMesh.lastChangedTime`.
     * Simulator meshes are static, so this is typically 0.
     */
    lastChangedTime: number;
    /**
     * Optional semantic label (e.g. 'floor', 'ceiling', 'wall'). When it matches
     * one of the detector's debug materials it is colored accordingly; otherwise
     * the fallback debug material is used.
     */
    semanticLabel?: string;
    /**
     * Optional world-space origin. Defaults to the identity. When {@link vertices}
     * are already baked into world space this should be left undefined.
     */
    position?: THREE.Vector3;
    /** Optional world-space orientation. Defaults to the identity. */
    quaternion?: THREE.Quaternion;
}

declare class DetectedMesh extends THREE.Mesh {
    private RAPIER?;
    private rigidBody?;
    private collider?;
    private blendedWorld?;
    private lastChangedTime;
    semanticLabel?: string;
    get getRigidBody(): RAPIER_NS.RigidBody | undefined;
    constructor(mesh: XRMesh | SimulatorMesh, material: THREE.Material);
    initRapierPhysics(RAPIER: typeof RAPIER_NS, blendedWorld: RAPIER_NS.World): void;
    updateVertices(mesh: XRMesh): void;
    dispose(): void;
}

declare class MeshDetector extends Script {
    static readonly dependencies: {
        options: typeof MeshDetectionOptions;
        renderer: typeof THREE.WebGLRenderer;
    };
    private debugMaterials;
    private fallbackDebugMaterial;
    xrMeshToThreeMesh: Map<XRMesh | SimulatorMesh, DetectedMesh>;
    threeMeshToXrMesh: Map<DetectedMesh, XRMesh | SimulatorMesh>;
    private renderer;
    private physics?;
    private usingSimulatorMeshes;
    private defaultMaterial;
    private meshTimedata;
    private readonly MESH_UPDATE_INTERVAL_MS;
    private lastMeshUpdateTime;
    private readonly MESH_STALE_TIME_MS;
    private readonly CLEANUP_INTERVAL_MS;
    private readonly kMaxViewDistance;
    private readonly kFOVCosThreshold;
    private lastCleanupTime;
    private frameCount;
    init({ options, renderer, }: {
        options: MeshDetectionOptions;
        renderer: THREE.WebGLRenderer;
    }): void;
    initPhysics(physics: Physics): void;
    updateMeshes(_timestamp: number, frame?: XRFrame): void;
    private removeMesh;
    private cleanupStaleMeshes;
    /**
     * Injects a set of meshes from the desktop simulator, bypassing the WebXR
     * `frame.detectedMeshes` path. Mirrors `PlaneDetector.setSimulatorPlanes`.
     */
    setSimulatorMeshes(meshes: SimulatorMesh[]): void;
    private createMesh;
    private updateMeshPose;
    private getCameraInfo;
    private computeMeshBoundingBox;
    /** Six clip planes from the view-projection matrix (left, right, bottom, top, near, far). */
    private buildFrustumPlanes;
    private frustumIntersectsBox;
    private shouldShowMeshInViewWithFrustum;
    private shouldShowMeshInViewWithDistance;
}

/**
 * Represents a sound category with its associated confidence score.
 */
interface Category {
    /** The name of the detected category (e.g., "Speech", "Music"). */
    categoryName: string;
    /** The confidence score of the detection, typically between 0 and 1. */
    score: number;
    /** Optional human-readable name for the category. */
    displayName?: string;
}
/**
 * Contains a list of categories for a specific detection.
 */
interface Classification {
    /** Array of detected categories, typically sorted by score. */
    categories: Category[];
}
/**
 * A single result item from the audio classifier.
 */
interface AudioClassifierResultItem {
    /** List of classifications for this result item since there could
     * be multiple types of sounds overlapping in the same time interval. */
    classifications: Classification[];
}
/**
 * Debugging information about the audio processing.
 */
interface DebugData {
    /** Root Mean Square, representing the volume/energy of the audio. */
    rms: number;
    /** The size of the audio buffer processed. */
    bufferSize: number;
    /** The sample rate of the audio data. */
    sampleRate: number;
}
/**
 * The overall result returned by the audio classifier.
 */
interface AudioClassifierResult {
    /** List of result items containing classifications. */
    items: AudioClassifierResultItem[];
    /** Optional debug data. */
    debug?: DebugData;
}

interface SoundDetectorEventMap extends THREE.Object3DEventMap {
    soundDetected: {
        audioClassifierResult: AudioClassifierResult;
    };
}
/**
 * Detects and classifies sounds in the user's environment using a specified backend.
 * It queries an audio classifier model with the device mic input stream and returns
 * classifications over specific time intervals along with confidence scores.
 */
declare class SoundDetector extends Script<SoundDetectorEventMap> {
    static dependencies: {
        options: typeof WorldOptions;
    };
    private _detectorBackends;
    private audioListener?;
    private _isListening;
    get isListening(): boolean;
    private options?;
    /**
     * Initializes the SoundDetector.
     */
    init({ options }: {
        options: WorldOptions;
    }): Promise<void>;
    /**
     * Starts listening to the default mic input stream.
     */
    startListening(): Promise<void>;
    /**
     * Stops listening and releases resources.
     */
    stopListening(): void;
    update(_timestamp: number, _frame?: XRFrame): void;
    private getOrCreateDetectorBackend;
}

/**
 * Names of key human body joints and anatomical landmarks.
 * Includes standard MediaPipe pose landmarks and composite landmarks for
 * skeletal animation compatibility (e.g., Hips, Spine, Chest, Neck, Head).
 */
declare enum PoseJointName {
    Nose = "nose",
    LeftEye = "leftEye",
    RightEye = "rightEye",
    LeftEar = "leftEar",
    RightEar = "rightEar",
    LeftShoulder = "leftShoulder",
    RightShoulder = "rightShoulder",
    LeftElbow = "leftElbow",
    RightElbow = "rightElbow",
    LeftWrist = "leftWrist",
    RightWrist = "rightWrist",
    LeftHip = "leftHip",
    RightHip = "rightHip",
    LeftKnee = "leftKnee",
    RightKnee = "rightKnee",
    LeftAnkle = "leftAnkle",
    RightAnkle = "rightAnkle",
    LeftFoot = "leftFoot",
    RightFoot = "rightFoot",
    Hips = "hips",
    Spine = "spine",
    Chest = "chest",
    Neck = "neck",
    Head = "head"
}
/**
 * Represents a single detected anatomical landmark/joint in a human body pose.
 */
interface PoseLandmark {
    /**
     * Normalized horizontal coordinate [0.0, 1.0] in screen space,
     * where 0.0 is the left edge and 1.0 is the right edge.
     */
    x: number;
    /**
     * Normalized vertical coordinate [0.0, 1.0] in screen space,
     * where 0.0 is the top edge and 1.0 is the bottom edge.
     */
    y: number;
    /**
     * Raw estimated depth value relative to the camera.
     */
    z: number;
    /**
     * The probability [0.0, 1.0] that the landmark is visible (not occluded).
     */
    visibility?: number;
    /**
     * The back-projected 3D position in WebXR world space, measured in meters.
     * Null or undefined if depth projection was unsuccessful.
     */
    worldPosition?: THREE.Vector3;
}
/**
 * Represents a single human body pose detected in physical space.
 * Inherits from `THREE.Object3D` to fit naturally into the Three.js scene graph,
 * positioning itself at the estimated hips/center of the tracked human.
 */
declare class DetectedBodyPose extends THREE.Object3D {
    poseId: number;
    landmarks: PoseLandmark[];
    detection2DBoundingBox: THREE.Box2;
    /**
     * Creates an instance of DetectedBodyPose.
     *
     * @param poseId - A unique tracking identifier for this body pose.
     * @param landmarks - The list of raw and 3D-projected anatomical landmarks.
     * @param detection2DBoundingBox - The 2D bounding box of the person in normalized screen space.
     */
    constructor(poseId: number, landmarks: PoseLandmark[], detection2DBoundingBox: THREE.Box2);
    /**
     * Returns the 3D world space position of a specific joint/landmark in meters.
     * Exposes both standard MediaPipe landmark mappings and composite VRM/humanoid landmarks.
     *
     * @param name - The name of the joint (standard or composite).
     * @returns A clone of the 3D world space position vector, or `null` if the joint is undetected or unprojected.
     */
    getJointPosition(name: PoseJointName | string): THREE.Vector3 | null;
}

/**
 * A detector script that orchestrates human body pose estimation.
 * Manages the backend pose detector lifecycle (e.g., MediaPipe) and exposes the detected
 * poses, including 3D joint landmarks, in the world coordinate space.
 */
declare class HumanRecognizer extends Script {
    static dependencies: {
        options: typeof WorldOptions;
        deviceCamera: typeof XRDeviceCamera;
        depth: typeof Depth;
        camera: typeof THREE.Camera;
        renderer: typeof THREE.WebGLRenderer;
    };
    private detectorBackends;
    private activeClients;
    private currentDetectionPromise;
    private lastContinuousDetectionStartedAtMs;
    /**
     * The latest detected body poses.
     */
    poses: DetectedBodyPose[];
    private options;
    private deviceCamera;
    private depth;
    private camera;
    private renderer;
    targetDevice: string;
    init({ options, deviceCamera, depth, camera, renderer, }: {
        options: WorldOptions;
        deviceCamera: XRDeviceCamera;
        depth: Depth;
        camera: THREE.PerspectiveCamera;
        renderer: THREE.WebGLRenderer;
    }): void;
    /**
     * Starts continuous pose detection for the given client.
     * If this is the first client, starts the background detection loop.
     * @param client - The client object requesting pose detection.
     */
    start(client: object): void;
    /**
     * Stops continuous pose detection for the given client.
     * If this was the last client, stops the background detection loop.
     * @param client - The client object that no longer needs pose detection.
     */
    stop(client: object): void;
    /**
     * Called per frame by the engine. If there are active clients,
     * ensures the continuous pose detection is running.
     */
    update(): void;
    private runContinuousDetection;
    /**
     * Runs a pose detection or returns the ongoing detection promise.
     *
     * - If continuous detection is started (has active clients), returns the promise
     *   for the next detection result.
     * - If continuous detection is not started, performs a one-off detection and
     *   returns the result. If a one-off detection is already in progress, returns
     *   the promise for that ongoing detection.
     *
     * @returns A promise resolving to the next body pose detection result.
     */
    runDetection(): Promise<DetectedBodyPose[]>;
    private runDetectionInternal;
    private getBackendContext;
    private getOrCreateBackend;
    private getDepthMeshSnapshot;
}

/**
 * A single facial landmark point. MediaPipe's FaceLandmarker emits 478
 * of these per face (468 from the canonical face mesh + 10 iris points).
 */
interface FaceLandmark {
    /**
     * Normalized horizontal coordinate [0.0, 1.0] in screen space,
     * where 0.0 is the left edge and 1.0 is the right edge.
     */
    x: number;
    /**
     * Normalized vertical coordinate [0.0, 1.0] in screen space,
     * where 0.0 is the top edge and 1.0 is the bottom edge.
     */
    y: number;
    /**
     * Raw estimated depth value relative to the camera. Smaller magnitude
     * means closer to the camera; the value is in the same arbitrary
     * normalized space as `x` and `y`.
     */
    z: number;
    /**
     * The back-projected 3D position in WebXR world space, measured in
     * meters. Null or undefined if depth projection was unsuccessful.
     */
    worldPosition?: THREE.Vector3;
}
/**
 * A single blendshape category and its activation weight. The category
 * names follow the ARKit blendshape vocabulary used by MediaPipe's
 * Face Landmarker (e.g. `jawOpen`, `mouthSmileLeft`, `eyeBlinkRight`).
 */
interface FaceBlendshape {
    /**
     * The category name (ARKit / FaceLandmarker convention).
     */
    categoryName: string;
    /**
     * Activation weight in `[0.0, 1.0]`. Zero means the blendshape is
     * fully off; one means fully on. MediaPipe applies internal
     * smoothing so consecutive frames don't jitter.
     */
    score: number;
}
/**
 * Common facial landmark anchor names. These map to specific indices
 * in the 478-point MediaPipe FaceLandmarker mesh and are exposed for
 * convenience so callers can read e.g. the nose tip without memorising
 * the index 1.
 */
declare enum FaceLandmarkName {
    NoseTip = "noseTip",
    Chin = "chin",
    LeftEyeOuterCorner = "leftEyeOuterCorner",
    LeftEyeInnerCorner = "leftEyeInnerCorner",
    RightEyeOuterCorner = "rightEyeOuterCorner",
    RightEyeInnerCorner = "rightEyeInnerCorner",
    LeftPupil = "leftPupil",
    RightPupil = "rightPupil",
    MouthLeftCorner = "mouthLeftCorner",
    MouthRightCorner = "mouthRightCorner",
    UpperLipCenter = "upperLipCenter",
    LowerLipCenter = "lowerLipCenter",
    ForeheadCenter = "foreheadCenter"
}
/**
 * Represents a single human face detected in physical space.
 * Inherits from `THREE.Object3D` to fit naturally into the Three.js
 * scene graph, positioning itself at the estimated nose tip of the
 * tracked face. When a facial transformation matrix is emitted by the
 * backend it is decomposed onto `position`, `quaternion`, and `scale`
 * so the Object3D directly represents the rigid head pose.
 */
declare class DetectedFace extends THREE.Object3D {
    faceId: number;
    landmarks: FaceLandmark[];
    detection2DBoundingBox: THREE.Box2;
    blendshapes: FaceBlendshape[];
    facialTransformationMatrix: THREE.Matrix4 | null;
    /**
     * Creates an instance of DetectedFace.
     *
     * @param faceId - A unique tracking identifier for this face.
     * @param landmarks - The 478 raw + 3D-projected facial landmarks.
     * @param detection2DBoundingBox - The 2D bounding box of the face in
     *     normalized screen space.
     * @param blendshapes - Optional 52 ARKit-style blendshape weights.
     *     Empty when the backend was configured with
     *     `outputFaceBlendshapes: false`.
     * @param facialTransformationMatrix - Optional 4x4 rigid head pose
     *     matrix in world space. Null when the backend was configured
     *     with `outputFacialTransformationMatrixes: false`.
     */
    constructor(faceId: number, landmarks: FaceLandmark[], detection2DBoundingBox: THREE.Box2, blendshapes?: FaceBlendshape[], facialTransformationMatrix?: THREE.Matrix4 | null);
    /**
     * Returns the 3D world-space position of a named facial landmark.
     *
     * @param name - The landmark name to look up.
     * @returns A clone of the landmark's world position, or `null` if the
     *     index is out of range or depth back-projection was unsuccessful.
     */
    getLandmarkPosition(name: FaceLandmarkName): THREE.Vector3 | null;
    /**
     * Returns the score for a blendshape category, or `0` if the category
     * isn't present in the current detection.
     *
     * @param categoryName - The ARKit category name, e.g. `jawOpen`.
     */
    getBlendshape(categoryName: string): number;
}

/**
 * A detector script that orchestrates face landmark estimation. Manages
 * the backend face detector lifecycle (e.g. MediaPipe) and exposes the
 * detected faces, including 3D landmark positions, blendshape weights,
 * and rigid head transforms, in the world coordinate space.
 */
declare class FaceRecognizer extends Script {
    static dependencies: {
        options: typeof WorldOptions;
        deviceCamera: typeof XRDeviceCamera;
        depth: typeof Depth;
        camera: typeof THREE.Camera;
        renderer: typeof THREE.WebGLRenderer;
    };
    private _detectorBackends;
    private activeClients;
    private currentDetectionPromise;
    private lastContinuousDetectionStartedAtMs;
    /**
     * The latest detected faces from continuous detection.
     */
    detectedFaces: DetectedFace[];
    private options;
    private deviceCamera;
    depth: Depth;
    private camera;
    private renderer;
    targetDevice: string;
    init({ options, deviceCamera, depth, camera, renderer, }: {
        options: WorldOptions;
        deviceCamera: XRDeviceCamera;
        depth: Depth;
        camera: THREE.PerspectiveCamera;
        renderer: THREE.WebGLRenderer;
    }): void;
    /**
     * Starts continuous face detection for the given client.
     * If this is the first client, starts the background detection loop.
     * @param client - The client object requesting face detection.
     */
    start(client: object): void;
    /**
     * Stops continuous face detection for the given client.
     * If this was the last client, stops the background detection loop.
     * @param client - The client object that no longer needs face detection.
     */
    stop(client: object): void;
    /**
     * Called per frame by the engine. If there are active clients,
     * ensures the continuous face detection is running.
     */
    update(): void;
    private runContinuousDetection;
    /**
     * Runs face landmark detection or returns the ongoing detection promise.
     *
     * - If continuous detection is started (has active clients), returns the
     *   promise for the next detection result.
     * - If continuous detection is not started, performs a one-off detection and
     *   returns the result. If a one-off detection is already in progress, returns
     *   the promise for that ongoing detection.
     */
    runDetection(): Promise<DetectedFace[]>;
    private runDetectionInternal;
    private getBackendContext;
    private getOrCreateBackend;
    private cachedDepthMeshSnapshot;
    private cachedDepthMeshSource;
    private cachedDepthMeshVersion;
    private getDepthMeshSnapshot;
}

/**
 * Per-pixel semantic categories emitted by the selfie multiclass segmentation
 * model. Index `0` is the background; every other index is part of a person,
 * so anything `>= 1` can be treated as foreground.
 */
declare enum SegmentCategory {
    Background = 0,
    Hair = 1,
    BodySkin = 2,
    FaceSkin = 3,
    Clothes = 4,
    Others = 5
}
/**
 * A single-frame segmentation result: a tightly packed, row-major map of
 * per-pixel {@link SegmentCategory} indices at the given resolution.
 */
interface SegmentationMask {
    /** Row-major per-pixel category indices, length `width * height`. */
    data: Uint8Array;
    /** Mask width in pixels. */
    width: number;
    /** Mask height in pixels. */
    height: number;
}

/**
 * A Script that runs semantic segmentation on the device camera feed and
 * returns a per-pixel category mask ({@link SegmentationMask}).
 *
 * Mirrors `HumanRecognizer` / `ObjectDetector`, but without any depth or
 * world-space step, segmentation is a pure 2D camera-to-mask operation, so it
 * does not depend on the depth mesh or camera intrinsics.
 *
 * Multiple concurrent calls to {@link runSegmentation} within the same async
 * cycle are coalesced: only one MediaPipe inference is dispatched per cycle
 * and its result is shared with all callers. The latest completed mask is also
 * available synchronously via {@link latestMask}.
 */
declare class Segmenter extends Script {
    static dependencies: {
        options: typeof WorldOptions;
        deviceCamera: typeof XRDeviceCamera;
    };
    private _backends;
    /** The result of the most recently completed segmentation pass. */
    private _latestMask;
    /**
     * The inference currently in progress, shared among all concurrent callers
     * so MediaPipe is not invoked more than once per cycle.
     */
    private _inferenceInFlight;
    /**
     * Timestamp (ms) of the most recent inference kick-off. Initialised to
     * `Number.NEGATIVE_INFINITY` so the first `update()` tick fires immediately.
     */
    private _lastRunMs;
    private options;
    private deviceCamera;
    init({ options, deviceCamera, }: {
        options: WorldOptions;
        deviceCamera: XRDeviceCamera;
    }): void;
    /**
     * The latest cached segmentation mask from the most recently completed
     * inference pass. Returns `null` until the first inference finishes.
     */
    get latestMask(): SegmentationMask | null;
    /**
     * Continuous throttled loop driven by the engine frame tick.
     *
     * Called every frame by `ScriptsManager` (via `Core.update → scriptsManager.update`).
     * Kicks off a fresh inference pass at most once per
     * `options.segmentation.pollingIntervalMs` milliseconds. The in-flight guard
     * prevents stacking: if a previous inference is still running the tick is
     * silently skipped rather than launching a second one.
     *
     * After each completed inference {@link latestMask} is updated so all
     * consumers in the same frame read the same cached result without each
     * triggering their own MediaPipe run.
     *
     * @param time - Current timestamp in milliseconds, forwarded from the
     *   engine frame loop.
     */
    update(time: number): void;
    /**
     * Runs one segmentation pass over the current camera frame, or returns the
     * result of the in-flight pass when one is already running. Multiple callers
     * in the same async cycle share a single MediaPipe inference rather than
     * each triggering their own.
     *
     * Under normal usage consumers should poll {@link latestMask} (kept fresh
     * by the automatic loop) rather than calling this directly.
     *
     * @returns The mask, or `null` if the backend or camera frame is not ready.
     */
    runSegmentation(): Promise<SegmentationMask | null>;
    private _runInference;
    private getBackendContext;
    private getOrCreateBackend;
}

/**
 * Manages all interactions with the real-world environment perceived by the XR
 * device. This class abstracts the complexity of various perception APIs
 * (Depth, Planes, Meshes, etc.) and provides a simple, event-driven interface
 * for developers to use `this.world.depth.mesh`, `this.world.planes`.
 */
declare class World extends Script {
    static dependencies: {
        options: typeof WorldOptions;
        camera: typeof THREE.Camera;
        waitFrame: typeof WaitFrame;
        timer: typeof THREE.Timer;
    };
    editorIcon: string;
    /**
     * Configuration options for all world-sensing features.
     */
    options: WorldOptions;
    /**
     * The depth module instance. Null if not enabled.
     */
    /**
     * The light estimation module instance. Null if not enabled.
     */
    /**
     * The plane detection module instance. Null if not enabled.
     * Not recommended for anchoring.
     */
    planes?: PlaneDetector;
    /**
     * The object recognition module instance. Null if not enabled.
     */
    objects?: ObjectDetector;
    /**
     * The mesh detection module instance. Null if not enabled.
     */
    meshes?: MeshDetector;
    /**
     * The sound detection module instance. Null if not enabled.
     */
    sounds?: SoundDetector;
    /**
     * The human recognition/pose module instance. Null if not enabled.
     */
    humans?: HumanRecognizer;
    /**
     * The face landmark detection module instance. Null if not enabled.
     */
    faces?: FaceRecognizer;
    /**
     * The semantic segmentation module instance. Null if not enabled.
     */
    segmentation?: Segmenter;
    /**
     * A Three.js Raycaster for performing intersection tests.
     */
    private raycaster;
    private camera;
    private waitFrame;
    private timer;
    private needsRoomCapture;
    private resolveInitialized;
    readonly initializedPromise: Promise<void>;
    /**
     * Initializes the world-sensing modules based on the provided configuration.
     * This method is called automatically by the XRCore.
     */
    init({ options, camera, waitFrame, timer, }: {
        options: WorldOptions;
        camera: THREE.Camera;
        waitFrame: WaitFrame;
        timer: THREE.Timer;
    }): Promise<void>;
    /**
     * Places an object at the reticle.
     */
    anchorObjectAtReticle(_object: THREE.Object3D, _reticle: THREE.Object3D): void;
    /**
     * Updates all active world-sensing modules with the latest XRFrame data.
     * This method is called automatically by the XRCore on each frame.
     * @param _timestamp - The timestamp for the current frame.
     * @param frame - The current XRFrame, containing environmental
     * data.
     * @override
     */
    update(_timestamp: number, frame?: XRFrame): void;
    /**
     * Performs a raycast from a controller against detected real-world surfaces
     * (currently planes) and places a 3D object at the intersection point,
     * oriented to face the user.
     *
     * We recommend using /templates/3_depth/ to anchor objects based on
     * depth mesh for mixed reality experience for accuracy. This function is
     * design for demonstration purposes.
     *
     * @param objectToPlace - The object to position in the
     * world.
     * @param controller - The controller to use for raycasting.
     * @returns True if the object was successfully placed, false
     * otherwise.
     */
    placeOnSurface(objectToPlace: THREE.Object3D, controller: THREE.Object3D): boolean;
    /**
     * Places an object onto a suitable horizontal plane in the environment.
     * It prioritizes planes in front of the user, prefers tables/elevated surfaces over floors,
     * and ensures the object does not intersect other existing objects or other planes in the scene.
     * If placement fails in the current frame, it continues retrying frame-by-frame until the timeout is reached.
     *
     * @param objectToPlace - The Three.js Object3D to place.
     * @param timeout - Optional timeout duration as a Temporal.Duration or Temporal.DurationLike object (defaults to 500ms).
     * @param gridSteps - Optional number of steps along each axis for grid sampling candidate positions (defaults to 5).
     * @returns A promise resolving to true if successfully placed, false otherwise.
     */
    placeOnHorizontalSurface(objectToPlace: THREE.Object3D, timeout?: Temporal.Duration | Temporal.DurationLike, gridSteps?: number): Promise<boolean>;
    /**
     * Toggles the visibility of all debug visualizations for world features.
     * @param visible - Whether the visualizations should be visible.
     */
    showDebugVisualizations(visible?: boolean): void;
}

declare class SimulatorWorld {
    private options;
    private world;
    init(options: Options, world: World, simulatorScene?: SimulatorScene): Promise<void>;
    /**
     * Bakes every sub-mesh of the environment into world-space
     * {@link SimulatorMesh} objects and injects them into the MeshDetector.
     */
    private loadMeshesFromScene;
    private loadPlanes;
}

declare class Simulator extends Script {
    private renderMainScene;
    static dependencies: {
        simulatorOptions: typeof SimulatorOptions;
        input: typeof Input;
        timer: typeof THREE.Timer;
        camera: typeof THREE.Camera;
        renderer: typeof THREE.WebGLRenderer;
        scene: typeof THREE.Scene;
        registry: typeof Registry;
        options: typeof Options;
        depth: typeof Depth;
        world: typeof World;
    };
    editorIcon: string;
    simulatorScene: SimulatorScene;
    simulatorWorld: SimulatorWorld;
    navMesh: SimulatorNavMesh;
    depth: SimulatorDepth;
    simulatorControllerState: SimulatorControllerState;
    hands: SimulatorHands;
    simulatorUser: SimulatorUser;
    userInterface: SimulatorInterface;
    controls: SimulatorControls;
    renderDepthPass: boolean;
    renderMode: SimulatorRenderMode;
    stereoCameras: THREE.Camera[];
    effects?: XREffects;
    virtualSceneRenderTarget?: THREE.WebGLRenderTarget;
    virtualSceneFullScreenQuad?: FullScreenQuad;
    backgroundVideoQuad?: FullScreenQuad;
    videoElement?: HTMLVideoElement;
    simulatorCamera?: SimulatorCamera;
    options: SimulatorOptions;
    renderer: THREE.WebGLRenderer;
    mainCamera: THREE.Camera;
    mainScene: THREE.Scene;
    private initialized;
    private renderSimulatorSceneToCanvasBound;
    private sparkRenderer?;
    private registry?;
    constructor(renderMainScene: (cameraOverride?: THREE.Camera) => void);
    init({ simulatorOptions, input, timer, camera, renderer, scene, registry, options, depth, world, }: {
        simulatorOptions: SimulatorOptions;
        input: Input;
        timer: THREE.Timer;
        camera: THREE.Camera;
        renderer: THREE.WebGLRenderer;
        scene: THREE.Scene;
        registry: Registry;
        options: Options;
        depth: Depth;
        world: World;
    }): Promise<void>;
    simulatorUpdate(): void;
    setStereoRenderMode(mode: SimulatorRenderMode): void;
    setupStereoCameras(camera: THREE.Camera): void;
    onBeforeSimulatorSceneRender(): void;
    onSimulatorSceneRendered(): void;
    getRenderCamera(): THREE.Camera;
    renderScene(): void;
    renderSimulatorScene(): void;
    private renderSimulatorSceneToCanvas;
}

interface Draggable extends THREE.Object3D {
    draggable: boolean;
    dragFacingCamera?: boolean;
}
declare enum DragMode {
    TRANSLATING = "TRANSLATING",
    ROTATING = "ROTATING",
    SCALING = "SCALING",
    DO_NOT_DRAG = "DO_NOT_DRAG"
}
interface HasDraggingMode {
    draggingMode: DragMode;
}
declare class DragManager extends Script {
    static readonly dependencies: {
        input: typeof Input;
        camera: typeof THREE.Camera;
    };
    static readonly IDLE = "IDLE";
    static readonly TRANSLATING = DragMode.TRANSLATING;
    static readonly ROTATING = DragMode.ROTATING;
    static readonly SCALING = DragMode.SCALING;
    static readonly DO_NOT_DRAG = DragMode.DO_NOT_DRAG;
    private mode;
    private controller1?;
    private controller2?;
    private originalObjectPosition;
    private originalObjectRotation;
    private originalObjectScale;
    private originalController1Position;
    private originalController1RotationInverse;
    private originalController1MatrixInverse;
    private originalScalingControllerDistance;
    private originalScalingObjectScale;
    private intersection?;
    private draggableObject?;
    private input;
    private camera;
    type: string;
    name: string;
    editorIcon: string;
    init({ input, camera }: {
        input: Input;
        camera: THREE.Camera;
    }): void;
    onSelectStart(event: SelectEvent): void;
    onSelectEnd(): void;
    update(): void;
    beginDragging(intersection: THREE.Intersection, controller: THREE.Object3D): boolean;
    beginScaling(controller: THREE.Object3D): boolean;
    updateDragging(controller: THREE.Object3D): boolean | undefined;
    updateTranslating(): boolean;
    updateRotating(controller: THREE.Object3D): boolean | undefined;
    updateRotatingFromMouseController(controller: THREE.Object3D): boolean;
    updateScaling(): boolean;
    turnPanelToFaceTheCamera(): void;
    /**
     * Seach up the scene graph to find the first draggable object and the first
     * drag mode at or below the draggable object.
     * @param target - Child object to search.
     * @returns Array containing the first draggable object and the first drag
     *     mode.
     */
    private findDraggableObjectAndDraggingMode;
}

/**
 * Options for View.
 */
type ViewOptions = {
    name?: string;
    isRoot?: boolean;
    selectable?: boolean;
    weight?: number;
    width?: number;
    height?: number;
    x?: number;
    y?: number;
    z?: number;
    paddingX?: number;
    paddingY?: number;
    paddingZ?: number;
    opacity?: number;
    draggingMode?: DragMode;
};

/**
 * A fundamental UI component for creating interactive user
 * interfaces. It serves as a base class for other UI elements like Panels,
 * Rows, and Columns, providing core layout logic, visibility control, and
 * interaction hooks.
 *
 * Each `View` is a `THREE.Object3D` and inherits lifecycle methods from
 * `Script`.
 */
declare class View<TEventMap extends THREE.Object3DEventMap = THREE.Object3DEventMap> extends Script<TEventMap> {
    /** Text description of the view */
    name: string;
    /** The dragging mode of this view, if any. */
    draggingMode?: DragMode;
    /** Flag indicating View behaves as a 2D quad in layout calculations. */
    isQuad: boolean;
    /** Flag indicating if this is the root view of a layout. */
    isRoot: boolean;
    /** Type identifier for easy checking with `instanceof`. */
    isView: boolean;
    /** Determines if this view can be targeted by user input. */
    selectable: boolean;
    /** Proportional size used in layouts like `Row` or `Col`. */
    weight: number;
    /** The width of the view, as a 0-1 ratio of its parent's available space. */
    width: number;
    /** The height of the view, as a 0-1 ratio of its parent's available space. */
    height: number;
    /**
     * The local x-coordinate within the parent's layout, from -0.5 to 0.5.
     * For root view (Panel), this will be addition to the global positioning.
     */
    x: number;
    /**
     * The local y-coordinate within the parent's layout, from -0.5 to 0.5.
     * For root view (Panel), this will be addition to the global positioning.
     */
    y: number;
    /**
     * The local z-coordinate within the parent's layout.
     * For root view (Panel), this will be addition to the global positioning.
     */
    z: number;
    /** Horizontal padding, as a 0-1 ratio of the parent's width. */
    paddingX: number;
    /** Vertical padding, as a 0-1 ratio of the parent's height. */
    paddingY: number;
    /** Depth padding, for z-axis adjustment to prevent z-fighting. */
    paddingZ: number;
    /** The overall opacity of the view and its children. */
    opacity: number;
    /** The underlying THREE.Mesh if the view has a visible geometry. */
    mesh?: THREE.Mesh;
    /** The calculated aspect ratio (width / height) of this view. */
    aspectRatio: number;
    /**
     * Gets the effective horizontal range for child elements, normalized to 1.0
     * for the smaller dimension.
     * @returns The horizontal layout range.
     */
    get rangeX(): number;
    /**
     * Gets the effective vertical range for child elements, normalized to 1.0 for
     * the smaller dimension.
     * @returns The vertical layout range.
     */
    get rangeY(): number;
    /**
     * Creates an instance of View.
     * @param options - Configuration options to apply to the view.
     * @param geometry - The geometry for the view's mesh.
     * @param material - The material for the view's mesh.
     */
    constructor(options?: ViewOptions, geometry?: THREE.BufferGeometry, material?: THREE.Material);
    /**
     * Converts a value from Density-Independent Pixels (DP) to meters.
     * @param dp - The value in density-independent pixels.
     * @returns The equivalent value in meters.
     */
    static dpToMeters(dp: number): number;
    /**
     * Converts a value from Density-Independent Pixels (DP) to local units.
     * @param dp - The value in density-independent pixels.
     * @returns The equivalent value in local units.
     */
    dpToLocalUnits(dp: number): number;
    /** Makes the view and all its descendants visible. */
    show(): void;
    /** Makes the view and all its descendants invisible. */
    hide(): void;
    /**
     * Calculates and applies the position and scale for this single view based on
     * its layout properties and its parent's dimensions.
     */
    updateLayout(): void;
    /** Triggers a layout update for this view and all its descendants. */
    updateLayouts(): void;
    /**
     * Performs a Breadth-First Search (BFS) traversal to update the layout tree,
     * ensuring parent layouts are calculated before their children.
     */
    updateLayoutsBFS(): void;
    /**
     * Resets the layout state of this view. Intended for override by subclasses.
     */
    resetLayout(): void;
    /** Resets the layout state for this view and all its descendants. */
    resetLayouts(): void;
    /**
     * Overrides `THREE.Object3D.add` to automatically trigger a layout update
     * when a new `View` is added as a child.
     */
    add(...children: THREE.Object3D[]): this;
    /**
     * Hook called on a complete select action (e.g., a click) when this view is
     * the target. Intended for override by subclasses.
     * @param _id - The ID of the controller that triggered the action.
     */
    onTriggered(_id: number): void;
}

interface TextViewEventMap extends THREE.Object3DEventMap {
    synccomplete: object;
}
type TextViewOptions = ViewOptions & {
    useSDFText?: boolean;
    font?: string;
    fontSize?: number;
    /**
     * Font size in dp. This will be scale up so it's a consistent size in world
     * coordinates.
     */
    fontSizeDp?: number;
    fontColor?: string | number;
    maxWidth?: number;
    mode?: 'fitWidth' | 'center';
    anchorX?: number | 'left' | 'center' | 'right' | `${number}%`;
    anchorY?: number | 'top' | 'top-baseline' | 'top-cap' | 'top-ex' | 'middle' | 'bottom-baseline' | 'bottom' | `${number}%`;
    textAlign?: 'left' | 'center' | 'right';
    imageOverlay?: string;
    imageOffsetX?: number;
    imageOffsetY?: number;
    text?: string;
};
/**
 * A view for displaying text in 3D. It features a dual-rendering
 * system:
 * 1.  **SDF Text (Default):** Uses `troika-three-text` to render crisp,
 * high-quality text using Signed Distance Fields. This is ideal for most
 * use cases. The library is loaded dynamically on demand.
 * 2.  **HTML Canvas Fallback:** If `troika-three-text` fails to load or is
 * disabled via `useSDFText: false`, it renders text to an HTML canvas and
 * applies it as a texture to a plane.
 */
declare class TextView extends View<TextViewEventMap> {
    /** Determines which rendering backend to use. Defaults to SDF text. */
    useSDFText: boolean;
    /** TextView resides in a panel by default. */
    isRoot: boolean;
    /** Default description of this view in Three.js DevTools. */
    name: string;
    /** The underlying renderable object (either a Troika Text or a Plane. */
    textObj?: TroikaThreeText.Text | THREE.Mesh;
    /** The font file to use. Defaults to Roboto. */
    font: string;
    /** The size of the font in world units. */
    fontSize?: number;
    fontSizeDp?: number;
    /** The color of the font. */
    fontColor: string | number;
    /**
     * The maximum width the text can occupy before wrapping.
     * To fit a long TextView within a container, this value should be its
     * container's height / width to avoid it getting rendered outside.
     */
    maxWidth: number;
    /** Layout mode. 'fitWidth' scales text to fit the view's width. */
    mode: string;
    /** Horizontal anchor point ('left', 'center', 'right'). */
    anchorX: number | 'left' | 'center' | 'right' | `${number}%`;
    /** Vertical anchor point ('top', 'middle', 'bottom'). */
    anchorY: number | 'top' | 'top-baseline' | 'top-cap' | 'top-ex' | 'middle' | 'bottom-baseline' | 'bottom' | `${number}%`;
    /** Horizontal alignment ('left', 'center', 'right'). */
    textAlign: string;
    /** An optional image URL to use as an overlay texture on the text. */
    imageOverlay?: string;
    /** The horizontal offset for the `imageOverlay` texture. */
    imageOffsetX: number;
    /** The vertical offset for the `imageOverlay` texture. */
    imageOffsetY: number;
    /** Relative local offset in X. */
    x: number;
    /** Relative local offset in Y. */
    y: number;
    /** Relative local width. */
    width: number;
    /** Relative local height. */
    height: number;
    /** Fallback HTML canvas to render legacy text. */
    canvas?: HTMLCanvasElement;
    /** Fallback HTML canvas context to render legacy text. */
    ctx?: CanvasRenderingContext2D;
    /** The calculated height of a single line of text. */
    lineHeight: number;
    /** The total number of lines after text wrapping. */
    lineCount: number;
    private _initializeTextCalled;
    private _text;
    set text(text: string);
    get text(): string;
    /**
     * TextView can render text using either Troika SDF text or HTML canvas.
     * @param options - Configuration options for the TextView.
     * @param geometry - Optional geometry for the view's background mesh.
     * @param material - Optional material for the view's background mesh.
     */
    constructor(options?: TextViewOptions, geometry?: THREE.BufferGeometry, material?: THREE.Material);
    /**
     * Initializes the TextView. It waits for the Troika module to be imported
     * and then creates the text object, sets up aspect ratio, and loads overlays.
     */
    init(_?: object): Promise<void>;
    /**
     * Sets the text content of the view.
     * @param text - The text to be displayed.
     */
    setText(text: string): void;
    /**
     * Updates the layout of the text object, such as its render order.
     */
    updateLayout(): void;
    /**
     * Creates the text object using Troika Three Text for SDF rendering.
     * This method should only be called from _initializeText() when `useSDFText`
     * is true and the `troika-three-text` module has been successfully imported.
     */
    protected createTextSDF(): void;
    /**
     * Creates a text object using an HTML canvas as a texture on a THREE.Plane.
     * This serves as a fallback when Troika is not available or `useSDFText` is
     * false. This method should only be called from _initializeText().
     */
    private createTextHTML;
    /**
     * Updates the content of the HTML canvas when not using SDF text.
     * It clears the canvas and redraws the text with the current properties.
     */
    private updateHTMLText;
    /**
     * Callback executed when Troika's text sync is complete.
     * It captures layout data like total height and line count.
     */
    onSyncComplete: () => void;
    /**
     * Private method to perform the actual initialization after the async
     * import has resolved.
     */
    protected _initializeText(): void;
    protected syncTextObj(): void;
    protected setTextColor(color: number | string): void;
    /**
     * Disposes of resources used by the TextView, such as event listeners.
     */
    dispose(): void;
}

/**
 * An interactive circular button that displays a single character
 * icon from the Material Icons font library. It provides visual feedback for
 * hover and selection states by changing its background opacity.
 */
type IconButtonOptions = TextViewOptions & {
    backgroundColor?: THREE.ColorRepresentation;
    defaultOpacity?: number;
    hoverColor?: number;
    hoverOpacity?: number;
    selectedOpacity?: number;
    opacity?: number;
    disabled?: boolean;
};
declare class IconButton extends TextView {
    draggingMode: DragMode;
    /** The overall opacity when the button is not being interacted with. */
    opacity: number;
    /** The background opacity when the button is not being interacted with. */
    defaultOpacity: number;
    /** The background color when a reticle hovers over the button. */
    hoverColor: number;
    /** The background opacity when a reticle hovers over the button. */
    hoverOpacity: number;
    /** The background opacity when the button is actively being pressed. */
    selectedOpacity: number;
    /** Indicates if the button is disabled and should not respond to interaction. */
    disabled: boolean;
    /** The icon font file to use. Defaults to Material Icons. */
    font: string;
    /** The underlying mesh for the button's background. */
    mesh: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>;
    /**
     * Overrides the parent `rangeX` to ensure the circular shape is not affected
     * by panel aspect ratio.
     */
    get rangeX(): number;
    /**
     * Overrides the parent `rangeY` to ensure the circular shape is not affected
     * by panel aspect ratio.
     */
    get rangeY(): number;
    /**
     * An interactive button that displays a single character icon from a font
     * file. Inherits from TextView to handle text rendering.
     * @param options - The options for the IconButton.
     */
    constructor(options?: IconButtonOptions);
    /**
     * Initializes the component and sets the render order.
     */
    init(_?: object): Promise<void>;
    /**
     * Updates the button's visual state based on hover and selection status.
     */
    update(): void;
    /**
     * Overrides the parent's triggered behavior to block it when disabled.
     */
    onTriggered(id: number): void;
    /**
     * Overrides the parent's private initialization method. This is called by the
     * parent's `init()` method after the Troika module is confirmed to be loaded.
     */
    protected _initializeText(): void;
}

/**
 * A specialized `TextView` component designed for conveniently
 * displaying icons from the Google Material Icons font library.
 *
 * This class simplifies the process of creating an icon by pre-configuring the
 * `font` property. To use it, you provide the codepoint or ligature for the
 * desired icon in the `text` option.
 *
 * @example
 * ```typescript
 * // Creates a 'home' icon.
 * const homeIcon = new IconView({ text: 'home', fontSize: 0.1 });
 * ```
 */
type IconViewOptions = TextViewOptions;
declare class IconView extends TextView {
    constructor(options?: IconViewOptions);
}

/**
 * A UI component for displaying a 2D image on a panel in XR.
 * It automatically handles loading the image and scaling it to fit within its
 * layout bounds while preserving the original aspect ratio.
 */
type ImageViewOptions = ViewOptions & {
    src?: string;
};
declare class ImageView extends View {
    /** The URL of the image file to be displayed. */
    src?: string;
    /** The material applied to the image plane. */
    material: THREE.MeshBasicMaterial;
    /** The mesh that renders the image. */
    mesh: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>;
    private texture?;
    private initCalled;
    private textureLoader;
    /**
     * @param options - Configuration options. Can include properties like
     * `src`, `width`, `height`, and other properties from the base `View` class.
     */
    constructor(options?: ImageViewOptions);
    /**
     * Initializes the component. Called once by the XR Blocks lifecycle.
     */
    init(): void;
    /**
     * Reloads the image from the `src` URL. If a texture already exists, it is
     * properly disposed of before loading the new one.
     */
    reload(): void;
    /**
     * Updates the layout of the view and then adjusts the mesh scale to maintain
     * the image's aspect ratio.
     * @override
     */
    updateLayout(): void;
    /**
     * Calculates the correct scale for the image plane to fit within the view's
     * bounds without distortion.
     */
    scaleImageToCorrectAspectRatio(): void;
    /**
     * Sets a new image source and reloads it.
     * @param src - The URL of the new image to load.
     */
    load(src: string): void;
}

/**
 * Identical to text view except sets this.layer to UI_OVERLAY_LAYER.
 */
type LabelViewOptions = TextViewOptions;
declare class LabelView extends TextView {
    constructor(options?: LabelViewOptions);
    protected createTextSDF(): void;
}

/**
 * An interactive button with a rounded rectangle background and a
 * text label. It provides visual feedback for hover and selection states.
 */
type TextButtonOptions = TextViewOptions & {
    backgroundColor?: string;
    opacity?: number;
    maxWidth?: number;
    radius?: number;
    boxSize?: number;
    hoverColor?: string | number;
    selectedFontColor?: string | number;
};
declare class TextButton extends TextView {
    draggingMode: DragMode;
    /** Default description of this view in Three.js DevTools. */
    name: string;
    /** The font size of the text label. */
    fontSize: number;
    /** The color of the text in its default state. */
    fontColor: string | number;
    /** The opacity multiplier of the button. */
    opacity: number;
    /** The intrinsic opacity of the button. */
    defaultOpacity: number;
    /** The color of the text when the button is hovered. */
    hoverColor: string | number;
    /** The opacity multiplier of the text when the button is hovered. */
    hoverOpacity: number;
    /** The color of the text when the button is pressed. */
    selectedFontColor: string | number;
    /** The opacity multiplier of the text when the button is pressed. */
    selectedOpacity: number;
    /** Relative local width. */
    width: number;
    /** Relative local height. */
    height: number;
    /** Layout mode. */
    mode: string;
    /** The horizontal offset for the `imageOverlay` texture. */
    imageOffsetX: number;
    /** The vertical offset for the `imageOverlay` texture. */
    imageOffsetY: number;
    private uniforms;
    /**
     * @param options - Configuration options for the TextButton.
     */
    constructor(options?: TextButtonOptions);
    /**
     * Initializes the text object after async dependencies are loaded.
     */
    init(): Promise<void>;
    /**
     * Updates the text color and background opacity for the hover and selection
     * states. The background never drops below its idle opacity, so buttons with
     * an opaque background only change text color.
     */
    update(): void;
}

/**
 * A UI component for displaying video content on a 3D plane. It
 * supports various sources, including URLs, HTMLVideoElement,
 * THREE.VideoTexture, and the XR Blocks `VideoStream` class. It automatically
 * handles aspect ratio correction to prevent distortion.
 */
type VideoViewOptions = ViewOptions & {
    src?: string;
    muted?: boolean;
    loop?: boolean;
    autoplay?: boolean;
    playsInline?: boolean;
    crossOrigin?: string;
    mode?: 'center' | 'stretch';
};
declare class VideoView extends View {
    draggingMode: DragMode;
    /** Default description of this view in Three.js DevTools. */
    name: string;
    /** The display mode for the video ('center' preserves aspect ratio). */
    mode: 'center' | 'stretch';
    /** The underlying HTMLVideoElement being used for playback. */
    video?: HTMLVideoElement;
    /** The URL source of the video, if loaded from a URL. */
    src?: string;
    /** VideoView resides in a panel by default. */
    isRoot: boolean;
    /** If true, the video will be muted. Default is true. */
    muted: boolean;
    /** If true, the video will loop. Default is true. */
    loop: boolean;
    /** If true, the video will attempt to play automatically. Default is true. */
    autoplay: boolean;
    /** If true, the video will play inline on mobile devices. Default is true. */
    playsInline: boolean;
    /** The cross-origin setting for the video element. Default is 'anonymous'. */
    crossOrigin: string;
    /** The material applied to the video plane. */
    material: THREE.MeshBasicMaterial;
    /** The mesh that renders the video texture. */
    mesh: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>;
    private stream_?;
    private streamReadyCallback_?;
    private texture?;
    private videoAspectRatio;
    /**
     * @param options - Configuration options for the VideoView.
     */
    constructor(options?: VideoViewOptions);
    /**
     * Initializes the component, loading from `src` if provided in options.
     */
    init(): void;
    /**
     * Loads a video from various source types. This is the main method for
     * setting the video content.
     * @param source - The video source (URL, HTMLVideoElement, VideoTexture, or
     * VideoStream).
     */
    load(source: string | HTMLVideoElement | THREE.Texture | VideoStream): void;
    /**
     * Loads video content from an VideoStream, handling the 'ready' event
     * to correctly display the stream and set the aspect ratio.
     * @param stream - The VideoStream instance.
     */
    loadFromStream(stream: VideoStream): void;
    /**
     * Creates a video element and loads content from a URL.
     * @param url - The URL of the video file.
     */
    loadFromURL(url: string): void;
    /**
     * Configures the view to use an existing `HTMLVideoElement`.
     * @param videoElement - The video element to use as the source.
     */
    loadFromVideoElement(videoElement: HTMLVideoElement): void;
    /**
     * Configures the view to use an existing `THREE.VideoTexture`.
     * @param videoTextureInstance - The texture to display.
     */
    loadFromVideoTexture(videoTextureInstance: THREE.VideoTexture): void;
    /**
     * Configures the view to use a generic texture, such as an ExternalTexture
     * produced by WebXR camera access.
     * @param textureInstance - The texture to display.
     */
    loadFromTexture(textureInstance: THREE.Texture): void;
    /** Starts video playback. */
    play(): void;
    /** Pauses video playback. */
    pause(): void;
    private disposeStreamListener_;
    /**
     * Cleans up resources, particularly the underlying video element and texture,
     * to prevent memory leaks.
     */
    dispose(): void;
    /**
     * Updates the layout and scales the video plane to match its aspect ratio.
     * @override
     */
    updateLayout(): void;
}

type PanelOptions = ViewOptions & {
    backgroundColor?: string;
    draggable?: boolean;
    draggingMode?: DragMode;
    touchable?: boolean;
    isRoot?: boolean;
    width?: number;
    height?: number;
    showHighlights?: boolean;
    useDefaultPosition?: boolean;
    useBorderlessShader?: boolean;
    borderWidth?: number;
};

/**
 *A specialized `IconButton` that provides a simple, single-click
 * way for users to end the current WebXR session.
 *
 * It inherits the visual and interactive properties of `IconButton` and adds
 * the specific logic for session termination.
 */
declare class ExitButton extends IconButton {
    /**
     * Declares the dependencies required by this script, which will be injected
     * by the core engine during initialization.
     */
    static dependencies: {
        renderer: typeof THREE.WebGLRenderer;
    };
    /** The size of the 'close' icon font. */
    fontSize: number;
    /** The base opacity when the button is not being interacted with. */
    defaultOpacity: number;
    /** The opacity when a controller's reticle hovers over the button. */
    hoverOpacity: number;
    /** The background color of the button's circular shape. */
    backgroundColor: number;
    /** A private reference to the injected THREE.WebGLRenderer instance. */
    private renderer;
    /**
     * @param options - Configuration options to override the button's default
     * appearance.
     */
    constructor(options?: IconButtonOptions);
    /**
     * Initializes the component and stores the injected renderer dependency.
     * @param dependencies - The injected dependencies.
     */
    init({ renderer }: {
        renderer: THREE.WebGLRenderer;
    }): Promise<void>;
    /**
     * This method is triggered when the button is successfully selected (e.g.,
     * clicked). It finds the active WebXR session and requests to end it.
     * @override
     */
    onTriggered(): void;
}

/**
 * A specialized `THREE.Mesh` designed for rendering UI panel
 * backgrounds. It utilizes a custom shader to draw rounded rectangles
 * (squircles) and provides methods to dynamically update its appearance,
 * such as aspect ratio and size. This class is a core building block for
 * `Panel` components.
 */
declare class PanelMesh extends THREE.Mesh<THREE.PlaneGeometry, THREE.ShaderMaterial> {
    /** Text description of the PanelMesh */
    name: string;
    /**
     * Provides convenient access to the material's shader uniforms.
     * @returns The uniforms object of the shader material.
     */
    get uniforms(): {
        [uniform: string]: THREE.IUniform<any>;
    };
    /**
     * Creates an instance of PanelMesh.
     * @param shader - Shader for the panel mesh.
     * @param backgroundColor - The background color as a CSS string.
     */
    constructor(shader: Shader, backgroundColor?: string);
    /**
     * Sets the panel's absolute dimensions (width and height) in the shader.
     * This is used by the shader to correctly calculate properties like rounded
     * corner radii.
     * @param width - The width of the panel.
     * @param height - The height of the panel.
     */
    setWidthHeight(width: number, height: number): void;
    /**
     * Adjusts the mesh's scale to match a given aspect ratio, preventing the
     * panel from appearing stretched.
     * @param aspectRatio - The desired width-to-height ratio.
     */
    setAspectRatio(aspectRatio: number): void;
}

type PanelFadeState = 'idle' | 'fading-in' | 'fading-out';
/**
 * A fundamental UI container that displays content on a 2D quad in
 * 3D space. It supports background colors, rounded corners (squircles), and can
 * be made interactive and draggable. It serves as a base for building complex
 * user interfaces.
 *
 * The panel intelligently selects a shader:
 * - `SpatialPanelShader`: For interactive, draggable panels with hover/select
 * highlights.
 * - `SquircleShader`: For static, non-interactive panels with a clean, rounded
 * look.
 */
declare class Panel extends View implements Draggable, Partial<HasDraggingMode> {
    static dependencies: {
        user: typeof User;
        timer: typeof THREE.Timer;
    };
    keepFacingCamera: boolean;
    /** Text description of the view */
    name: string;
    /** Type identifier for easy checking with `instanceof`. */
    isPanel: boolean;
    /** The underlying mesh that renders the panel's background. */
    mesh: PanelMesh;
    /** Determines if the panel can be dragged by the user. */
    draggable: boolean;
    /** Dragging mode, defaults to true if draggable else undefined. */
    draggingMode?: DragMode;
    /** Determines if the panel can be touched by the user's hands. */
    touchable: boolean;
    /**
     * If true, a root panel will automatically spawn in front of the user.
     */
    useDefaultPosition: boolean;
    /**
     * Panel by default uses borderless shader.
     * This flag indicates whether to use borderless shader for Spatial Panels.
     */
    useBorderlessShader: boolean;
    /**
     * Whether to show highlights for the spatial panel.
     */
    showHighlights: boolean;
    /** The width of the interactive border, in meters. */
    borderWidth: number;
    /** The background color of the panel, expressed as a CSS color string. */
    backgroundColor: string;
    /**
     * The current state of the fading animation.
     */
    private _fadeState;
    /**
     * Default duration for fade animations in seconds.
     */
    private _fadeDuration;
    /**
     * Timer for the current fade animation, driven by the core clock.
     */
    private _fadeTimer;
    /**
     * The current opacity value, used during animations.
     */
    private _currentOpacity;
    /**
     * The start opacity value for the current animation.
     */
    private _startOpacity;
    /**
     * The target opacity value for the current animation.
     */
    private _targetOpacity;
    /**
     * An optional callback function to execute when a fade animation completes.
     */
    onFadeComplete?: () => void;
    private timer;
    constructor(options?: PanelOptions);
    /**
     * Initializes the panel, setting its default position if applicable.
     */
    init({ user, timer }: {
        user: User;
        timer: THREE.Timer;
    }): void;
    /**
     * Starts fading the panel and its children in.
     * @param duration - Optional fade duration in seconds.
     * @param onComplete - Optional callback when fade completes.
     */
    fadeIn(duration?: number, onComplete?: () => void): void;
    /**
     * Starts fading the panel and its children out.
     * @param duration - Optional fade duration in seconds.
     * @param onComplete - Optional callback when fade completes.
     */
    fadeOut(duration?: number, onComplete?: () => void): void;
    /**
     * Initiates a fade animation.
     */
    private _startFade;
    /**
     * Ensures all child materials are configured for transparency.
     */
    private _prepareMaterialsForFade;
    private _setMaterialOpacity;
    /**
     * Applies the given opacity to all materials in the hierarchy.
     */
    private _applyOpacity;
    /**
     * Finalizes the fade animation, sets final visibility, and triggers callback.
     */
    private _completeFade;
    /**
     * Updates the fade animation progress each frame.
     */
    update(): void;
    /**
     * Adds a Grid layout as a direct child of this panel.
     * @returns The newly created Grid instance.
     */
    addGrid(): Grid;
    /**
     * Updates the panel's visual dimensions based on its layout properties.
     */
    updateLayout(): void;
    /**
     * Gets the panel's width in meters.
     * @returns The width in meters.
     */
    getWidth(): number;
    /**
     * Gets the panel's height in meters.
     * @returns The height in meters.
     */
    getHeight(): number;
}

/**
 * A layout container designed to hold secondary UI elements, such
 * as an exit button or settings icon. It typically "orbits" or remains
 * attached to a corner of its parent panel, outside the main content area.
 */
type OrbiterPosition = 'top-right' | 'top-left' | 'bottom-right' | 'bottom-left' | 'top' | 'bottom' | 'left' | 'right';
type OrbiterOptions = GridOptions & {
    orbiterPosition?: OrbiterPosition;
    orbiterScale?: number;
    offset?: number;
    elevation?: number;
};
declare class Orbiter extends Grid {
    orbiterPosition: OrbiterPosition;
    orbiterScale: number;
    offset: number;
    elevation: number;
    private static readonly BASE_OFFSET;
    private static readonly BASE_ELEVATION;
    private static readonly MAX_OUTWARD;
    constructor(options?: OrbiterOptions);
    init(): void;
    private _place;
}

/**
 * A layout component used within a `Grid` to arrange child elements
 * vertically. The height of each row is determined by its `weight` property
 * relative to the total weight of all rows in the grid.
 */
type RowOptions = GridOptions & {
    weight?: number;
};
declare class Row extends Grid {
    constructor(options?: RowOptions);
}

/**
 * A layout container that arranges child views in a grid-like
 * structure. It provides helper methods like `addRow()` and `addCol()` to
 * declaratively build complex layouts. Children are positioned based on the
 * order they are added and their respective `weight` properties.
 */
type GridOptions = ViewOptions & {
    weight?: number;
};
declare class Grid extends View {
    static RowClass: typeof Row;
    static ColClass: typeof Col;
    static PanelClass: typeof Panel;
    static OrbiterClass: typeof Orbiter;
    /**
     * The weight of the current rows in the grid.
     */
    rowWeight: number;
    /**
     * The weight of the current columns in the grid.
     */
    colWeight: number;
    /**
     * The summed weight to the left of the grid.
     */
    leftWeight: number;
    /**
     * The summed weight to the top of the grid.
     */
    topWeight: number;
    cols: number;
    rows: number;
    /**
     * Initializes the Grid class with the provided Row, Col, and Panel
     * classes.
     * @param RowClass - The class for rows.
     * @param ColClass - The class for columns.
     * @param PanelClass - The class for panels.
     * @param OrbiterClass - The class for panels.
     */
    static init(RowClass: typeof Row, ColClass: typeof Col, PanelClass: typeof Panel, OrbiterClass: typeof Orbiter): void;
    /**
     * Adds an image to the grid.
     * @param options - The options for the image.
     * @returns The added image view.
     */
    addImage(options: ImageViewOptions): ImageView;
    addVideo(options: VideoViewOptions): VideoView;
    addIconButton(options?: IconButtonOptions): IconButton;
    addTextButton(options?: TextButtonOptions): TextButton;
    addIcon(options?: IconButtonOptions): IconView;
    addText(options?: TextViewOptions): TextView;
    addLabel(options: object): LabelView;
    addOrbiter(options?: OrbiterOptions): Orbiter;
    addExitButton(options?: IconButtonOptions): ExitButton;
    /**
     * Adds a panel to the grid.
     * @param options - The options for the panel.
     * @returns The added panel.
     */
    addPanel(options?: PanelOptions): Panel;
    /**
     * Adds a row to the grid.
     * @param options - The options for the row.
     * @returns The added row.
     */
    addRow(options?: RowOptions): Row;
    /**
     * Adds a column to the grid.
     * @param options - The options for the column.
     * @returns The added column.
     */
    addCol(options?: ColOptions): Col;
    /**
     * Updates the layout of the grid.
     */
    updateLayout(): void;
    /**
     * Initializes the layout of the grid with compose().
     */
    resetLayout(): void;
}

/**
 * A layout component used within a `Grid` to arrange child elements
 * horizontally. The width of each column is determined by its `weight` property
 * relative to the total weight of all columns in the same row.
 */
type ColOptions = GridOptions & {
    weight?: number;
};
declare class Col extends Grid {
    constructor(options?: ColOptions);
}

/**
 * A fundamental UI container that lets you display app content in a
 * 3D space. It can be thought of as a "window" or "surface" in XR. It provides
 * visual feedback for user interactions like hovering and selecting, driven by
 * a custom shader, and can be made draggable.
 */
type SpatialPanelOptions = PanelOptions & {
    showEdge?: boolean;
    dragFacingCamera?: boolean;
};
declare class SpatialPanel extends Panel {
    /**
     * Keeps the panel facing the camera as it is dragged.
     */
    dragFacingCamera: boolean;
    /**
     * Creates an instance of SpatialPanel.
     */
    constructor(options?: SpatialPanelOptions);
    update(): void;
    /**
     * Updates shader uniforms to provide visual feedback for controller
     * interactions, such as hover and selection highlights. This method is
     * optimized to only update uniforms when the state changes.
     */
    private _updateInteractionFeedback;
}

type UIJsonNodeOptions = PanelOptions | TextViewOptions | IconViewOptions | ImageViewOptions | LabelViewOptions | TextButtonOptions | VideoViewOptions | ColOptions | GridOptions | RowOptions | OrbiterOptions | SpatialPanelOptions | IconButtonOptions;
type UIJsonNode = {
    type: string;
    options?: UIJsonNodeOptions;
    position?: {
        x: number;
        y: number;
        z: number;
    };
    rotation?: {
        x: number;
        y: number;
        z: number;
    };
    children?: Array<UIJsonNode>;
};
/**
 * Manages the construction and lifecycle of a declarative UI defined by a JSON
 * object. It translates the JSON structure into a hierarchy of UI objects.
 * See samples/ui for a complete example of composing UI with JSON.
 */
declare class UI extends Script {
    views: View[];
    /**
     * A static registry mapping string identifiers to UI component classes.
     * This allows for an extensible and declarative UI system.
     */
    static ComponentRegistry: Map<string, Constructor<View<THREE.Object3DEventMap>>>;
    /**
     * Registers a component class with a string key, making it available to the
     * `compose` function.
     * @param typeName - The key to use in the JSON configuration.
     * @param componentClass - The class constructor of the UI component.
     */
    static registerComponent(typeName: string, componentClass: Constructor<View>): void;
    /**
     * Composes a UI hierarchy from a JSON object and attaches it to this UI
     * instance. This is the primary method for building a declarative UI.
     *
     * @param json - The JSON object defining the UI structure.
     * @returns The root view of the composed UI, or null if composition fails.
     */
    compose(json: UIJsonNode): View | null;
    /**
     * Recursively processes a single node from the UI JSON configuration.
     * @param nodeJson - The JSON node for a single UI element.
     * @returns The composed UI object for this node, or null on error.
     */
    private _composeNode;
}

/**
 * Defines the possible XR modes.
 */
type XRMode = 'AR' | 'VR';
type XRTransitionToVROptions = {
    /** The target opacity. */
    targetAlpha?: number;
    /** The target color. Defaults to `defaultBackgroundColor`. */
    color?: THREE.Color | number;
};
/**
 * Manages smooth transitions between AR (transparent) and VR (colored)
 * backgrounds within an active XR session.
 */
declare class XRTransition extends MeshScript<THREE.SphereGeometry, THREE.MeshBasicMaterial> {
    ignoreReticleRaycast: boolean;
    static dependencies: {
        renderer: typeof THREE.WebGLRenderer;
        camera: typeof THREE.Camera;
        timer: typeof THREE.Timer;
        scene: typeof THREE.Scene;
        options: typeof Options;
    };
    /** Current XR mode, either 'AR' or 'VR'. Defaults to 'AR'. */
    currentMode: XRMode;
    /** The duration in seconds for the fade-in and fade-out transitions. */
    private transitionTime;
    private renderer;
    private scene;
    private sceneCamera;
    private timer;
    private targetAlpha;
    private defaultBackgroundColor;
    constructor();
    init({ renderer, camera, timer, scene, options, }: {
        renderer: THREE.WebGLRenderer;
        camera: THREE.Camera;
        timer: THREE.Timer;
        scene: THREE.Scene;
        options: Options;
    }): void;
    /**
     * Starts the transition to a VR background.
     * @param options - Optional parameters.
     */
    toVR({ targetAlpha, color }?: XRTransitionToVROptions): void;
    /**
     * Starts the transition to a transparent AR background.
     */
    toAR(): void;
    update(): void;
    dispose(): void;
}

/**
 * Core is the central engine of the XR Blocks framework, acting as a
 * singleton manager for all XR subsystems. Its primary goal is to abstract
 * low-level WebXR and THREE.js details, providing a simplified and powerful API
 * for developers and AI agents to build interactive XR applications.
 */
declare class Core {
    static instance?: Core;
    /**
     * Component responsible for capturing screenshots of the XR scene for AI.
     */
    screenshotSynthesizer: ScreenshotSynthesizer;
    /**
     * Component responsible for waiting for the next frame.
     */
    waitFrame: WaitFrame;
    /**
     * Registry used for dependency injection on existing subsystems.
     */
    registry: Registry;
    /**
     * A timer for tracking time deltas. Call timer.getDelta() or getDeltaTime().
     */
    timer: THREE.Timer;
    /** Manages hand, mouse, gaze inputs. */
    input: Input;
    /** The main camera for rendering. */
    camera: THREE.PerspectiveCamera;
    /** The root scene graph for all objects. */
    scene: THREE.Scene<THREE.Object3DEventMap>;
    /** Represents the user in the XR scene. */
    user: User;
    /** Manages all UI elements. */
    ui: UI;
    /** Manages all (spatial) audio playback. */
    sound: CoreSound;
    /** A container to hold all the systems in the scene hierarchy. */
    xrSystemsGroup: XRSystems;
    private renderSceneCallback;
    /** Manages the desktop XR simulator. */
    simulator: Simulator;
    /** Manages drag-and-drop interactions. */
    dragManager: DragManager;
    /** Manages real-world understanding: planes, meshes, objects, and sounds. */
    world: World;
    /** A shared texture loader. */
    textureLoader: THREE.TextureLoader;
    private webXRSettings;
    /** Whether the XR simulator is currently active. */
    simulatorRunning: boolean;
    private startingSimulator?;
    private _isPaused;
    private isSteppingFrame;
    private manualStepTime;
    private _renderer?;
    options: Options;
    deviceCamera?: XRDeviceCamera;
    depth: Depth;
    lighting?: Lighting;
    physics?: Physics;
    xrButton?: XRButton;
    effects?: XREffects;
    ai: AI;
    poseEstimation?: PoseEstimator;
    gestureRecognition?: GestureRecognition;
    transition?: XRTransition;
    currentFrame?: XRFrame;
    scriptsManager: ScriptsManager;
    renderSceneOverride?: (renderer: THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.Camera) => void;
    webXRSessionManager?: WebXRSessionManager;
    permissionsManager: PermissionsManager;
    /**
     * The WebGL renderer, created during {@link Core.init}. Reading it before
     * `init()` has run returns `undefined` and logs a one-time warning.
     */
    get renderer(): THREE.WebGLRenderer;
    set renderer(renderer: THREE.WebGLRenderer);
    get isPaused(): boolean;
    pause(): void;
    resume(): void;
    stepFrame(dtMs?: number): void;
    /**
     * Core is a singleton manager that manages all XR "blocks".
     * It initializes core components and abstractions like the scene, camera,
     * user, UI, AI, and input managers.
     */
    constructor();
    /**
     * Initializes the Core system with a given set of options. This includes
     * setting up the renderer, enabling features like controllers, depth
     * sensing, and physics, and starting the render loop.
     * @param options - Configuration options for the
     * session.
     */
    init(options?: Options): Promise<void>;
    /**
     * The main update loop, called every frame by the renderer. It orchestrates
     * all per-frame updates for subsystems and scripts.
     *
     * Order:
     * 1. Depth
     * 2. World Perception
     * 3. Input / Reticles / UIs
     * 4. Scripts
     * @param time - The current time in milliseconds.
     * @param frame - The WebXR frame object, if in an XR session.
     */
    private update;
    /**
     * Advances the physics simulation by a fixed timestep and calls the
     * corresponding physics update on all active scripts.
     */
    private physicsStep;
    /**
     * Lifecycle callback executed when an XR session starts. Notifies all active
     * scripts.
     * @param session - The newly started WebXR session.
     */
    private onXRSessionStarted;
    private startSimulator;
    /**
     * Lifecycle callback executed when an XR session ends. Notifies all active
     * scripts.
     */
    private onXRSessionEnded;
    /**
     * Lifecycle callback executed when the desktop simulator starts. Notifies
     * all active scripts.
     */
    private onSimulatorStarted;
    /**
     * Handles browser window resize events to keep the camera and renderer
     * synchronized.
     */
    private onWindowResize;
    private renderSimulatorAndScene;
    private renderScene;
}

/**
 * VisemeWeights: the small mouth-shape vocabulary {@link StylizedFace}
 * consumes. Anything that wants to drive a face — a lipsync addon, an
 * ARKit blendshape feed, a hand-authored animation — produces a value
 * of this shape and passes it to `face.setVisemes(...)`.
 *
 * Lives in core (not in any addon) so addons that produce visemes and
 * addons that consume them never have to depend on each other.
 *
 * Each field is a 0..1 weight; values outside that range are clamped
 * by the consumer. The set is deliberately small — it covers the four
 * cardinal vowel shapes plus a generic consonant/closed lip — so it
 * can be driven cheaply from formants, blendshapes, or simple
 * heuristics without needing the full 15-viseme ARKit set.
 */
interface VisemeWeights {
    /** Jaw drop, independent of lip rounding. */
    jawOpen: number;
    /** /aa/ as in "father". Wide and open. */
    aa: number;
    /** /oo/ as in "boot". Narrow and rounded. */
    oo: number;
    /** /oh/ as in "go". Mid-round. */
    oh: number;
    /** /ee/ as in "see". Wide and closed. */
    ee: number;
    /** Generic consonant / lips closed. */
    consonant: number;
}
/** Zero-weight viseme set; useful as a rest pose initialiser. */
declare const ZERO_VISEME: Readonly<VisemeWeights>;

/**
 * StylizedFace: a tiny face primitive that any avatar can adopt. Draws
 * a pair of static eyes and a parametric mouth onto a single canvas
 * texture mapped to a forward-facing plane. The mouth morphs from a
 * thin closed line into a wider oval as the speaker opens up; the eyes
 * occasionally blink so the host head reads as alive.
 *
 * Extends `Script` so the xrblocks scripts manager calls `update()`
 * every frame — that's how the blink loop keeps animating even when
 * nothing is driving the mouth (no incoming lipsync stream, no
 * `setVisemes()` calls). A face with neither audio nor blendshape feed
 * is still a face that blinks.
 *
 * The plane sits flush with the front of the host head sphere on the
 * local -Z side (WebXR head-forward convention) and never z-fights with
 * the head itself. Construct, parent to a head pivot, done. To remove
 * the face from the scene call `parent.remove(face)`; `dispose()`
 * releases the canvas texture and geometry.
 */

interface StylizedFaceOptions {
    /**
     * Approximate radius (metres) of the host head this face attaches to.
     * Used to scale the face quad and place it just outside the head
     * sphere. Defaults to 0.1, matching netblocks `RemoteUserAvatar`'s
     * head sphere; pass 0.18 (for example) if attaching to a bigger
     * custom head.
     */
    headRadius?: number;
    /** Square canvas dimension in pixels. Defaults to 256. */
    textureSize?: number;
    /**
     * Draw the pair of static eyes above the mouth on the same canvas.
     * Defaults to true. Set false when the host avatar already provides
     * its own eye geometry (e.g. a custom puppet head) to avoid
     * doubled-up eyes.
     */
    showEyes?: boolean;
}
interface LipMetrics {
    /** Horizontal mouth width, normalised. Wider for /ee/, narrower for /oo/. */
    width: number;
    /** Vertical mouth opening, 0 (closed line) to ~1 (fully agape). */
    openHeight: number;
}
declare class StylizedFace extends Script {
    readonly mesh: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>;
    readonly texture: THREE.CanvasTexture;
    private readonly canvas;
    private readonly ctx;
    private readonly headRadius;
    private readonly showEyes;
    /** Last viseme weights applied; useful for testing and debugging. */
    visemes: VisemeWeights;
    /** Computed lip metrics from the most recent setVisemes call. */
    metrics: LipMetrics;
    private lastDrawnWidth;
    private lastDrawnOpenHeight;
    private lastDrawnBlinkScale;
    private nextBlinkAt;
    private blinkStartAt;
    private static readonly BLINK_MS;
    private _disposed;
    constructor(opts?: StylizedFaceOptions);
    /**
     * Drive the mouth drawing from a viseme weight set. Cheap enough to
     * call every frame; redraws and re-uploads the canvas texture only
     * when the lip shape or blink frame would actually change pixels.
     */
    setVisemes(v: VisemeWeights): void;
    /**
     * Frame hook — keeps the blink animation running independently of
     * any external `setVisemes` driver. A face that isn't being driven
     * (no lipsync stream, no blendshape feed) still blinks on its own.
     */
    update(): void;
    /** Free the texture, geometry, and material. Idempotent. */
    dispose(): void;
    private drawIfDirty;
    private drawFace;
    /**
     * Returns the vertical scale (0..1) for the eyes at the given wall
     * clock time. 1 = fully open; near 0 = mid-blink. Also advances the
     * blink schedule as a side effect (starts a new blink when due).
     */
    private currentBlinkScale;
}

/**
 * Generates a visual representation of the current depth buffer on a
 * {@link Depth} instance and triggers a download for debugging.
 * @param depth - The depth subsystem instance.
 * @param viewIndex - The depth view index to visualize.
 */
declare function visualizeDepth(depth: Depth, viewIndex?: number): void;
/**
 * Generates a visual representation of a depth map, normalized to 0-1 range,
 * and triggers a download for debugging.
 * @param depthArray - The raw depth data array.
 * @param width - The depth map width in pixels.
 * @param height - The depth map height in pixels.
 */
declare function visualizeDepthMap(depthArray: DepthArray, width: number, height: number): void;

/**
 * Occlusion postprocessing shader pass.
 * This is used to generate an occlusion map.
 * There are two modes:
 * Mode A: Generate an occlusion map for individual materials to use.
 * Mode B: Given a rendered frame, run as a postprocessing pass, occluding all
 * items in the frame. The steps are
 * 1. Compute an occlusion map between the real and virtual depth.
 * 2. Blur the occlusion map using Kawase blur.
 * 3. (Mode B only) Apply the occlusion map to the rendered frame.
 */
declare class OcclusionPass extends Pass {
    private scene;
    private camera;
    renderToScreen: boolean;
    private occludableItemsLayer;
    private depthTextures;
    private occlusionMeshMaterial;
    private occlusionMapUniforms;
    private occlusionMapQuad;
    private occlusionMapTexture;
    private kawaseBlurQuads;
    private kawaseBlurTargets;
    private occlusionUniforms;
    private occlusionQuad;
    private depthNear;
    private lastOcclusionMapSize;
    private lastKawaseBlurSize;
    constructor(scene: THREE.Scene, camera: THREE.PerspectiveCamera, useFloatDepth?: boolean, renderToScreen?: boolean, occludableItemsLayer?: number);
    private setupKawaseBlur;
    setDepthTexture(depthTexture: THREE.Texture, rawValueToMeters: number, viewId: number, depthNear?: number): void;
    /**
     * Render the occlusion map.
     * @param renderer - The three.js renderer.
     * @param writeBuffer - The buffer to write the final result.
     * @param readBuffer - The buffer for the current of virtual depth.
     * @param viewId - The view to render.
     */
    render(renderer: THREE.WebGLRenderer, writeBuffer?: THREE.WebGLRenderTarget, readBuffer?: THREE.WebGLRenderTarget, viewId?: number): void;
    renderOcclusionMapFromScene(renderer: THREE.WebGLRenderer, dimensions: THREE.Vector2, viewId: number): void;
    renderOcclusionMapFromReadBuffer(renderer: THREE.WebGLRenderer, readBuffer: THREE.RenderTarget, dimensions: THREE.Vector2, viewId: number): void;
    blurOcclusionMap(renderer: THREE.WebGLRenderer, dimensions: THREE.Vector2): void;
    private resizeOcclusionMap;
    private resizeKawaseBlur;
    applyOcclusionMapToRenderedImage(renderer: THREE.WebGLRenderer, readBuffer?: THREE.WebGLRenderTarget, writeBuffer?: THREE.WebGLRenderTarget): void;
    dispose(): void;
    updateOcclusionMapUniforms(uniforms: ShaderUniforms, renderer: THREE.WebGLRenderer): void;
}

declare class OcclusionUtils {
    /**
     * Creates a simple material used for rendering objects into the occlusion
     * map. This material is intended to be used with `renderer.overrideMaterial`.
     * @returns A new instance of THREE.MeshBasicMaterial.
     */
    static createOcclusionMapOverrideMaterial(): THREE.MeshBasicMaterial;
    /**
     * Modifies a material's shader in-place to incorporate distance-based
     * alpha occlusion. This is designed to be used with a material's
     * `onBeforeCompile` property. This only works with built-in three.js
     * materials.
     * @param shader - The shader object provided by onBeforeCompile.
     */
    static addOcclusionToShader(shader: Shader): void;
}

/**
 * The result of a stroke recognition attempt.
 */
interface StrokeRecognitionResult {
    /** The name of the recognized shape. */
    recognizedShape: string;
    /** The confidence score of the recognition, typically between 0 and 1. */
    confidence: number;
}

/**
 * Types of events emitted by the StrokeRecognizer.
 */
type UnistrokeEventType = 'unistrokestart' | 'unistrokeupdate' | 'unistrokeend';
/**
 * Detail payload for Unistroke events.
 */
interface UnistrokeEventDetail {
    /** The current world position of the tracked joint (for updates). */
    point?: THREE.Vector3;
    /** The result of the stroke recognition (for end event). */
    result?: StrokeRecognitionResult;
}
/**
 * Custom event for unistroke interactions.
 */
type UnistrokeEvent = THREE.Event & {
    type: UnistrokeEventType;
    target: StrokeRecognizer;
    detail: UnistrokeEventDetail;
};
/**
 * Event map for the StrokeRecognizer, defining the events it can dispatch.
 */
interface StrokeEventMap extends THREE.Object3DEventMap {
    unistrokestart: UnistrokeEvent;
    unistrokeupdate: UnistrokeEvent;
    unistrokeend: UnistrokeEvent;
}
/**
 * StrokeRecognizer is a framework Script that handles recording hand stroke gestures
 * and recognizing them as geometric shapes using a configured provider.
 * It listens to gesture events and tracks specified hand joints to record the path.
 */
declare class StrokeRecognizer extends Script<StrokeEventMap> {
    static dependencies: {
        scene: typeof THREE.Scene;
        camera: typeof THREE.Camera;
        user: typeof User;
        options: typeof StrokeRecognitionOptions;
    };
    private options;
    private recognizer;
    private capturedPoints;
    private isActive;
    private isRecording;
    private gestureStartTime;
    private gestureEndTime;
    private activeHand;
    private scene;
    private camera;
    private user;
    init({ scene, camera, user, options, }: {
        scene: THREE.Scene;
        camera: THREE.Camera;
        user: User;
        options: StrokeRecognitionOptions;
    }): void;
    dispose(): void;
    private configureProvider;
    /**
     * Activates the stroke recognizer, enabling gesture tracking and recording.
     */
    activate(): void;
    /**
     * Deactivates the stroke recognizer and clears any captured points.
     */
    deactivate(): void;
    /**
     * Clears the list of captured points.
     */
    clearPoints(): void;
    /**
     * Adds a point to the current stroke if the maximum point limit has not been reached.
     * @param pos - The world position of the point.
     * @param timestamp - The timestamp when the point was captured.
     */
    addPoint(pos: THREE.Vector3, timestamp: number): void;
    /**
     * Main update loop. Handles recording points during an active gesture
     * and triggers recognition when the gesture ends.
     */
    update(): void;
    /**
     * Calculates the best-fitting plane for a set of 3D points using a simple 3-point estimator.
     * Falls back to camera plane if points are collinear.
     */
    private calculateBestFittingPlane;
    /**
     * Filters captured points, projects them to a 2D plane, and calls the backend recognizer.
     * Uses best-fitting plane if possible, otherwise falls back to camera viewport plane.
     * @returns The recognition result or null if not enough points were captured.
     */
    private recognizeGesture;
}

type FingerName = 'index' | 'middle' | 'ring' | 'pinky';
type DigitName = 'thumb' | FingerName;
type PalmPose = {
    center: THREE.Vector3;
    width: number;
    normal: THREE.Vector3;
    right: THREE.Vector3;
    up: THREE.Vector3;
};
declare const FINGER_ORDER: FingerName[];
declare function getFingerJoint(context: HandContext, finger: FingerName, suffix: string): THREE.Vector3 | undefined;
declare function estimateHandScale(context: HandContext): number;
declare function getPalmWidth(context: HandContext): number | null;
declare function getPalmNormal(context: HandContext): THREE.Vector3 | null;
declare function getPalmRight(context: HandContext): THREE.Vector3 | null;
declare function getPalmUp(context: HandContext): THREE.Vector3 | null;
declare function getPalmPose(context: HandContext): PalmPose | null;
declare function getFingerBendAngles(context: HandContext, finger: FingerName): number[];
declare function getFingerStraightness(context: HandContext, finger: FingerName): number;
declare function getFingerCurl(context: HandContext, finger: FingerName): number;
declare function getFingerDirection(context: HandContext, finger: FingerName): THREE.Vector3 | null;
declare function getFingerPalmAlignment(context: HandContext, finger: FingerName): number;
declare function getFingerSpread(context: HandContext, fingerA: FingerName, fingerB: FingerName): number;
declare function getAdjacentFingerSpreads(context: HandContext): {
    indexMiddle: number;
    middleRing: number;
    ringPinky: number;
};
declare function getThumbBendAngles(context: HandContext): number[];
declare function getThumbStraightness(context: HandContext): number;
declare function getThumbCurl(context: HandContext): number;
declare function getThumbDirection(context: HandContext): THREE.Vector3 | null;
declare function getThumbOpposition(context: HandContext, finger?: FingerName): number;
declare function getThumbVerticalDirection(context: HandContext): number;
declare function getFingertipDistance(context: HandContext, digitA: DigitName, digitB: DigitName): number | null;
declare function getFingertipPalmDistance(context: HandContext, digit: DigitName): number | null;
declare function getBoneVectors(context: HandContext): THREE.Vector3[];
declare function getRelativeBoneAngles(context: HandContext): Float32Array<ArrayBuffer>;
declare function average(values: number[]): number;
declare function clamp01(value: number): number;

type WebXRJointRotations = Map<JointName, THREE.Quaternion>;
declare class WebXRHandContext implements HandContext {
    handedness: Handedness;
    handLabel: HandLabel;
    joints: JointPositions;
    jointRotations: WebXRJointRotations;
    constructor(handedness: Handedness, handLabel: HandLabel, joints: JointPositions, jointRotations: WebXRJointRotations);
    getJoint(jointName: JointName): THREE.Vector3 | undefined;
}
declare class WebXRHandPoseEstimator implements PoseEstimator {
    private user?;
    constructor(user?: User);
    init({ user }?: {
        user?: User;
    }): Promise<void>;
    getHandContext(handedness: Handedness): WebXRHandContext | null;
    getHandContexts(): {
        left: WebXRHandContext | undefined;
        right: WebXRHandContext | undefined;
    };
}

type MediaPipeHandLandmark = {
    x: number;
    y: number;
    z?: number;
};
declare class MediaPipeHandContext implements HandContext {
    handedness: Handedness;
    handLabel: HandLabel;
    joints: JointPositions;
    constructor(handedness: Handedness, handLabel: HandLabel, landmarks: MediaPipeHandLandmark[]);
    getJoint(jointName: JointName): THREE.Vector3 | undefined;
}
declare class MediaPipeHandPoseEstimator implements PoseEstimator {
    init(): Promise<void>;
    getHandContext(_handedness: Handedness): HandContext | null;
    getHandContexts(): Partial<Record<'left' | 'right', HandContext>>;
}

declare class TensorFlowHandPoseEstimator implements PoseEstimator {
    init(): Promise<void>;
    getHandContext(_handedness: Handedness): HandContext | null;
    getHandContexts(): Partial<Record<'left' | 'right', HandContext>>;
}

declare class HeuristicGestureRecognizer implements GestureRecognizer {
    private gestures;
    constructor(initBuiltInGestures?: boolean);
    registerGesture(name: string, detector: HeuristicGestureDetector, config?: DeepReadonly<Partial<GestureConfiguration>>): this;
    unregisterGesture(name: string): this;
    getGestureConfigurations(): Record<string, GestureConfiguration>;
    recognize(context: HandContext): GestureScoreMap;
    private registerBuiltInGestures;
}

declare class SetSimulatorEnvironmentEvent extends Event {
    environmentIndex: number;
    static type: string;
    constructor(environmentIndex: number);
}

declare class SimulatorHandPoseChangeRequestEvent extends Event {
    pose: SimulatorHandPose;
    static type: string;
    constructor(pose: SimulatorHandPose);
}

declare class SetSimulatorModeEvent extends Event {
    simulatorMode: SimulatorMode;
    static type: string;
    constructor(simulatorMode: SimulatorMode);
}

declare class ShowSimulatorInstructionsEvent extends Event {
    static type: string;
    constructor();
}

declare function applySimulatorHandPoseRotationConstraints(rotations: SimulatorHandPoseRotations): SimulatorHandPoseRotations;
declare function resolveSimulatorHandPoseRotations(handedness: Handedness, rotations: SimulatorHandPoseRotations, applyConstraints?: boolean): SimulatorHandPoseJoints;
declare function resolveSimulatorRotationsFromKeypoints(handedness: Handedness, joints: DeepReadonly<SimulatorHandPoseJoints>, applyConstraints?: boolean): SimulatorHandPoseRotations;

declare const SIMULATOR_HAND_POSE_ROTATIONS: Readonly<Record<SimulatorHandPose, SimulatorHandPoseRotations>>;

interface SimulatorPointerLockControllerEventMap extends THREE.Object3DEventMap {
    connected: {
        target: SimulatorPointerLockController;
    };
    disconnected: {
        target: SimulatorPointerLockController;
    };
    selectstart: {
        target: SimulatorPointerLockController;
    };
    selectend: {
        target: SimulatorPointerLockController;
    };
}
declare class SimulatorPointerLockController extends Script<SimulatorPointerLockControllerEventMap> implements Controller {
    static dependencies: {
        camera: typeof THREE.Camera;
    };
    type: string;
    name: string;
    userData: {
        id: number;
        connected: boolean;
        selected: boolean;
    };
    reticle: Reticle;
    camera: THREE.Camera;
    init({ camera }: {
        camera: THREE.Camera;
    }): void;
    updatePose(): void;
    update(): void;
    callSelectStart(): void;
    callSelectEnd(): void;
    connect(): void;
    disconnect(): void;
}

declare class PinchOnButtonAction extends SimulatorUserAction {
    private target;
    static dependencies: {
        simulator: typeof Simulator;
        camera: typeof THREE.Camera;
        timer: typeof THREE.Timer;
        input: typeof Input;
    };
    private simulator;
    private camera;
    private timer;
    private input;
    constructor(target: THREE.Object3D);
    init({ simulator, camera, timer, input, }: {
        simulator: Simulator;
        camera: THREE.Camera;
        timer: THREE.Timer;
        input: Input;
    }): Promise<void>;
    controllerIsPointingAtButton(controls: SimulatorControls, camera: THREE.Camera): boolean;
    rotateControllerTowardsButton(controls: SimulatorControls, camera: THREE.Camera, deltaTime: number): void;
    pinchController(): void;
    play({ simulatorUser, journeyId, waitFrame, }: {
        simulatorUser: SimulatorUser;
        journeyId: number;
        waitFrame: WaitFrame;
    }): Promise<void>;
}

declare class ShowHandsAction extends SimulatorUserAction {
    static dependencies: {
        simulator: typeof Simulator;
    };
    simulator: Simulator;
    init({ simulator }: {
        simulator: Simulator;
    }): Promise<void>;
    play(): Promise<void>;
}

/**
 * Represents a action to walk towards a panel or object.
 */
declare class WalkTowardsPanelAction extends SimulatorUserAction {
    private target;
    static dependencies: {
        camera: typeof THREE.Camera;
        timer: typeof THREE.Timer;
        navMesh: typeof SimulatorNavMesh;
    };
    camera: THREE.Camera;
    timer: THREE.Timer;
    navMesh: SimulatorNavMesh;
    constructor(target: THREE.Object3D);
    init({ camera, timer, navMesh, }: {
        camera: THREE.Camera;
        timer: THREE.Timer;
        navMesh: SimulatorNavMesh;
    }): Promise<void>;
    isLookingAtTarget(): boolean;
    isNearTarget(): boolean;
    lookAtTarget(): void;
    lookTowardsTarget(): void;
    moveTowardsTarget(): void;
    play({ simulatorUser, journeyId, waitFrame, }: {
        simulatorUser: SimulatorUser;
        journeyId: number;
        waitFrame: WaitFrame;
    }): Promise<void>;
}

/**
 * The global singleton instance of Core, serving as the main entry point
 * for the entire XR system.
 */
declare const core: Core;
/**
 * A direct alias to the main `THREE.Scene` instance managed by the core.
 * Use this to add or remove objects from your XR experience.
 * @example
 * ```
 * const myObject = new THREE.Mesh();
 * scene.add(myObject);
 * ```
 */
declare const scene: THREE.Scene<THREE.Object3DEventMap>;
/**
 * A direct alias to the `User` instance, which represents the user in the XR
 * scene and manages inputs like controllers and hands.
 * @example
 * ```
 * if (user.isSelecting()) {
 *   console.log('User is pinching or clicking (globally)!');
 * }
 * ```
 */
declare const user: User;
/**
 * A direct alias to the `World` instance, which manages real-world
 * understanding features like plane detection and object detection.
 */
declare const world: World;
/**
 * A direct alias to the `AI` instance for integrating generative AI features,
 * including multi-modal understanding, image generation, and live conversation.
 */
declare const ai: AI;
/**
 * A direct alias to the `Depth` instance, which manages depth sensing features.
 */
declare const depth: Depth;
/**
 * A direct alias to the `Timer` instance, which manages time deltas.
 */
declare const timer: THREE.Timer;
/**
 * A direct alias to the `CoreSound` instance, which manages audio.
 */
declare const sound: CoreSound;
/**
 * A direct alias to the `Input` instance, which manages inputs like controllers and hands.
 */
declare const input: Input;
/**
 * A direct alias to the `THREE.PerspectiveCamera` instance.
 */
declare const camera: THREE.PerspectiveCamera;
/**
 * A shortcut for `core.scene.add()`. Adds one or more objects to the scene.
 * @param object - The object(s) to add.
 * @see {@link three#Object3D.add}
 */
declare function add(...object: THREE.Object3D[]): THREE.Scene<THREE.Object3DEventMap>;
/**
 * A shortcut for `core.init()`. Initializes the XR Blocks system and starts
 * the render loop. This is the main entry point for any application.
 * @param options - Configuration options for the session.
 * @see {@link Core.init}
 */
declare function init(options?: Options): Promise<void>;
/**
 * A shortcut for `core.scriptsManager.initScript()`. Manually initializes a
 * script and its dependencies.
 * @param script - The script to initialize.
 * @see {@link ScriptsManager.initScript}
 */
declare function initScript(script: Script): Promise<void>;
/**
 * A shortcut for `core.scriptsManager.uninitScript()`. Disposes of a script
 * and removes it from the update loop.
 * @param script - The script to uninitialize.
 * @see {@link ScriptsManager.uninitScript}
 */
declare function uninitScript(script: Script): void;
/**
 * A shortcut for `core.timer.getDelta()`. Gets the time in seconds since
 * the last frame, useful for animations.
 * @returns The delta time in seconds.
 * @see {@link THREE.Timer.getDelta}
 */
declare function getDeltaTime(): number;
/**
 * A shortcut for `core.timer.getElapsed()`. Gets the total time in seconds
 * since the application started.
 * @returns The elapsed time in seconds.
 * @see {@link THREE.Timer.getElapsed}
 */
declare function getElapsedTime(): number;
/**
 * Toggles whether the reticle can target the depth-sensing mesh.
 * @param value - True to add the depth mesh as a target, false to
 * remove it.
 */
declare function showReticleOnDepthMesh(value: boolean): void;
/**
 * Retrieves the left camera from the stereoscopic XR camera rig.
 * @returns The left eye's camera.
 */
declare function getXrCameraLeft(): THREE.WebXRCamera;
/**
 * Retrieves the right camera from the stereoscopic XR camera rig.
 * @returns The right eye's camera.
 */
declare function getXrCameraRight(): THREE.WebXRCamera;

/**
 * Sets the given object and all its children to only be visible in the left
 * eye.
 * @param obj - Object to show only in the left eye.
 * @returns The original object.
 */
declare function showOnlyInLeftEye<T extends THREE.Object3D>(obj: T): T;
/**
 * Sets the given object and all its children to only be visible in the right
 * eye.
 * @param obj - Object to show only in the right eye.
 * @returns The original object.
 */
declare function showOnlyInRightEye<T extends THREE.Object3D>(obj: T): T;
/**
 * Loads a stereo image from a URL and returns two THREE.Texture objects, one
 * for the left eye and one for the right eye.
 * @param url - The URL of the stereo image.
 * @returns A promise that resolves to an array containing the left and right
 *     eye textures.
 */
declare function loadStereoImageAsTextures(url: string): Promise<THREE.Texture<unknown, THREE.TextureEventMap>[]>;

type MaterialSymbolsViewOptions = {
    /** The name of the icon (e.g., 'sunny', 'home'). */
    icon?: string;
    /** The weight of the icon (e.g., 100, 400, 700). */
    iconWeight?: number;
    /** The style of the icon ('outlined', 'filled', or 'round'). */
    iconStyle?: string;
    /** The scale factor for the icon. */
    iconScale?: number;
    /** The color of the icon in hex format (e.g., '#FFFFFF'). */
    iconColor?: string;
};
/**
 * A View that dynamically loads and displays an icon from the Google
 * Material Symbols library as a 3D object. It constructs the icon from SVG
 * data, allowing for customization of weight, style, color, and scale.
 */
declare class MaterialSymbolsView extends View {
    #private;
    get icon(): string;
    set icon(value: string);
    get iconWeight(): number;
    set iconWeight(value: number);
    get iconStyle(): string;
    set iconStyle(value: string);
    get iconColor(): string;
    set iconColor(value: string);
    iconScale: number;
    private loadedSvgPath?;
    private loadingSvgPath?;
    private group?;
    /**
     * Construct a Material Symbol view.
     * @param options - Options for the icon.
     */
    constructor({ icon, iconWeight, iconStyle, iconScale, iconColor, }: MaterialSymbolsViewOptions);
    init(): Promise<void>;
    /**
     * Updates the icon displayed by loading the appropriate SVG from the Material
     * Symbols library based on the current `icon`, `iconWeight`, and `iconStyle`
     * properties.
     * @returns Promise<void>
     */
    updateIcon(): Promise<void>;
}

/**
 * Manages the state and animation logic for a scrolling text view.
 * It tracks the total number of lines, the current scroll position (as a line
 * number), and the target line, smoothly animating between them over time.
 */
declare class TextScrollerState extends Script {
    static dependencies: {
        timer: typeof THREE.Timer;
    };
    scrollSpeedLinesPerSecond: number;
    lines: number;
    currentLine: number;
    targetLine: number;
    shouldUpdate: boolean;
    timer: THREE.Timer;
    lineCount: number;
    init({ timer }: {
        timer: THREE.Timer;
    }): void;
    update(): false | undefined;
}

/**
 * A high-quality scrolling text view that uses Troika for SDF text
 * rendering and a `VerticalPager` for clipping and scrolling. This component is
 * ideal for displaying logs, chat histories, or other long-form text content
 * that requires crisp rendering and smooth scrolling.
 *
 * It is built by composing three key components:
 * - A `TextView` to render the actual text content.
 * - A `TextScrollerState` to manage the animation and state of the scroll
 * position.
 * - A `VerticalPager` to clip the `TextView` and create the visible scroll
 * window.
 */
type ScrollingTroikaTextViewOptions = ViewOptions & {
    text?: string;
    textAlign?: 'left' | 'right' | 'center';
    scrollerState?: TextScrollerState;
    fontSize?: number;
};
declare class ScrollingTroikaTextView extends View {
    private scrollerState;
    private pager;
    private textViewWrapper;
    private textView;
    private currentText;
    constructor({ text, textAlign, scrollerState, fontSize, }?: ScrollingTroikaTextViewOptions);
    update(): void;
    addText(text: string): void;
    setText(text: string): void;
    onTextSyncComplete: () => void;
    clipToLineHeight(): void;
}

/**
 * A non-visual helper class for calculating a slider value based on
 * a controller's movement relative to an initial pose. It can derive the value
 * from either positional (for XR hands/controllers) or rotational (for mouse)
 * input, making it a flexible tool for creating virtual sliders without a
 * visible UI element.
 */
declare class FreestandingSlider {
    startingValue: number;
    minValue: number;
    maxValue: number;
    scale: number;
    initialPosition: THREE.Vector3;
    initialRotationInverse: THREE.Quaternion;
    rotationScale: number;
    /**
     * Create a freestanding slider object.
     */
    constructor(startingValue?: number, minValue?: number, maxValue?: number, scale?: number, rotationScale?: number);
    /**
     * Captures the initial position and rotation to serve as the reference point
     * for the gesture.
     * @param position - The starting world position.
     * @param rotation - The starting world rotation.
     */
    setInitialPose(position: THREE.Vector3, rotation: THREE.Quaternion): void;
    /**
     * A convenience method to capture the initial pose from a controller object.
     * @param controller - The controller to use as the reference.
     */
    setInitialPoseFromController(controller: THREE.Object3D): void;
    /**
     * Calculates the slider value based on a new world position.
     * @param position - The current world position of the input source.
     * @returns The calculated slider value, clamped within the min/max range.
     */
    getValue(position: THREE.Vector3): number;
    /**
     * Calculates the slider value based on a new world rotation (for mouse
     * input).
     * @param rotation - The current world rotation of the input source.
     * @returns The calculated slider value, clamped within the min/max range.
     */
    getValueFromRotation(rotation: THREE.Quaternion): number;
    /**
     * A polymorphic method that automatically chooses the correct calculation
     * (positional or rotational) based on the controller type.
     * @param controller - The controller providing the input.
     * @returns The calculated slider value.
     */
    getValueFromController(controller: THREE.Object3D): number;
    /**
     * Updates the starting value, typically after a gesture has ended.
     * @param value - The new starting value for the next gesture.
     */
    updateValue(value: number): void;
}

/**
 * A specialized `THREE.Mesh` that serves as the interactive base for
 * a `ModelViewer`. It has a distinct visual appearance and handles the logic
 * for fading in and out on hover. Its `draggingMode` is set to `TRANSLATING` to
 * enable movement.
 */
declare class ModelViewerPlatform extends THREE.Mesh<THREE.BufferGeometry, THREE.Material[]> {
    draggingMode: DragMode;
    opacity: AnimatableNumber;
    constructor(width: number, depth: number, thickness: number);
    update(deltaTime: number): void;
}

interface GLTFData {
    model: string;
    path: string;
    scale?: THREE.Vector3Like;
    rotation?: THREE.Vector3Like;
    position?: THREE.Vector3Like;
    verticallyAlignObject?: boolean;
    horizontallyAlignObject?: boolean;
}
interface SplatData {
    model: string;
    scale?: THREE.Vector3Like;
    rotation?: THREE.Vector3Like;
    position?: THREE.Vector3Like;
    verticallyAlignObject?: boolean;
    horizontallyAlignObject?: boolean;
}
declare class SplatAnchor extends THREE.Object3D implements HasDraggingMode {
    draggingMode: DragMode;
}
declare class RotationRaycastMesh extends THREE.Mesh<THREE.BufferGeometry, THREE.Material> {
    constructor(geometry: THREE.BufferGeometry, material: THREE.Material);
    draggingMode: DragMode;
}
/**
 * A comprehensive UI component for loading, displaying, and
 * interacting with 3D models (GLTF and Splats) in an XR scene. It
 * automatically creates an interactive platform for translation and provides
 * mechanisms for rotation and scaling in both desktop and XR.
 */
declare class ModelViewer extends Script implements Draggable {
    static dependencies: {
        camera: typeof THREE.Camera;
        depth: typeof Depth;
        scene: typeof THREE.Scene;
        renderer: typeof THREE.WebGLRenderer;
        registry: typeof Registry;
        timer: typeof THREE.Timer;
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
    bbox: THREE.Box3;
    protected data?: GLTFData | SplatData;
    protected timer: THREE.Timer;
    protected animationMixer?: THREE.AnimationMixer;
    protected gltfMesh?: GLTF;
    protected splatMesh?: SplatMesh;
    protected splatAnchor?: SplatAnchor;
    protected hoveringControllers: Set<unknown>;
    protected raycastToChildren: boolean;
    protected occludableShaders: Set<Shader>;
    protected camera?: THREE.Camera;
    protected depth?: Depth;
    protected scene?: THREE.Scene;
    protected renderer?: THREE.WebGLRenderer;
    protected platform?: ModelViewerPlatform;
    protected controlBar?: THREE.Mesh;
    protected rotationRaycastMesh?: RotationRaycastMesh;
    protected registry?: Registry;
    constructor({ castShadow, receiveShadow, raycastToChildren, }: {
        castShadow?: boolean | undefined;
        receiveShadow?: boolean | undefined;
        raycastToChildren?: boolean | undefined;
    });
    init({ camera, depth, scene, renderer, registry, timer, }: {
        camera: THREE.Camera;
        depth: Depth;
        scene: THREE.Scene;
        renderer: THREE.WebGLRenderer;
        registry: Registry;
        timer: THREE.Timer;
    }): Promise<void>;
    loadSplatModel({ data, onSceneLoaded, platformMargin, setupRaycastCylinder, setupRaycastBox, setupPlatform, }: {
        data: SplatData;
        onSceneLoaded?: (scene: THREE.Object3D) => void;
        platformMargin?: THREE.Vector2;
        setupRaycastCylinder?: boolean;
        setupRaycastBox?: boolean;
        setupPlatform?: boolean;
    }): Promise<void | SplatAnchor>;
    loadGLTFModel({ data, onSceneLoaded, platformMargin, setupRaycastCylinder, setupRaycastBox, setupPlatform, renderer, addOcclusionToShader, }: {
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

/**
 * A `View` that functions as a drawable canvas in 3D space. It uses
 * an HTML canvas as a texture on a plane, allowing users to draw on its surface
 * with their XR controllers. It supports basic drawing, undo, and redo
 * functionality.
 */
declare class SketchPanel extends View {
    #private;
    draggingMode: DragMode;
    static dependencies: {
        user: typeof User;
    };
    private canvas;
    private ctx;
    private activeHand;
    private activeLine;
    private activeLines;
    private removedLines;
    private isDrawing;
    private user;
    material: THREE.MeshBasicMaterial;
    constructor();
    /**
     * Init the SketchPanel.
     */
    init({ user }: {
        user: User;
    }): void;
    getContext(): CanvasRenderingContext2D;
    triggerUpdate(): void;
    onSelectStart(event: SelectEvent): void;
    onSelectEnd(event: SelectEvent): void;
    /**
     * Updates the painter's line to the current pivot position during selection.
     */
    onSelecting(event: SelectEvent): void;
    clearCanvas(forceUpdate?: boolean): void;
    removeAll(): void;
    undo(): void;
    redo(): void;
    update(): void;
}

/**
 * A state management class for a `Pager` component. It tracks the
 * total number of pages, the current scroll position, and handles the physics
 * and animation logic for smooth, inertia-based scrolling between pages.
 */
declare class PagerState extends Script {
    static dependencies: {
        timer: typeof THREE.Timer;
    };
    currentPage: number;
    shouldUpdate: boolean;
    pages: number;
    timer: THREE.Timer;
    constructor({ pages }: {
        pages?: number | undefined;
    });
    init({ timer }: {
        timer: THREE.Timer;
    }): void;
    update(): false | undefined;
    addPage(): number;
}

type PagerOptions = ViewOptions & {
    state?: PagerState;
    enableRaycastOnChildren?: boolean;
    continuousScrolling?: boolean;
};
/**
 * A layout container that manages a collection of `Page` views and
 * allows the user to navigate between them, typically through swiping
 * gestures. It clips the content of its pages to create a sliding window
 * effect.
 */
declare class Pager extends View {
    static dependencies: {
        renderer: typeof THREE.WebGLRenderer;
        input: typeof Input;
    };
    localClippingPlanes: THREE.Plane[];
    raycastMesh: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial, THREE.Object3DEventMap>;
    state: PagerState;
    clippingPlanes: THREE.Plane[];
    private selecting;
    private selectStartPositionLocal;
    private selectStartPage;
    private raycastPlane;
    private selectingRay;
    private selectingRayTarget;
    private selectingController;
    private enableRaycastOnChildren;
    private continuousScrolling;
    private input;
    constructor(options?: PagerOptions);
    init({ renderer, input }: {
        renderer: THREE.WebGLRenderer;
        input: Input;
    }): void;
    updatePageCount(): void;
    updatePagePositions(): void;
    resetClippingPlanesToLocalSpace(): void;
    updateClippingPlanes(): void;
    update(): void;
    updateLayout(): void;
    onObjectSelectStart(event: SelectEvent): boolean;
    protected computeSelectingDelta(selectingPosition: THREE.Vector3, startSelectPosition: THREE.Vector3): number;
    onSelecting(): void;
    onObjectSelectEnd(event: SelectEvent): boolean;
    /**
     * Raycast to the pager's raycastMesh so the user can scroll across pages.
     */
    raycast(raycaster: THREE.Raycaster, intersects: THREE.Intersection[]): boolean;
}

/**
 * A specialized `Pager` that arranges its pages horizontally and
 * enables horizontal swiping gestures for navigation. It clips content that
 * is outside the viewable area.
 */
declare class HorizontalPager extends Pager {
    localClippingPlanes: THREE.Plane[];
    updateLayout(): void;
}

/**
 * A UI component that visually displays the current page and total
 * number of pages for a `Pager`. It typically renders as a series of dots
 * (e.g., "◦ ● ◦") to indicate the user's position in a carousel.
 */
declare class PageIndicator extends TextView {
    emptyPageIndicator: string;
    currentPageIndicator: string;
    numberOfPages: number;
    pagerState: PagerState;
    previousPage: number;
    constructor({ pagerState }: {
        pagerState: PagerState;
    });
    update(): void;
    updateText(): void;
}

/**
 * A specialized `Pager` that arranges its pages vertically and
 * enables vertical swiping gestures. It is commonly used as the foundation for
 * scrollable text views.
 */
declare class VerticalPager extends Pager {
    localClippingPlanes: THREE.Plane[];
    updateLayout(): void;
    protected computeSelectingDelta(selectingPosition: THREE.Vector3, startSelectPosition: THREE.Vector3): number;
}

declare enum BvhImportStatus {
    PENDING = 0,
    SUCCESS = 1,
    FAILED = 2
}
/**
 * Whether the BVH module has been loaded AND the THREE prototypes have
 * been patched. Sync check; returns false until `enableAcceleratedRaycast()`
 * (or `applyBVH()`) has resolved at least once.
 */
declare function isBVHReady(): boolean;
/**
 * Dynamically import three-mesh-bvh and install the prototype patches
 * that route `THREE.Mesh.raycast` through the accelerated path when
 * the target mesh has a computed bounds tree. Adds
 * `computeBoundsTree` / `disposeBoundsTree` helpers to
 * `THREE.BufferGeometry`.
 *
 * Async because the BVH module is loaded on demand (same pattern as
 * troika-three-text). Resolves to `true` if the module loaded and
 * patches were applied, `false` if the module isn't available — in
 * which case meshes continue to use the stock raycaster.
 *
 * Safe to call multiple times. The first call kicks off the import,
 * subsequent calls share the same promise.
 */
declare function enableAcceleratedRaycast(): Promise<boolean>;
/**
 * Walk the given object3D (recursively) and build a bounds tree on
 * every standard `THREE.Mesh` whose geometry doesn't already have one.
 * Subsequent `raycaster.intersectObject(root, true)` calls then go
 * through the BVH-accelerated path.
 *
 * Use on dense, static environmental meshes only (loaded immersive
 * scenes, photogrammetry scans, baked levels). The tree has a one-time
 * build + memory cost and assumes static vertices, so it's a net loss
 * for low-poly / UI / dynamic meshes. Don't apply globally to
 * `xb.core.scene`.
 *
 * Skips `THREE.SkinnedMesh`: skinned meshes deform vertices on the GPU
 * each frame, so a bounds tree built on the bind-pose geometry is wrong
 * the moment the mesh animates. Three's `SkinnedMesh.raycast()` also
 * overrides the patched `Mesh.prototype.raycast` and does its own CPU
 * skinning, so the BVH would never be consulted anyway.
 *
 * Skips `THREE.BatchedMesh`: three-mesh-bvh ships a dedicated
 * `computeBatchedBoundsTree` / `disposeBatchedBoundsTree` pair that
 * builds per-draw-range BVHs on `this.boundsTrees` (plural), and
 * `acceleratedRaycast` has a separate `isBatchedMesh` branch that
 * consults those. The standard `computeBoundsTree` would index the
 * combined batched buffer and produce wrong hits. Conservative skip
 * until the batched helpers are wired up.
 *
 * `THREE.InstancedMesh` is NOT skipped: its `.raycast()` calls a
 * shared internal `Mesh` per instance, which does route through the
 * patched `Mesh.prototype.raycast`, so a BVH on the shared geometry
 * accelerates every per-instance test.
 *
 * Async because it awaits the dynamic import of three-mesh-bvh. If the
 * module isn't available, this is a no-op. Idempotent across calls.
 */
declare function applyBVH(root: THREE.Object3D, { recursive }?: {
    recursive?: boolean;
}): Promise<void>;
/**
 * Walk the given object3D (recursively) and dispose any bounds trees
 * previously built by `applyBVH`. Sync; no-op if three-mesh-bvh
 * wasn't loaded.
 */
declare function disposeBVH(root: THREE.Object3D, { recursive }?: {
    recursive?: boolean;
}): void;
declare function _getBvhImportStatus(): {
    status: BvhImportStatus;
    error?: Error;
};

declare const DOWN: Readonly<THREE.Vector3>;
declare const UP: Readonly<THREE.Vector3>;
declare const FORWARD: Readonly<THREE.Vector3>;
declare const BACK: Readonly<THREE.Vector3>;
declare const LEFT: Readonly<THREE.Vector3>;
declare const RIGHT: Readonly<THREE.Vector3>;
declare const ZERO_VECTOR3: Readonly<THREE.Vector3>;

/**
 * Manages the global THREE.DefaultLoadingManager instance for
 * XRBlocks and handles communication of loading progress to the parent iframe.
 * This module controls the visibility of a loading spinner
 * in the DOM based on loading events.
 *
 * Import the single instance
 * `loadingSpinnerManager` to use it throughout the application.
 */
declare class LoadingSpinnerManager {
    /**
     * DOM element of the loading spinner, created
     * when showSpinner() is called and removed on `onLoad` or `onError`.
     */
    private spinnerElement?;
    /**
     * Tracks if the manager is currently loading assets.
     */
    isLoading: boolean;
    constructor();
    showSpinner(): void;
    hideSpinner(): void;
    private setupCallbacks;
}
declare const loadingSpinnerManager: LoadingSpinnerManager;

type ModelLoaderLoadGLTFOptions = {
    /** The base path for the model files. */
    path?: string;
    /** The URL of the model file. */
    url: string;
    /** The renderer. */
    renderer?: THREE.WebGLRenderer;
};
type ModelLoaderLoadOptions = ModelLoaderLoadGLTFOptions & {
    /**
     * Optional callback for loading progress. Note: This will be ignored if a
     * LoadingManager is provided.
     */
    onProgress?: (event: ProgressEvent) => void;
};
/**
 * Manages the loading of 3D models, automatically handling dependencies
 * like DRACO and KTX2 loaders.
 */
declare class ModelLoader {
    private manager;
    /**
     * Creates an instance of ModelLoader.
     * @param manager - The
     *     loading manager to use,
     * required for KTX2 texture support.
     */
    constructor(manager?: THREE.LoadingManager);
    /**
     * Loads a model based on its file extension. Supports .gltf, .glb,
     * .ply, .spz, .splat, and .ksplat.
     * @returns A promise that resolves with the loaded model data (e.g., a glTF
     *     scene or a SplatMesh).
     */
    load({ path, url, renderer, onProgress, }: ModelLoaderLoadOptions): Promise<GLTF | _sparkjsdev_spark.SplatMesh | null>;
    /**
     * Loads a 3DGS model (.ply, .spz, .splat, .ksplat).
     * @param url - The URL of the model file.
     * @returns A promise that resolves with the loaded
     * SplatMesh object.
     */
    loadSplat({ url }: {
        url?: string | undefined;
    }): Promise<_sparkjsdev_spark.SplatMesh>;
    /**
     * Loads a GLTF or GLB model.
     * @param options - The loading options.
     * @returns A promise that resolves with the loaded glTF object.
     */
    loadGLTF({ path, url, renderer, }: ModelLoaderLoadGLTFOptions): Promise<GLTF>;
}

/**
 * Utility functions for positioning and orienting objects in 3D
 * space.
 */

/**
 * Places and orients an object at a specific intersection point on another
 * object's surface. The placed object's 'up' direction will align with the
 * surface normal at the intersection, and its 'forward' direction will point
 * towards a specified target object (e.g., the camera), but constrained to the
 * surface plane.
 *
 * This is useful for placing objects on walls or floors so they sit flat
 * against the surface but still turn to face the user.
 *
 * @param obj - The object to be placed and oriented.
 * @param intersection - The intersection data from a
 *     raycast,
 * containing the point and normal of the surface. The normal is assumed to be
 * in local space.
 * @param target - The object that `obj` should face (e.g., the
 *     camera).
 * @returns The modified `obj`.
 */
declare function placeObjectAtIntersectionFacingTarget(obj: THREE.Object3D, intersection: THREE.Intersection, target: THREE.Object3D): THREE.Object3D<THREE.Object3DEventMap>;

/**
 * Extracts only the yaw (Y-axis rotation) from a quaternion.
 * This is useful for making an object face a certain direction horizontally
 * without tilting up or down.
 *
 * @param rotation - The source quaternion from which to
 *     extract the yaw.
 * @param target - The target
 *     quaternion to store the result.
 * If not provided, a new quaternion will be created.
 * @returns The resulting quaternion containing only the yaw
 *     rotation.
 */
declare function extractYaw(rotation: Readonly<THREE.Quaternion>, target?: THREE.Quaternion): THREE.Quaternion;
/**
 * Creates a rotation such that forward (0, 0, -1) points towards the forward
 * vector and the up direction is the normalized projection of the provided up
 * vector onto the plane orthogonal to the target.
 * @param forward - Forward vector
 * @param up - Up vector
 * @param target - Output
 * @returns
 */
declare function lookAtRotation(forward: Readonly<THREE.Vector3>, up?: Readonly<THREE.Vector3>, target?: THREE.Quaternion): THREE.Quaternion;
/**
 * Clamps the provided rotation's angle.
 * The rotation is modified in place.
 * @param rotation - The quaternion to clamp.
 * @param angle - The maximum allowed angle in radians.
 */
declare function clampRotationToAngle(rotation: THREE.Quaternion, angle: number): void;

/**
 * Checks if a given object is a descendant of another object in the scene
 * graph. This function is useful for determining if an interaction (like a
 * raycast hit) has occurred on a component that is part of a larger, complex
 * entity.
 *
 * It uses an iterative approach to traverse up the hierarchy from the child.
 *
 * @param child - The potential descendant object.
 * @param parent - The potential ancestor object.
 * @returns True if `child` is the same as `parent` or is a descendant of
 *     `parent`.
 */
declare function objectIsDescendantOf(child?: Readonly<THREE.Object3D> | null, parent?: Readonly<THREE.Object3D> | null): boolean;
/**
 * Traverses the scene graph from a given node, calling a callback function for
 * each node. The traversal stops if the callback returns true.
 *
 * This function is similar to THREE.Object3D.traverse, but allows for early
 * exit from the traversal based on the callback's return value.
 *
 * @param node - The starting node for the traversal.
 * @param callback - The function to call for each node. It receives the current
 *     node as an argument. If the callback returns `true`, the traversal will
 *     stop.
 * @returns Whether the callback returned true for any node.
 */
declare function traverseUtil(node: THREE.Object3D, callback: (node: THREE.Object3D) => boolean): boolean;

declare class SparkRendererHolder {
    renderer: SparkRenderer;
    constructor(renderer: SparkRenderer);
}

/**
 * Clamps a value between a minimum and maximum value.
 */
declare function clamp(value: number, min: number, max: number): number;
/**
 * Linearly interpolates between two numbers `x` and `y` by a given amount `t`.
 */
declare function lerp(x: number, y: number, t: number): number;
/**
 * Python-style print function for debugging.
 */
declare function print(...args: unknown[]): void;
declare const urlParams: URLSearchParams;
/**
 * Function to get the value of a URL parameter.
 * @param name - The name of the URL parameter.
 * @returns The value of the URL parameter or null if not found.
 */
declare function getUrlParameter(name: string): string | null;
/**
 * Retrieves a boolean URL parameter. Returns true for 'true' or '1', false for
 * 'false' or '0'. If the parameter is not found, returns the specified default
 * boolean value.
 * @param name - The name of the URL parameter.
 * @param defaultBool - The default boolean value if the
 *     parameter is not present.
 * @returns The boolean value of the URL parameter.
 */
declare function getUrlParamBool(name: string, defaultBool?: boolean): boolean;
/**
 * Retrieves an integer URL parameter. If the parameter is not found or is not a
 * valid number, returns the specified default integer value.
 * @param name - The name of the URL parameter.
 * @param defaultNumber - The default integer value if the
 *     parameter is not present.
 * @returns The integer value of the URL parameter.
 */
declare function getUrlParamInt(name: string, defaultNumber?: number): number;
/**
 * Retrieves a float URL parameter. If the parameter is not found or is not a
 * valid number, returns the specified default float value.
 * @param name - The name of the URL parameter.
 * @param defaultNumber - The default float value if the parameter
 *     is not present.
 * @returns The float value of the URL parameter.
 */
declare function getUrlParamFloat(name: string, defaultNumber?: number): number;
/**
 * Parses a color string (hexadecimal with optional alpha) into a THREE.Vector4.
 * Supports:
 * - #rgb (shorthand, alpha defaults to 1)
 * - #rrggbb (alpha defaults to 1)
 * - #rgba (shorthand)
 * - #rrggbbaa
 *
 * @param colorString - The color string to parse (e.g., '#66ccff',
 *     '#6cf5', '#66ccff55', '#6cf').
 * @returns The parsed color as a THREE.Vector4 (r, g, b, a), with components in
 *     the 0-1 range.
 * @throws If the input is not a string or if the hex string is invalid.
 */
declare function getVec4ByColorString(colorString: string): THREE.Vector4;
declare function getColorHex(fontColor: string | number): number;
/**
 * Parses a data URL (e.g., "data:image/png;base64,...") into its
 * stripped base64 string and MIME type.
 * This function handles common image MIME types.
 * @param dataURL - The data URL string.
 * @returns An object containing the stripped base64 string and the extracted
 *     MIME type.
 */
declare function parseBase64DataURL(dataURL: string): {
    strippedBase64: string;
    mimeType: string;
} | {
    strippedBase64: string;
    mimeType: null;
};

type VideoFileStreamDetails = VideoStreamDetails & {
    width?: number;
    height?: number;
    aspectRatio?: number;
    videoFile?: string | File;
};
type VideoFileStreamOptions = VideoStreamOptions & {
    /** The video file path, URL, or File object. */
    videoFile?: string | File;
};
/**
 * VideoFileStream handles video playback from a file source.
 */
declare class VideoFileStream extends VideoStream<VideoFileStreamDetails> {
    private videoFile_?;
    /**
     * @param options - Configuration for the file stream.
     */
    constructor({ videoFile, willCaptureFrequently }?: {
        videoFile?: undefined;
        willCaptureFrequently?: boolean | undefined;
    });
    /**
     * Initializes the file stream based on the given video file.
     */
    init(): Promise<void>;
    /**
     * Initializes the video stream from the provided file.
     */
    protected initStream_(): Promise<void>;
    /**
     * Sets a new video file source and re-initializes the stream.
     * @param videoFile - The new video file to play.
     */
    setSource(videoFile: string | File): Promise<void>;
}

export { AI, AIOptions, AVERAGE_IPD_METERS, ActiveControllers, Agent, AnimatableNumber, AudioListener, AudioPlayer, BACK, BackgroundMusic, CategoryVolumes, Col, Core, CoreSound, DEFAULT_DEVICE_CAMERA_HEIGHT, DEFAULT_DEVICE_CAMERA_WIDTH, DEFAULT_RGB_TO_DEPTH_PARAMS, DEVICE_CAMERA_PARAMETERS, DOWN, Depth, DepthMesh, DepthMeshOptions, DepthOptions, DepthTextures, DetectedBodyPose, DetectedFace, DetectedMesh, DetectedObject, DetectedPlane, DeviceCameraOptions, DragManager, DragMode, ExitButton, FINGER_ORDER, FORWARD, FaceLandmarkName, FaceRecognizer, FacesOptions, FreestandingSlider, GEMINI_DEFAULT_FLASH_MODEL, GEMINI_DEFAULT_IMAGE_MODEL, GEMINI_DEFAULT_LIVE_MODEL, GamepadBindings, GamepadController, GazeController, Gemini, GeminiOptions, GenerateSkyboxTool, GestureRecognition, GestureRecognitionOptions, GetWeatherTool, Grid, HAND_BONE_IDX_CONNECTION_MAP, HAND_INDEX_TO_LABEL, HAND_JOINT_COUNT, HAND_JOINT_IDX_CONNECTION_MAP, HAND_JOINT_NAMES, Handedness, Hands, HandsOptions, HeuristicGestureRecognizer, HorizontalPager, HumanRecognizer, HumansOptions, IconButton, IconView, ImageView, Input, InputOptions, Keycodes, LEFT, LEFT_VIEW_ONLY_LAYER, LabelView, Lighting, LightingOptions, LoadingSpinnerManager, MaterialSymbolsView, MediaPipeHandContext, MediaPipeHandPoseEstimator, MeshDetectionOptions, MeshDetector, MeshScript, ModelLoader, ModelViewer, MouseController, NUM_HANDS, OCCLUDABLE_ITEMS_LAYER, ObjectDetector, ObjectsOptions, OcclusionPass, OcclusionUtils, OpenAI, OpenAIOptions, Options, Orbiter, PageIndicator, Pager, PagerState, Panel, PanelMesh, Physics, PhysicsOptions, PinchOnButtonAction, PlaneDetector, PlanesOptions, PoseJointName, RIGHT, RIGHT_VIEW_ONLY_LAYER, Raycaster, Registry, Reticle, ReticleOptions, Reticles, RotationRaycastMesh, Row, SIMULATOR_HAND_COMMON_BIOMECHANICAL_CONSTRAINTS_DEGREES, SIMULATOR_HAND_POSE_NAMES, SIMULATOR_HAND_POSE_ROTATIONS, SOUND_PRESETS, ScreenshotSynthesizer, Script, ScriptMixin, ScriptsManager, ScriptsManagerEventType, ScrollingTroikaTextView, SegmentCategory, SegmentationOptions, Segmenter, SetSimulatorEnvironmentEvent, SetSimulatorModeEvent, ShowHandsAction, ShowSimulatorInstructionsEvent, Simulator, SimulatorCamera, SimulatorControlMode, SimulatorControllerState, SimulatorControls, SimulatorDepth, SimulatorDepthMaterial, SimulatorHandPose, SimulatorHandPoseChangeRequestEvent, SimulatorHands, SimulatorInterface, SimulatorMediaDeviceInfo, SimulatorMode, SimulatorNavMesh, SimulatorOptions, SimulatorPointerLockController, SimulatorRenderMode, SimulatorScene, SimulatorUser, SimulatorUserAction, SketchPanel, SkyboxAgent, SoundOptions, SoundSynthesizer, SparkRendererHolder, SpatialAudio, SpatialPanel, SpeechRecognizer, SpeechRecognizerOptions, SpeechSynthesizer, SpeechSynthesizerOptions, SplatAnchor, StreamState, StrokeRecognizer, StylizedFace, TensorFlowHandPoseEstimator, TextButton, TextScrollerState, TextView, Tool, UI, UIKitOptions, UI_OVERLAY_LAYER, UP, UX, User, VIEW_DEPTH_GAP, VerticalPager, VideoFileStream, VideoStream, VideoView, View, VolumeCategory, WaitFrame, WalkTowardsPanelAction, WebXRHandContext, WebXRHandPoseEstimator, World, WorldOptions, XRButton, XRDeviceCamera, XREffects, XRPass, XRTransitionOptions, XR_BLOCKS_ASSETS_PATH, ZERO_VECTOR3, ZERO_VISEME, _getBvhImportStatus, add, ai, applyBVH, applySimulatorHandPoseRotationConstraints, average, callInitWithDependencyInjection, camera, clamp, clamp01, clampRotationToAngle, core, cropImage, depth, disposeBVH, enableAcceleratedRaycast, estimateHandScale, extractYaw, getAdjacentFingerSpreads, getBoneVectors, getCameraParametersSnapshot, getColorHex, getDeltaTime, getDeviceCameraClipFromView, getDeviceCameraWorldFromClip, getDeviceCameraWorldFromView, getElapsedTime, getFingerBendAngles, getFingerCurl, getFingerDirection, getFingerJoint, getFingerPalmAlignment, getFingerSpread, getFingerStraightness, getFingertipDistance, getFingertipPalmDistance, getPalmNormal, getPalmPose, getPalmRight, getPalmUp, getPalmWidth, getRelativeBoneAngles, getThumbBendAngles, getThumbCurl, getThumbDirection, getThumbOpposition, getThumbStraightness, getThumbVerticalDirection, getUrlParamBool, getUrlParamFloat, getUrlParamInt, getUrlParameter, getVec4ByColorString, getXrCameraLeft, getXrCameraRight, init, initScript, input, intrinsicsToProjectionMatrix, isBVHReady, isDeviceCameraPoseAvailable, lerp, loadStereoImageAsTextures, loadingSpinnerManager, lookAtRotation, objectIsDescendantOf, parseBase64DataURL, parseSimulatorHandPoseRotations, placeObjectAtIntersectionFacingTarget, print, resolveSimulatorHandPoseRotations, resolveSimulatorRotationsFromKeypoints, scene, showOnlyInLeftEye, showOnlyInRightEye, showReticleOnDepthMesh, sound, timer, transformRgbUvToWorld, traverseUtil, uninitScript, urlParams, user, visualizeDepth, visualizeDepthMap, world, xrDepthMeshOptions, xrDepthMeshPhysicsOptions, xrDepthMeshVisualizationOptions, xrDeviceCameraEnvironmentContinuousOptions, xrDeviceCameraEnvironmentOptions, xrDeviceCameraUserContinuousOptions, xrDeviceCameraUserOptions };
export type { AIModel, AgentLifecycleCallbacks, AudioListenerOptions, AudioPlayerOptions, AutomationModeOptions, CameraParametersSnapshot, CameraSnapshot, ColOptions, Constructor, DeepPartial, DeepReadonly, DepthArray, DeviceCameraParameters, DigitName, Draggable, FaceBlendshape, FaceLandmark, FingerName, FormFactor, GLTFData, GamepadAction, GeminiQueryInput, GestureConfiguration, GestureDetectionResult, GestureEvent, GestureEventDetail, GestureEventType, GestureHandedness, GestureRecognizer, GestureScoreMap, GetWeatherArgs, GridOptions, HandContext, HandLabel, HasDraggingMode, HasIgnoreReticleRaycast, HeuristicGestureDetector, ISimulatorSettingsPanelElement, IconButtonOptions, IconViewOptions, ImageViewOptions, Injectable, InjectableConstructor, JointName, JointPositions, KeyEvent, KeysJson, LabelViewOptions, LipMetrics, LiveSessionState, MaterialSymbolsViewOptions, MaybeHasIgnoreReticleRaycast, MediaOrSimulatorMediaDeviceInfo, MediaPipeHandLandmark, ModelClass, ModelLoaderLoadGLTFOptions, ModelLoaderLoadOptions, ModelOptions, NormalizedDetectedObject, ObjectGrabEvent, ObjectTouchEvent, OrbiterOptions, OrbiterPosition, PagerOptions, PalmPose, PanelFadeState, PanelOptions, PlaySoundOptions, PoseEstimator, PoseLandmark, RAPIERCompat, RgbToDepthParams, RowOptions, ScriptsManagerEventMap, ScrollingTroikaTextViewOptions, SegmentationMask, SelectEvent, Shader, ShaderUniforms, SimulatorCustomInstruction, SimulatorEnvironment, SimulatorHandJointRotationArray, SimulatorHandPoseHTMLElement, SimulatorHandPoseJoints, SimulatorHandPoseRotationConstraintsDegrees, SimulatorHandPoseRotationRangeDegrees, SimulatorHandPoseRotations, SimulatorMesh, SimulatorNavMeshPath, SimulatorPlane, SimulatorPlaneType, SpatialPanelOptions, SplatData, StrokeEventMap, StylizedFaceOptions, TextButtonOptions, TextViewOptions, ToolCall, ToolOptions, ToolResult, ToolSchema, UIJsonNode, UIJsonNodeOptions, VideoFileStreamOptions, VideoStreamDetails, VideoStreamEventMap, VideoStreamGetSnapshotBase64Options, VideoStreamGetSnapshotBlobOptions, VideoStreamGetSnapshotImageDataOptions, VideoStreamGetSnapshotOptions, VideoStreamGetSnapshotTextureOptions, VideoStreamOptions, VideoViewOptions, ViewOptions, VisemeWeights, WeatherData, WebXRJointRotations };
