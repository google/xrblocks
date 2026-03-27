import { BaseOutProperties, Container, InProperties, RenderContext, WithSignal } from '@pmndrs/uikit';
export type ActionButtonOutProperties = {
    text: string;
    icon?: string;
    iconStyle?: string;
    iconWeight?: number;
} & BaseOutProperties;
export declare class ActionButton<OutProperties extends ActionButtonOutProperties = ActionButtonOutProperties> extends Container<OutProperties> {
    name: string;
    constructor(inputProperties?: InProperties<OutProperties>, initialClasses?: Array<InProperties<BaseOutProperties> | string>, config?: {
        renderContext?: RenderContext;
        defaultOverrides?: InProperties<OutProperties>;
        defaults?: WithSignal<OutProperties>;
    });
}
