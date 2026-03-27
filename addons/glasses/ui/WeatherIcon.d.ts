import { BaseOutProperties, InProperties, RenderContext, SvgOutProperties, WithSignal } from '@pmndrs/uikit';
import { MaterialSymbolsIcon } from './MaterialSymbolsIcon';
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
