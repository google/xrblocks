import { TextView, TextViewOptions } from '../components/TextView';
/**
 * An interactive button with a rounded rectangle background and a
 * text label. It provides visual feedback for hover and selection states.
 */
export type TextButtonOptions = TextViewOptions & {
    backgroundColor?: string;
    opacity?: number;
    maxWidth?: number;
    radius?: number;
    boxSize?: number;
};
export declare class TextButton extends TextView {
    /** Default description of this view in Three.js DevTools. */
    name: string;
    /** The font size of the text label. */
    fontSize: number;
    /** The color of the text in its default state. */
    fontColor: string | number;
    /** The opacity multiplier of the button. */
    opacity: number;
    /** The intrinsic opacity of the button. */
    defaultOpacity: number;
    /** The color of the text when the button is hovered. */
    hoverColor: string | number;
    /** The opacity multiplier of the text when the button is hovered. */
    hoverOpacity: number;
    /** The color of the text when the button is pressed. */
    selectedFontColor: string | number;
    /** The opacity multiplier of the text when the button is pressed. */
    selectedOpacity: number;
    /** Relative local width. */
    width: number;
    /** Relative local height. */
    height: number;
    /** Layout mode. */
    mode: string;
    /** The horizontal offset for the `imageOverlay` texture. */
    imageOffsetX: number;
    /** The vertical offset for the `imageOverlay` texture. */
    imageOffsetY: number;
    private uniforms;
    /**
     * @param options - Configuration options for the TextButton.
     */
    constructor(options?: TextButtonOptions);
    /**
     * Initializes the text object after async dependencies are loaded.
     * @override
     */
    init(): Promise<void>;
    update(): void;
}
