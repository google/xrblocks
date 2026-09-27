import { TemplateResult } from "../../../node_modules/lit-html/development/lit-html.js";
import * as xb from "xrblocks";
import { LitElement } from "lit";
//#region src/addons/simulator/ui/EnterXRButton.d.ts
export declare class EnterXRButton extends LitElement {
  static styles: import("lit").CSSResult;
  simulatorMode: xb.SimulatorMode;
  setSimulatorMode(newMode: xb.SimulatorMode): void;
  onClick(): void;
  render(): TemplateResult<1>;
}
//#endregion