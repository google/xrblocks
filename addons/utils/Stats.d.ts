import * as THREE from "three";
import * as xb from "xrblocks";
import ThreeStats from "three/addons/libs/stats.module.js";
//#region src/addons/utils/Stats.d.ts
export declare class Stats extends xb.Script {
  stats: ThreeStats;
  mesh: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>;
  softHeadLock: boolean;
  softHeadLockOffsetPosition: THREE.Vector3;
  softHeadLockOffsetRotation: THREE.Quaternion;
  private targetPosition;
  private targetRotation;
  private texture;
  constructor();
  showPanel(panel: number): void;
  private updateSoftHeadlockTargetPose;
  private updateSoftHeadlock;
  enableSoftHeadLock(): void;
  disableSoftHeadLock(): void;
  update(): void;
}
//#endregion