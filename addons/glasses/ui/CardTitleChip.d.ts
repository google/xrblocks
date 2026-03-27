import { BaseOutProperties, Container, InProperties, RenderContext, WithSignal } from '@pmndrs/uikit';
export type CardTitleChipOutProperties = BaseOutProperties & {
    text: string;
};
export declare class CardTitleChip<OutProperties extends CardTitleChipOutProperties> extends Container<OutProperties> {
    name: string;
    constructor(properties?: InProperties<OutProperties>, initialClasses?: Array<InProperties<OutProperties> | string>, config?: {
        renderContext?: RenderContext;
        defaultOverrides?: OutProperties;
        defaults?: WithSignal<OutProperties>;
    });
}
