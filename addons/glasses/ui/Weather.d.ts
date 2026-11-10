import { PanelGroupProperties } from "../../../node_modules/@pmndrs/uikit/dist/panel/instance/properties.js";
import "../../../node_modules/@pmndrs/uikit/dist/panel/index.js";
import { GlyphProperties, WhiteSpace } from "../../../node_modules/@pmndrs/uikit/dist/text/layout/types.js";
import "../../../node_modules/@pmndrs/uikit/dist/text/index.js";
import { VisibilityProperties, alignmentXMap, alignmentYMap, alignmentZMap } from "../../../node_modules/@pmndrs/uikit/dist/utils.js";
import { BaseOutProperties, Container, InProperties, RenderContext, WithSignal } from "@pmndrs/uikit";
//#region src/addons/glasses/ui/Weather.d.ts
export declare const weatherDefaults: {
  depthAlign: keyof typeof alignmentZMap;
  keepAspectRatio: boolean;
  scrollbarWidth: import("@pmndrs/uikit").AbsoluteLengthValue;
  visibility: Required<VisibilityProperties>["visibility"];
  opacity: import("@pmndrs/uikit").NumberOrPercentageValue;
  depthTest: boolean;
  renderOrder: import("@pmndrs/uikit").NumberValue;
  fontSize: Required<GlyphProperties>["fontSize"];
  letterSpacing: Required<GlyphProperties>["letterSpacing"];
  lineHeight: Required<GlyphProperties>["lineHeight"];
  wordBreak: Required<GlyphProperties>["wordBreak"];
  verticalAlign: keyof typeof alignmentYMap;
  textAlign: keyof typeof alignmentXMap | "justify";
  fontWeight: import("@pmndrs/uikit").FontWeight;
  caretWidth: import("@pmndrs/uikit").AbsoluteLengthValue;
  receiveShadow: boolean;
  castShadow: boolean;
  panelMaterialClass: NonNullable<PanelGroupProperties["panelMaterialClass"]>;
  pixelSize: import("@pmndrs/uikit").NumberValue;
  anchorX: keyof typeof alignmentXMap;
  anchorY: keyof typeof alignmentYMap;
  tabSize: import("@pmndrs/uikit").NumberValue;
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