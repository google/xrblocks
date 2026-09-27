import { SceneAssetDescription, SceneLayout } from "./SceneTypes.js";
import * as THREE from "three";
import { DetectedPlane } from "xrblocks";
//#region src/addons/roomcraft/ScenePlacement.d.ts
/**
 * Uses detected plane polygons and the SDK's surface-facing convention.
 * Unlike point placement, a composition must fit its entire footprint.
 * Candidate poses are detached, so an unsuccessful search never moves live objects.
 */
export declare function placeSceneOnSurface(scene: THREE.Object3D, layout: SceneLayout, assets: readonly SceneAssetDescription[], planes: readonly DetectedPlane[], camera: THREE.Camera): boolean;
//#endregion