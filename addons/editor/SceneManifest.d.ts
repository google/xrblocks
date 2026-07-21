import type * as xb from 'xrblocks';
import type { SceneManager } from './SceneManager';
/** Builds a strict simulator manifest from the active environment and the
 * editor's current asset-backed objects. */
export declare function serializeActiveManifest(manifest: xb.ResolvedSimulatorSceneManifest, sceneManager: SceneManager, scenesDir: string): xb.SimulatorSceneManifest;
