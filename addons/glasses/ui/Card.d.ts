import { BaseOutProperties, Container, InProperties } from '@pmndrs/uikit';
import { ButtonProperties } from './ButtonProperties';
/** Default properties for the Card component. */
export declare const cardDefaults: {
    depthAlign: keyof typeof import("@pmndrs/uikit/dist/utils").alignmentZMap;
    keepAspectRatio: boolean;
    scrollbarWidth: number;
    visibility: Required<import("@pmndrs/uikit/dist/utils").VisibilityProperties>["visibility"];
    opacity: number | `${number}%`;
    depthTest: boolean;
    renderOrder: number;
    fontSize: Required<import("@pmndrs/uikit/dist/text").GlyphProperties>["fontSize"];
    letterSpacing: Required<import("@pmndrs/uikit/dist/text").GlyphProperties>["letterSpacing"];
    lineHeight: Required<import("@pmndrs/uikit/dist/text").GlyphProperties>["lineHeight"];
    wordBreak: Required<import("@pmndrs/uikit/dist/text").GlyphProperties>["wordBreak"];
    verticalAlign: keyof typeof import("@pmndrs/uikit/dist/utils").alignmentYMap;
    textAlign: keyof typeof import("@pmndrs/uikit/dist/utils").alignmentXMap | "justify";
    fontWeight: import("@pmndrs/uikit").FontWeight;
    caretWidth: number;
    receiveShadow: boolean;
    castShadow: boolean;
    panelMaterialClass: NonNullable<import("@pmndrs/uikit/dist/panel").PanelGroupProperties["panelMaterialClass"]>;
    pixelSize: number;
    anchorX: keyof typeof import("@pmndrs/uikit/dist/utils").alignmentXMap;
    anchorY: keyof typeof import("@pmndrs/uikit/dist/utils").alignmentYMap;
    tabSize: number;
    whiteSpace: import("@pmndrs/uikit/dist/text").WhiteSpace;
    titleChip: string | undefined;
    title: string | undefined;
    subtitle: string | undefined;
    body: string | undefined;
    imageSrc: string | undefined;
    entityIcon: string | undefined;
    actionButton: ButtonProperties | undefined;
    trailingEntityIcon: boolean;
    buttons: ButtonProperties[];
};
/** Properties for the Card component. */
export type CardProperties = typeof cardDefaults & BaseOutProperties;
/** A card component that displays content with title, icon, text, and actions. */
export declare class Card extends Container<CardProperties> {
    constructor(properties: InProperties<CardProperties>);
}
