import { MaterialSymbolsIcon } from "./MaterialSymbolsIcon.js";
import { BaseOutProperties, InProperties, RenderContext, SvgOutProperties, WithSignal } from "@pmndrs/uikit";
//#region src/addons/glasses/ui/WeatherIcon.d.ts
export type WeatherIconOutProperties = SvgOutProperties & {
  wmoCode: number;
  showLocationDisabledIcon?: boolean;
  iconStyle?: string;
  iconWeight?: number;
};
export type WeatherIconProperties = InProperties<WeatherIconOutProperties>;
export declare class WeatherIcon extends MaterialSymbolsIcon {
  name: string;
  constructor(properties?: WeatherIconProperties, initialClasses?: Array<InProperties<BaseOutProperties> | string>, config?: {
    renderContext?: RenderContext;
    defaultOverrides?: WeatherIconProperties;
    defaults?: WithSignal<WeatherIconOutProperties>;
  });
}
//#endregion