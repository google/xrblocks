import { Container } from '@pmndrs/uikit';

/**
 * A Container that renders one or more PanelLayers as its background.
 * It automatically syncs Container properties (size) to the panel layers.
 */
class ShaderPanel extends Container {
    constructor(properties) {
        const { ...containerProps } = properties;
        // Default styles.
        const defaultProps = {
            positionType: properties.positionType ?? 'relative',
            backgroundColor: undefined,
            pointerEvents: 'none',
            ...containerProps,
        };
        super(defaultProps);
        /** Array of PanelLayers rendered as background. */
        this.panelLayers = [];
    }
    /**
     * Adds a PanelLayer to the background and configures it.
     * @param layer - The layer to add.
     */
    addLayer(layer) {
        this.panelLayers.push(layer);
        this.add(layer);
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
    removeLayer(layer) {
        const index = this.panelLayers.indexOf(layer);
        if (index !== -1) {
            this.panelLayers.splice(index, 1);
            this.remove(layer);
        }
    }
}

export { ShaderPanel };
