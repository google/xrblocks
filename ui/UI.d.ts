/**
 * UI is a declarative 3D UI composition engine for WebXR,
 * inspired by modern frameworks like Jetpack Compose. It builds a three.js
 * scene graph from a JSON configuration, allowing for a clean separation of UI
 * structure and application logic.
 */
import { Script } from '../core/Script';
import type { Constructor } from '../utils/Types';
import { IconButtonOptions } from './components/IconButton';
import { IconViewOptions } from './components/IconView';
import { ImageViewOptions } from './components/ImageView';
import { LabelViewOptions } from './components/LabelView';
import { TextButtonOptions } from './components/TextButton';
import { TextViewOptions } from './components/TextView';
import { VideoViewOptions } from './components/VideoView';
import type { PanelOptions } from './core/PanelOptions';
import { View } from './core/View';
import { ColOptions } from './layouts/Col';
import { GridOptions } from './layouts/Grid';
import { OrbiterOptions } from './layouts/Orbiter';
import { RowOptions } from './layouts/Row';
import { SpatialPanelOptions } from './layouts/SpatialPanel';
export type UIJsonNodeOptions = PanelOptions | TextViewOptions | IconViewOptions | ImageViewOptions | LabelViewOptions | TextButtonOptions | VideoViewOptions | ColOptions | GridOptions | RowOptions | OrbiterOptions | SpatialPanelOptions | IconButtonOptions;
export type UIJsonNode = {
    type: string;
    options?: UIJsonNodeOptions;
    position?: {
        x: number;
        y: number;
        z: number;
    };
    rotation?: {
        x: number;
        y: number;
        z: number;
    };
    children?: Array<UIJsonNode>;
};
/**
 * Manages the construction and lifecycle of a declarative UI defined by a JSON
 * object. It translates the JSON structure into a hierarchy of UI objects.
 * See samples/ui for a complete example of composing UI with JSON.
 */
export declare class UI extends Script {
    views: View[];
    /**
     * A static registry mapping string identifiers to UI component classes.
     * This allows for an extensible and declarative UI system.
     */
    static ComponentRegistry: Map<string, Constructor<View<import("three").Object3DEventMap>>>;
    /**
     * Registers a component class with a string key, making it available to the
     * `compose` function.
     * @param typeName - The key to use in the JSON configuration.
     * @param componentClass - The class constructor of the UI component.
     */
    static registerComponent(typeName: string, componentClass: Constructor<View>): void;
    /**
     * Composes a UI hierarchy from a JSON object and attaches it to this UI
     * instance. This is the primary method for building a declarative UI.
     *
     * @param json - The JSON object defining the UI structure.
     * @returns The root view of the composed UI, or null if composition fails.
     */
    compose(json: UIJsonNode): View | null;
    /**
     * Recursively processes a single node from the UI JSON configuration.
     * @param nodeJson - The JSON node for a single UI element.
     * @returns The composed UI object for this node, or null on error.
     */
    private _composeNode;
}
