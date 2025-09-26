/**
 * UI is a declarative 3D UI composition engine for WebXR,
 * inspired by modern frameworks like Jetpack Compose. It builds a three.js
 * scene graph from a JSON configuration, allowing for a clean separation of UI
 * structure and application logic.
 */

import {Script} from '../core/Script';
import type {Constructor} from '../utils/Types';

import {IconButton, IconButtonOptions} from './components/IconButton';
import {IconView, IconViewOptions} from './components/IconView';
import {ImageView, ImageViewOptions} from './components/ImageView';
import {LabelView, LabelViewOptions} from './components/LabelView';
import {TextButton, TextButtonOptions} from './components/TextButton';
import {TextView, TextViewOptions} from './components/TextView';
import {VideoView, VideoViewOptions} from './components/VideoView';
import {Panel} from './core/Panel';
import type {PanelOptions} from './core/PanelOptions';
import {View} from './core/View';
import {Col, ColOptions} from './layouts/Col';
import {Grid, GridOptions} from './layouts/Grid';
import {Orbiter, OrbiterOptions} from './layouts/Orbiter';
import {Row, RowOptions} from './layouts/Row';
import {SpatialPanel, SpatialPanelOptions} from './layouts/SpatialPanel';

// Initializes the Grid class with its dependencies for declarative building.
Grid.init(Row, Col, Panel, Orbiter);

export type UIJsonNodeOptions =
    |PanelOptions|TextViewOptions|IconViewOptions|ImageViewOptions|
    LabelViewOptions|TextButtonOptions|VideoViewOptions|ColOptions|GridOptions|
    RowOptions|OrbiterOptions|SpatialPanelOptions|IconButtonOptions;

export type UIJsonNode = {
  type: string,
  options?: UIJsonNodeOptions,
  position?: {x: number, y: number, z: number},
  rotation?: {x: number, y: number, z: number},
  children?: Array<UIJsonNode>
};

/**
 * Manages the construction and lifecycle of a declarative UI defined by a JSON
 * object. It translates the JSON structure into a hierarchy of UI objects.
 * See samples/ui for a complete example of composing UI with JSON.
 */
export class UI extends Script {
  views: View[] = [];

  /**
   * A static registry mapping string identifiers to UI component classes.
   * This allows for an extensible and declarative UI system.
   */
  static ComponentRegistry = new Map<string, Constructor<View>>();

  /**
   * Registers a component class with a string key, making it available to the
   * `compose` function.
   * @param typeName - The key to use in the JSON configuration.
   * @param componentClass - The class constructor of the UI component.
   */
  static registerComponent(
      typeName: string, componentClass: Constructor<View>) {
    if (UI.ComponentRegistry.has(typeName)) {
      console.warn(`UI: Component type "${typeName}" is being overwritten.`);
    }
    UI.ComponentRegistry.set(typeName, componentClass);
  }

  /**
   * Composes a UI hierarchy from a JSON object and attaches it to this UI
   * instance. This is the primary method for building a declarative UI.
   *
   * @param json - The JSON object defining the UI structure.
   * @returns The root view of the composed UI, or null if composition fails.
   */
  compose(json: UIJsonNode): View|null {
    const rootComponent = this._composeNode(json);
    if (rootComponent) {
      this.add(rootComponent);
      rootComponent.traverse((node) => {
        if (node instanceof View) {
          this.views.push(node);
        }
      });
    }
    return rootComponent;
  }

  /**
   * Recursively processes a single node from the UI JSON configuration.
   * @param nodeJson - The JSON node for a single UI element.
   * @returns The composed UI object for this node, or null on error.
   */
  private _composeNode(nodeJson: UIJsonNode): View|null {
    const {
      type,
      options = {},
      position = {x: 0, y: 0, z: 0},
      rotation = {x: 0, y: 0, z: 0},
      children = []
    } = nodeJson;
    const ComponentClass = UI.ComponentRegistry.get(type);

    if (!ComponentClass) {
      console.error(`UI Error: Unknown component type "${
          type}". Make sure it's registered.`);
      return null;
    }

    const componentInstance = new ComponentClass(options);
    componentInstance.position.set(position.x, position.y, position.z);
    componentInstance.rotation.set(rotation.x, rotation.y, rotation.z);

    children.forEach((childJson: UIJsonNode) => {
      const childComponent = this._composeNode(childJson);
      if (childComponent) {
        componentInstance.add(childComponent);
      }
    });

    // For layouts, ensure they update their children's positions.
    if (componentInstance instanceof Grid) {
      componentInstance.resetLayouts();
    }

    return componentInstance;
  }
}

// Pre-register the standard set of UI components.
UI.registerComponent('Panel', Panel);
UI.registerComponent('Grid', Grid);
UI.registerComponent('Row', Row);
UI.registerComponent('Col', Col);
UI.registerComponent('Orbiter', Orbiter);
UI.registerComponent('Text', TextView);
UI.registerComponent('TextView', TextView);
UI.registerComponent('Label', LabelView);
UI.registerComponent('LabelView', LabelView);
UI.registerComponent('VideoView', VideoView);
UI.registerComponent('TextButton', TextButton);
UI.registerComponent('IconButton', IconButton);
UI.registerComponent('IconView', IconView);
UI.registerComponent('Image', ImageView);
UI.registerComponent('ImageView', ImageView);
UI.registerComponent('SpatialPanel', SpatialPanel);
