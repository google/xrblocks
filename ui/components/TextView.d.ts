import * as THREE from 'three';
import type TroikaThreeText from 'troika-three-text';
import { View } from '../core/View';
import { ViewOptions } from '../core/ViewOptions';
interface TextViewEventMap extends THREE.Object3DEventMap {
    synccomplete: object;
}
export type TextViewOptions = ViewOptions & {
    useSDFText?: boolean;
    font?: string;
    fontSize?: number;
    /**
     * Font size in dp. This will be scale up so it's a consistent size in world
     * coordinates.
     */
    fontSizeDp?: number;
    fontColor?: string | number;
    maxWidth?: number;
    mode?: 'fitWidth' | 'center';
    anchorX?: number | 'left' | 'center' | 'right' | `${number}%`;
    anchorY?: number | 'top' | 'top-baseline' | 'top-cap' | 'top-ex' | 'middle' | 'bottom-baseline' | 'bottom' | `${number}%`;
    textAlign?: 'left' | 'center' | 'right';
    imageOverlay?: string;
    imageOffsetX?: number;
    imageOffsetY?: number;
    text?: string;
};
/**
 * A view for displaying text in 3D. It features a dual-rendering
 * system:
 * 1.  **SDF Text (Default):** Uses `troika-three-text` to render crisp,
 * high-quality text using Signed Distance Fields. This is ideal for most
 * use cases. The library is loaded dynamically on demand.
 * 2.  **HTML Canvas Fallback:** If `troika-three-text` fails to load or is
 * disabled via `useSDFText: false`, it renders text to an HTML canvas and
 * applies it as a texture to a plane.
 */
export declare class TextView extends View<TextViewEventMap> {
    /** Determines which rendering backend to use. Defaults to SDF text. */
    useSDFText: boolean;
    /** TextView resides in a panel by default. */
    isRoot: boolean;
    /** Default description of this view in Three.js DevTools. */
    name: string;
    /** The underlying renderable object (either a Troika Text or a Plane. */
    textObj?: TroikaThreeText.Text | THREE.Mesh;
    /** The font file to use. Defaults to Roboto. */
    font: string;
    /** The size of the font in world units. */
    fontSize?: number;
    fontSizeDp?: number;
    /** The color of the font. */
    fontColor: string | number;
    /**
     * The maximum width the text can occupy before wrapping.
     * To fit a long TextView within a container, this value should be its
     * container's height / width to avoid it getting rendered outside.
     */
    maxWidth: number;
    /** Layout mode. 'fitWidth' scales text to fit the view's width. */
    mode: string;
    /** Horizontal anchor point ('left', 'center', 'right'). */
    anchorX: number | 'left' | 'center' | 'right' | `${number}%`;
    /** Vertical anchor point ('top', 'middle', 'bottom'). */
    anchorY: number | 'top' | 'top-baseline' | 'top-cap' | 'top-ex' | 'middle' | 'bottom-baseline' | 'bottom' | `${number}%`;
    /** Horizontal alignment ('left', 'center', 'right'). */
    textAlign: string;
    /** An optional image URL to use as an overlay texture on the text. */
    imageOverlay?: string;
    /** The horizontal offset for the `imageOverlay` texture. */
    imageOffsetX: number;
    /** The vertical offset for the `imageOverlay` texture. */
    imageOffsetY: number;
    /** Relative local offset in X. */
    x: number;
    /** Relative local offset in Y. */
    y: number;
    /** Relative local width. */
    width: number;
    /** Relative local height. */
    height: number;
    /** Fallback HTML canvas to render legacy text. */
    canvas?: HTMLCanvasElement;
    /** Fallback HTML canvas context to render legacy text. */
    ctx?: CanvasRenderingContext2D;
    /** The calculated height of a single line of text. */
    lineHeight: number;
    /** The total number of lines after text wrapping. */
    lineCount: number;
    private _initializeTextCalled;
    private _text;
    set text(text: string);
    get text(): string;
    /**
     * TextView can render text using either Troika SDF text or HTML canvas.
     * @param options - Configuration options for the TextView.
     * @param geometry - Optional geometry for the view's background mesh.
     * @param material - Optional material for the view's background mesh.
     */
    constructor(options?: TextViewOptions, geometry?: THREE.BufferGeometry, material?: THREE.Material);
    /**
     * Initializes the TextView. It waits for the Troika module to be imported
     * and then creates the text object, sets up aspect ratio, and loads overlays.
     */
    init(_?: object): Promise<void>;
    /**
     * Sets the text content of the view.
     * @param text - The text to be displayed.
     */
    setText(text: string): void;
    /**
     * Updates the layout of the text object, such as its render order.
     */
    updateLayout(): void;
    /**
     * Creates the text object using Troika Three Text for SDF rendering.
     * This method should only be called from _initializeText() when `useSDFText`
     * is true and the `troika-three-text` module has been successfully imported.
     */
    protected createTextSDF(): void;
    /**
     * Creates a text object using an HTML canvas as a texture on a THREE.Plane.
     * This serves as a fallback when Troika is not available or `useSDFText` is
     * false. This method should only be called from _initializeText().
     */
    private createTextHTML;
    /**
     * Updates the content of the HTML canvas when not using SDF text.
     * It clears the canvas and redraws the text with the current properties.
     */
    private updateHTMLText;
    /**
     * Callback executed when Troika's text sync is complete.
     * It captures layout data like total height and line count.
     */
    onSyncComplete(): void;
    /**
     * Private method to perform the actual initialization after the async
     * import has resolved.
     */
    protected _initializeText(): void;
    protected syncTextObj(): void;
    protected setTextColor(color: number): void;
    /**
     * Disposes of resources used by the TextView, such as event listeners.
     */
    dispose(): void;
}
export {};
