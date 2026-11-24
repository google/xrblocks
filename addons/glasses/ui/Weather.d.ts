import { BaseOutProperties, Container, InProperties, RenderContext, WithSignal } from "@pmndrs/uikit";
//#region src/addons/glasses/ui/Weather.d.ts
export declare const weatherDefaults: {
  depthAlign: keyof typeof import("@pmndrs/uikit/dist/utils").alignmentZMap;
  keepAspectRatio: boolean;
  scrollbarWidth: import("@pmndrs/uikit").AbsoluteLengthValue;
  visibility: Required<import("@pmndrs/uikit/dist/utils").VisibilityProperties>["visibility"];
  opacity: import("@pmndrs/uikit").NumberOrPercentageValue;
  depthTest: boolean;
  renderOrder: import("@pmndrs/uikit").NumberValue;
  fontSize: Required<import("@pmndrs/uikit/dist/text").GlyphProperties>["fontSize"];
  letterSpacing: Required<import("@pmndrs/uikit/dist/text").GlyphProperties>["letterSpacing"];
  lineHeight: Required<import("@pmndrs/uikit/dist/text").GlyphProperties>["lineHeight"];
  wordBreak: Required<import("@pmndrs/uikit/dist/text").GlyphProperties>["wordBreak"];
  verticalAlign: keyof typeof import("@pmndrs/uikit/dist/utils").alignmentYMap;
  textAlign: keyof typeof import("@pmndrs/uikit/dist/utils").alignmentXMap | "justify";
  fontWeight: import("@pmndrs/uikit").FontWeight;
  caretWidth: import("@pmndrs/uikit").AbsoluteLengthValue;
  receiveShadow: boolean;
  castShadow: boolean;
  panelMaterialClass: NonNullable<import("@pmndrs/uikit/dist/panel").PanelGroupProperties["panelMaterialClass"]>;
  pixelSize: import("@pmndrs/uikit").NumberValue;
  anchorX: keyof typeof import("@pmndrs/uikit/dist/utils").alignmentXMap;
  anchorY: keyof typeof import("@pmndrs/uikit/dist/utils").alignmentYMap;
  tabSize: import("@pmndrs/uikit").NumberValue;
  whiteSpace: import("@pmndrs/uikit/dist/text").WhiteSpace;
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