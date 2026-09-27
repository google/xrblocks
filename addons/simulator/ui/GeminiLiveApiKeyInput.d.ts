import { TemplateResult } from "../../../node_modules/lit-html/development/lit-html.js";
import { LitElement } from "lit";
import { Ref } from "lit/directives/ref.js";
//#region src/addons/simulator/ui/GeminiLiveApiKeyInput.d.ts
export declare class GeminiLiveApiKeyInput extends LitElement {
  static styles: import("lit").CSSResult;
  textInputRef: Ref<HTMLInputElement>;
  firstUpdated(): void;
  textInputKeyDown(event: KeyboardEvent): void;
  render(): TemplateResult<1>;
}
//#endregion