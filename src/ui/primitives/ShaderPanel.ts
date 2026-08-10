import {Component, Container, ContainerProperties} from '@pmndrs/uikit';
import * as THREE from 'three';
import {TransformScript} from '../../placement/TransformScript';
import {PanelLayer, PanelLayerProperties} from './layers/PanelLayer';

/**
 * Properties for configuring a ShaderPanel.
 * Extends standard ContainerProperties with support for custom shaders.
 */
export type ShaderPanelProperties = ContainerProperties;

/**
 * A Container that renders one or more PanelLayers as its background.
 * It automatically syncs Container properties (size) to the panel layers.
 */
export abstract class ShaderPanel<
  T extends ShaderPanelProperties = ShaderPanelProperties,
> extends Container {
  /** Array of PanelLayers rendered as background. */
  protected panelLayers: PanelLayer<PanelLayerProperties>[] = [];

  constructor(properties: T) {
    const {...containerProps} = properties;
    const containerConfig = {
      hasNonUikitChildren: true,
    } as NonNullable<ConstructorParameters<typeof Container>[2]> & {
      hasNonUikitChildren: boolean;
    };

    // Default styles.
    const defaultProps: ContainerProperties = {
      positionType: properties.positionType ?? 'relative',
      backgroundColor: undefined,
      pointerEvents: 'auto',
      ...containerProps,
    };

    // XR Blocks panels may contain non-rendering placement Scripts alongside
    // UIKit layout children. Non-UIKit children do not enter the Yoga layout.
    super(defaultProps, undefined, containerConfig);
  }

  override add(...objects: THREE.Object3D[]): this {
    for (const object of objects) {
      if (
        !(object instanceof Component) &&
        !(object instanceof TransformScript)
      ) {
        throw new Error(
          'XR Blocks UI panels only accept UIKit components or TransformScript children.'
        );
      }
    }
    return super.add(...objects);
  }

  /**
   * Adds a PanelLayer to the background and configures it.
   * @param layer - The layer to add.
   */
  protected addLayer(layer: PanelLayer<PanelLayerProperties>) {
    this.panelLayers.push(layer);
    this.add(layer as unknown as THREE.Object3D);

    // Enforce absolute positioning to fill container.
    layer.setProperties({
      positionType: 'absolute',
      positionTop: 0,
      positionLeft: 0,
      positionRight: 0,
      positionBottom: 0,
      zIndexOffset: -1,
    });
  }

  /**
   * Removes a PanelLayer from the background.
   * @param layer - The layer to remove.
   */
  protected removeLayer(layer: PanelLayer<PanelLayerProperties>) {
    const index = this.panelLayers.indexOf(layer);
    if (index !== -1) {
      this.panelLayers.splice(index, 1);
      this.remove(layer as unknown as THREE.Object3D);
    }
  }
}
