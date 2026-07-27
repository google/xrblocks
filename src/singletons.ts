import * as THREE from 'three';

import {Core} from './core/Core';
import {Options} from './core/Options';
import {Script} from './core/Script';
import {checkThreeVersion} from './utils/VersionCheck';

checkThreeVersion();

/**
 * The global singleton instance of Core, serving as the main entry point
 * for the entire XR system.
 */
export const core = new Core();

/**
 * A direct alias to the main `THREE.Scene` instance managed by the core.
 * Use this to add or remove objects from your XR experience.
 * @example
 * ```
 * const myObject = new THREE.Mesh();
 * scene.add(myObject);
 * ```
 */
export const scene = core.scene;

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
export const user = core.user;

/**
 * A direct alias to the `World` instance, which manages real-world
 * understanding features like plane detection and object detection.
 */
export const world = core.world;

/**
 * A direct alias to the `Context` instance, which provides agent-facing
 * observations such as semantic trees, visible objects, and Set-of-Mark views.
 */
export const context = core.context;

/**
 * A direct alias to the `AI` instance for integrating generative AI features,
 * including multi-modal understanding, image generation, and live conversation.
 */
export const ai = core.ai;

/**
 * A direct alias to the `Depth` instance, which manages depth sensing features.
 */
export const depth = core.depth;

/**
 * A direct alias to the `Timer` instance, which manages time deltas.
 */
export const timer = core.timer;

/**
 * A direct alias to the `CoreSound` instance, which manages audio.
 */
export const sound = core.sound;

/**
 * A direct alias to the `Input` instance, which manages inputs like controllers and hands.
 */
export const input = core.input;

/**
 * A direct alias to the `THREE.PerspectiveCamera` instance.
 */
export const camera = core.camera;

// --- Function Aliases ---
// These are bound shortcuts to frequently used methods for convenience.

/**
 * A shortcut for `core.scene.add()`. Adds one or more objects to the scene.
 * @param object - The object(s) to add.
 * @see {@link three#Object3D.add}
 */
export function add(...object: THREE.Object3D[]) {
  return scene.add(...object);
}

/**
 * A shortcut for `core.init()`. Initializes the XR Blocks system and starts
 * the render loop. This is the main entry point for any application.
 * @param options - Configuration options for the session.
 * @see {@link Core.init}
 */
export function init(options: Options = new Options()) {
  return core.init(options);
}

/**
 * A shortcut for `core.scriptsManager.initScript()`. Manually initializes a
 * script and its dependencies.
 * @param script - The script to initialize.
 * @see {@link ScriptsManager.initScript}
 */
export function initScript(script: Script) {
  return core.scriptsManager.initScript(script);
}

/**
 * A shortcut for `core.scriptsManager.uninitScript()`. Disposes of a script
 * and removes it from the update loop.
 * @param script - The script to uninitialize.
 * @see {@link ScriptsManager.uninitScript}
 */
export function uninitScript(script: Script) {
  return core.scriptsManager.uninitScript(script);
}

/**
 * A shortcut for `core.timer.getDelta()`. Gets the time in seconds since
 * the last frame, useful for animations.
 * @returns The delta time in seconds.
 * @see {@link THREE.Timer.getDelta}
 */
export function getDeltaTime() {
  return core.timer.getDelta();
}

/**
 * A shortcut for `core.timer.getElapsed()`. Gets the total time in seconds
 * since the application started.
 * @returns The elapsed time in seconds.
 * @see {@link THREE.Timer.getElapsed}
 */
export function getElapsedTime() {
  return core.timer.getElapsed();
}

/**
 * Toggles whether the reticle can target the depth-sensing mesh.
 * @param value - True to add the depth mesh as a target, false to
 * remove it.
 */
export function showReticleOnDepthMesh(value: boolean) {
  if (core.depth.depthMesh) {
    core.depth.depthMesh.ignoreReticleRaycast = !value;
  }
}

/**
 * Retrieves the left camera from the stereoscopic XR camera rig.
 * @returns The left eye's camera.
 */
export function getXrCameraLeft() {
  return core.renderer.xr.getCamera().cameras[0];
}

/**
 * Retrieves the right camera from the stereoscopic XR camera rig.
 * @returns The right eye's camera.
 */
export function getXrCameraRight() {
  return core.renderer.xr.getCamera().cameras[1];
}
