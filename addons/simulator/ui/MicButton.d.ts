import { TemplateResult } from "../../../node_modules/lit-html/development/lit-html.js";
import { LitElement } from "lit";
//#region src/addons/simulator/ui/MicButton.d.ts
export declare class MicButton extends LitElement {
  micRecording: boolean;
  static styles: import("lit").CSSResult;
  onMicButtonClicked(): void;
  getHaloCss(): string;
  render(): TemplateResult<1>;
}
//#endregion