import { BaseOutProperties, Container, InProperties } from '@pmndrs/uikit';
export type CardActionButtonProperties = {
    text: string;
    icon?: string;
    iconStyle?: string;
    iconWeight?: number;
} & BaseOutProperties;
export declare class CardActionButton extends Container<BaseOutProperties> {
    name: string;
    private shadowCanvas;
    private shadowTexture;
    constructor(properties: InProperties<CardActionButtonProperties>);
    dispose(): void;
}
