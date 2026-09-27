import "../../../node_modules/@pmndrs/uikit/dist/panel/index.js";
import { GlyphProperties, WhiteSpace } from "../../../node_modules/@pmndrs/uikit/dist/text/layout.js";
import "../../../node_modules/@pmndrs/uikit/dist/text/index.js";
import { PanelGroupProperties } from "../../../node_modules/@pmndrs/uikit/dist/panel/instanced-panel-group.js";
import { VisibilityProperties, alignmentXMap, alignmentYMap, alignmentZMap } from "../../../node_modules/@pmndrs/uikit/dist/utils.js";
import { BaseOutProperties, Container, InProperties, RenderContext, WithSignal } from "@pmndrs/uikit";
//#region src/addons/glasses/ui/Weather.d.ts
export declare const weatherDefaults: {
  depthAlign: keyof typeof alignmentZMap;
  keepAspectRatio: boolean;
  scrollbarWidth: number;
  visibility: Required<VisibilityProperties>["visibility"];
  opacity: number | `${number}%`;
  depthTest: boolean;
  renderOrder: number;
  fontSize: Required<GlyphProperties>["fontSize"];
  letterSpacing: Required<GlyphProperties>["letterSpacing"];
  lineHeight: Required<GlyphProperties>["lineHeight"];
  wordBreak: Required<GlyphProperties>["wordBreak"];
  verticalAlign: keyof typeof alignmentYMap;
  textAlign: keyof typeof alignmentXMap | "justify";
  fontWeight: import("@pmndrs/uikit").FontWeight;
  caretWidth: number;
  receiveShadow: boolean;
  castShadow: boolean;
  panelMaterialClass: NonNullable<PanelGroupProperties["panelMaterialClass"]>;
  pixelSize: number;
  anchorX: keyof typeof alignmentXMap;
  anchorY: keyof typeof alignmentYMap;
  tabSize: number;
  whiteSpace: WhiteSpace;
  updateIntervalMinutes: number;
};
export type WeatherOutProperties = typeof weatherDefaults & BaseOutProperties;
export type WeatherProperties = InProperties<WeatherOutProperties>;
export declare class Weather<OutProperties extends WeatherOutProperties = WeatherOutProperties> extends Container<OutProperties> {
  name: string;
  private api;
  private lastWeatherUpdateAttemptTime;
  private wmoCode;
  private locationPermissionReceived;
  private temperature;
  constructor(inputProperties?: InProperties<OutProperties>, initialClasses?: Array<InProperties<BaseOutProperties> | string>, config?: {
    renderContext?: RenderContext;
    defaultOverrides?: InProperties<OutProperties>;
    defaults?: WithSignal<OutProperties>;
  });
  private updateWeather;
  updateCurrentWeather(): Promise<void>;
}
//#endregion