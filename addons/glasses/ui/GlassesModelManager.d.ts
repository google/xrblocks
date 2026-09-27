import * as THREE from "three";
import * as xb from "xrblocks";
import { GLTF } from "three/addons/loaders/GLTFLoader.js";
//#region src/addons/glasses/ui/GlassesModelManager.d.ts
export declare class GlassesModelManager extends xb.Script {
  private _modelUrl;
  defaultPosition: THREE.Vector3;
  defaultRotation: THREE.Euler;
  defaultScale: THREE.Vector3;
  xrPosition: THREE.Vector3;
  xrRotation: THREE.Euler;
  xrScale: THREE.Vector3;
  private glassesModel?;
  private runningInXrHeadset;
  get modelUrl(): string;
  set modelUrl(url: string);
  updateTransform(): void;
  init(): Promise<void>;
  protected loadGlassesModel(): Promise<void>;
  protected positionGlassesModel(): void;
  protected setXrHeadset(enabled: boolean): void;
  update(): void;
  dispose(): void;
  private removeAndDisposeModel;
  get model(): GLTF | undefined;
}
//#endregion