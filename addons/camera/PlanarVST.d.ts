import * as xb from "xrblocks";
//#region src/addons/camera/PlanarVST.d.ts
export declare class PlanarVST extends xb.Script {
  private disposables;
  private mesh?;
  targetDevice: string;
  init(): void;
  update(): void;
  dispose(): void;
}
//#endregion