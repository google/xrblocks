import { Container, ContainerProperties } from '@pmndrs/uikit';
import { PanelLayer, PanelLayerProperties } from './layers/PanelLayer';
/**
 * Properties for configuring a ShaderPanel.
 * Extends standard ContainerProperties with support for custom shaders.
 */
export type ShaderPanelProperties = ContainerProperties;
/**
 * A Container that renders one or more PanelLayers as its background.
 * It automatically syncs Container properties (size) to the panel layers.
 */
export declare abstract class ShaderPanel<T extends ShaderPanelProperties = ShaderPanelProperties> extends Container {
    /** Array of PanelLayers rendered as background. */
    protected panelLayers: PanelLayer<PanelLayerProperties>[];
    constructor(properties: T);
    /**
     * Adds a PanelLayer to the background and configures it.
     * @param layer - The layer to add.
     */
    protected addLayer(layer: PanelLayer<PanelLayerProperties>): void;
    /**
     * Removes a PanelLayer from the background.
     * @param layer - The layer to remove.
     */
    protected removeLayer(layer: PanelLayer<PanelLayerProperties>): void;
}
