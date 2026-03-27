import { BaseOutProperties, InProperties, RenderContext, Text, TextOutProperties, WithSignal } from '@pmndrs/uikit';
export declare class Clock<OutProperties extends TextOutProperties = TextOutProperties> extends Text<OutProperties> {
    name: string;
    private lastUpdatedTime;
    private text;
    constructor(properties?: InProperties<OutProperties>, initialClasses?: Array<InProperties<BaseOutProperties> | string>, config?: {
        renderContext?: RenderContext;
        defaultOverrides?: InProperties<OutProperties>;
        defaults?: WithSignal<OutProperties>;
    });
    private updateTime;
}
