import { BaseOutProperties, Container, InProperties, RenderContext, WithSignal } from '@pmndrs/uikit';
import { Clock } from './Clock';
import { Weather } from './Weather';
export type SystemBarOutProperties = BaseOutProperties;
export type SystemBarProperties = InProperties<SystemBarOutProperties>;
export declare class SystemBar<OutProperties extends SystemBarOutProperties = SystemBarOutProperties> extends Container<OutProperties> {
    name: string;
    clock: Clock<import("@pmndrs/uikit").TextOutProperties>;
    weather: Weather<import("./Weather").WeatherOutProperties>;
    constructor(properties?: InProperties<OutProperties>, initialClasses?: Array<InProperties<BaseOutProperties> | string>, config?: {
        renderContext?: RenderContext;
        defaultOverrides?: InProperties<OutProperties>;
        defaults?: WithSignal<OutProperties>;
    });
}
