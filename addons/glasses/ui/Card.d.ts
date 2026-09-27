import "../../../node_modules/@pmndrs/uikit/dist/panel/index.js";
import { GlyphProperties, WhiteSpace } from "../../../node_modules/@pmndrs/uikit/dist/text/layout.js";
import "../../../node_modules/@pmndrs/uikit/dist/text/index.js";
import { PanelGroupProperties } from "../../../node_modules/@pmndrs/uikit/dist/panel/instanced-panel-group.js";
import { VisibilityProperties, alignmentXMap, alignmentYMap, alignmentZMap } from "../../../node_modules/@pmndrs/uikit/dist/utils.js";
import { ButtonProperties } from "./ButtonProperties.js";
import { BaseOutProperties, Container, InProperties } from "@pmndrs/uikit";
//#region src/addons/glasses/ui/Card.d.ts
/** Default properties for the Card component. */
export declare const cardDefaults: {
  depthAlign: keyof typeof alignmentZMap;
  keepAspectRatio: boolean;
  scrollbarWidth: number;
  visibility: Required<VisibilityProperties>["visibility"];
  opacity: number | `${number}%`;
  depthTest: boolean;
  renderOrder: number;
  fontSize: Required<GlyphProperties>["fontSize"];
  letterSpacing: Required<GlyphProperties>["letterSpacing"];
  lineHeight: Required<GlyphProperties>["lineHeight"];
  wordBreak: Required<GlyphProperties>["wordBreak"];
  verticalAlign: keyof typeof alignmentYMap;
  textAlign: keyof typeof alignmentXMap | "justify";
  fontWeight: import("@pmndrs/uikit").FontWeight;
  caretWidth: number;
  receiveShadow: boolean;
  castShadow: boolean;
  panelMaterialClass: NonNullable<PanelGroupProperties["panelMaterialClass"]>;
  pixelSize: number;
  anchorX: keyof typeof alignmentXMap;
  anchorY: keyof typeof alignmentYMap;
  tabSize: number;
  whiteSpace: WhiteSpace;
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
//#endregion