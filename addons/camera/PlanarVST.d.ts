import * as xb from "xrblocks";
//#region src/addons/camera/PlanarVST.d.ts
export declare class PlanarVST extends xb.Script {
  private disposables;
  private mesh?;
  private targetDeviceOverride?;
  /**
   * Device camera profile for the camera image's projection and pose. Follows
   * the device camera's `targetDevice` unless assigned here. Assign `undefined`
   * to follow it again; unknown profile keys throw.
   */
  get targetDevice(): string;
  set targetDevice(targetDevice: string | undefined);
  init(): void;
  update(): void;
  dispose(): void;
}
//#endregion