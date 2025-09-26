import * as THREE from 'three';
import { Core } from './core/Core';
import { Options } from './core/Options';
import { Script } from './core/Script';
/**
 * The global singleton instance of Core, serving as the main entry point
 * for the entire XR system.
 */
export declare const core: Core;
/**
 * A direct alias to the main `THREE.Scene` instance managed by the core.
 * Use this to add or remove objects from your XR experience.
 * @example
 * ```
 * const myObject = new THREE.Mesh();
 * scene.add(myObject);
 * ```
 */
export declare const scene: THREE.Scene;
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
export declare const user: import("./xrblocks").User;
/**
 * A direct alias to the `World` instance, which manages real-world
 * understanding features like plane detection and object detection.
 */
export declare const world: import("./xrblocks").World;
/**
 * A direct alias to the `AI` instance for integrating generative AI features,
 * including multi-modal understanding, image generation, and live conversation.
 */
export declare const ai: import("./xrblocks").AI;
/**
 * A shortcut for `core.scene.add()`. Adds one or more objects to the scene.
 * @param object - The object(s) to add.
 * @see {@link three#Object3D.add}
 */
export declare function add(...object: THREE.Object3D[]): THREE.Scene;
/**
 * A shortcut for `core.init()`. Initializes the XR Blocks system and starts
 * the render loop. This is the main entry point for any application.
 * @param options - Configuration options for the session.
 * @see {@link Core.init}
 */
export declare function init(options?: Options): Promise<void>;
/**
 * A shortcut for `core.scriptsManager.initScript()`. Manually initializes a
 * script and its dependencies.
 * @param script - The script to initialize.
 * @see {@link ScriptsManager.initScript}
 */
export declare function initScript(script: Script): Promise<void>;
/**
 * A shortcut for `core.scriptsManager.uninitScript()`. Disposes of a script
 * and removes it from the update loop.
 * @param script - The script to uninitialize.
 * @see {@link ScriptsManager.uninitScript}
 */
export declare function uninitScript(script: Script): void;
/**
 * A shortcut for `core.clock.getDeltaTime()`. Gets the time in seconds since
 * the last frame, useful for animations.
 * @returns The delta time in seconds.
 * @see {@link Clock.getDeltaTime}
 */
export declare function getDeltaTime(): number;
/**
 * Toggles whether the reticle can target the depth-sensing mesh.
 * @param value - True to add the depth mesh as a target, false to
 * remove it.
 */
export declare function showReticleOnDepthMesh(value: boolean): void;
/**
 * Retrieves the left camera from the stereoscopic XR camera rig.
 * @returns The left eye's camera.
 */
export declare function getXrCameraLeft(): THREE.WebXRCamera;
/**
 * Retrieves the right camera from the stereoscopic XR camera rig.
 * @returns The right eye's camera.
 */
export declare function getXrCameraRight(): THREE.WebXRCamera;
