import { Signal } from "@preact/signals-core";
//#region src/addons/glasses/ui/ButtonProperties.d.ts
export type ButtonProperties = {
  text: string | Signal<string>;
  icon?: string | Signal<string>;
};
//#endregion