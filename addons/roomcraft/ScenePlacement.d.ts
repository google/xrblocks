import * as THREE from 'three';
import { type DetectedPlane } from 'xrblocks';
import type { SceneAssetDescription, SceneLayout } from './SceneTypes';
/**
 * Uses detected plane polygons and the SDK's surface-facing convention.
 * Unlike point placement, a composition must fit its entire footprint.
 * Candidate poses are detached, so an unsuccessful search never moves live objects.
 */
export declare function placeSceneOnSurface(scene: THREE.Object3D, layout: SceneLayout, assets: readonly SceneAssetDescription[], planes: readonly DetectedPlane[], camera: THREE.Camera): boolean;
