import { Clock } from "./Clock.js";
import { Weather, WeatherOutProperties } from "./Weather.js";
import { BaseOutProperties, Container, InProperties, RenderContext, WithSignal } from "@pmndrs/uikit";
//#region src/addons/glasses/ui/SystemBar.d.ts
export type SystemBarOutProperties = BaseOutProperties;
export type SystemBarProperties = InProperties<SystemBarOutProperties>;
export declare class SystemBar<OutProperties extends SystemBarOutProperties = SystemBarOutProperties> extends Container<OutProperties> {
  name: string;
  clock: Clock<import("@pmndrs/uikit").TextOutProperties>;
  weather: Weather<WeatherOutProperties>;
  constructor(properties?: InProperties<OutProperties>, initialClasses?: Array<InProperties<BaseOutProperties> | string>, config?: {
    renderContext?: RenderContext;
    defaultOverrides?: InProperties<OutProperties>;
    defaults?: WithSignal<OutProperties>;
  });
}
//#endregion