import { BaseOutProperties, InProperties, RenderContext, Svg, SvgOutProperties, WithSignal } from '@pmndrs/uikit';
export type MaterialSymbolsIconOutProperties = SvgOutProperties & {
    icon?: string;
    iconWeight?: number;
    iconStyle?: string;
};
export type MaterialSymbolsIconProperties = InProperties<MaterialSymbolsIconOutProperties>;
export declare class MaterialSymbolsIcon extends Svg<SvgOutProperties> {
    name: string;
    constructor(properties?: MaterialSymbolsIconProperties, initialClasses?: Array<InProperties<BaseOutProperties> | string>, config?: {
        renderContext?: RenderContext;
        defaultOverrides?: MaterialSymbolsIconProperties;
        defaults?: WithSignal<MaterialSymbolsIconOutProperties>;
    });
}
