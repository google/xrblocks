import { View } from '../core/View.js';
export type MaterialSymbolsViewOptions = {
    /** The name of the icon (e.g., 'sunny', 'home'). */
    icon?: string;
    /** The weight of the icon (e.g., 100, 400, 700). */
    iconWeight?: number;
    /** The style of the icon ('outlined', 'filled', or 'round'). */
    iconStyle?: string;
    /** The scale factor for the icon. */
    iconScale?: number;
    /** The color of the icon in hex format (e.g., '#FFFFFF'). */
    iconColor?: string;
};
/**
 * A View that dynamically loads and displays an icon from the Google
 * Material Symbols library as a 3D object. It constructs the icon from SVG
 * data, allowing for customization of weight, style, color, and scale.
 */
export declare class MaterialSymbolsView extends View {
    #private;
    get icon(): string;
    set icon(value: string);
    get iconWeight(): number;
    set iconWeight(value: number);
    get iconStyle(): string;
    set iconStyle(value: string);
    get iconColor(): string;
    set iconColor(value: string);
    iconScale: number;
    private loadedSvgPath?;
    private loadingSvgPath?;
    private group?;
    /**
     * Construct a Material Symbol view.
     * @param options - Options for the icon.
     */
    constructor({ icon, iconWeight, iconStyle, iconScale, iconColor }: MaterialSymbolsViewOptions);
    init(): Promise<void>;
    /**
     * Updates the icon displayed by loading the appropriate SVG from the Material
     * Symbols library based on the current `icon`, `iconWeight`, and `iconStyle`
     * properties.
     * @returns Promise<void>
     */
    updateIcon(): Promise<void>;
}
