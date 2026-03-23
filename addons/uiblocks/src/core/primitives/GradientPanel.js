import { signal, computed, effect } from '@preact/signals-core';
import { DEFAULT_GRADIENT_PANEL_PROPS } from '../constants/GradientPanelConstants.js';
import { ShaderPanel } from './ShaderPanel.js';
import { DropShadowLayer } from './layers/DropShadowLayer.js';
import { FillLayer } from './layers/FillLayer.js';
import { InnerShadowLayer } from './layers/InnerShadowLayer.js';
import { StrokeLayer } from './layers/StrokeLayer.js';
import 'three';
import '@pmndrs/uikit';
import '../shaders/GradientDropShadow.frag.js';
import '../shaders/CommonFunctions.glsl.js';
import '../shaders/GradientFunctions.glsl.js';
import '../utils/GradientPanelUtils.js';
import '../types/ShaderTypes.js';
import '../utils/ColorUtils.js';
import '../utils/ShaderUtils.js';
import './layers/PanelLayer.js';
import '../shaders/Panel.vert.js';
import '../shaders/GradientFill.frag.js';
import '../shaders/GradientInnerShadow.frag.js';
import '../shaders/GradientStroke.frag.js';

/**
 * GradientPanel.
 * Supports Gradients for Stroke, InnerShadow, and DropShadow.
 */
class GradientPanel extends ShaderPanel {
    // Constructor
    constructor(properties = {}) {
        // Corner Radius
        const cornerRadiusSignal = signal(properties.cornerRadius ??
            DEFAULT_GRADIENT_PANEL_PROPS.cornerRadius);
        // Fill
        const fillColorSignal = signal(properties.fillColor ?? DEFAULT_GRADIENT_PANEL_PROPS.fillColor);
        // Inner Shadow.
        const innerShadowColorSignal = signal(properties.innerShadowColor ??
            DEFAULT_GRADIENT_PANEL_PROPS.innerShadowColor);
        const innerShadowBlurSignal = signal(properties.innerShadowBlur ?? DEFAULT_GRADIENT_PANEL_PROPS.innerShadowBlur);
        const innerShadowPositionSignal = signal(properties.innerShadowPosition ??
            DEFAULT_GRADIENT_PANEL_PROPS.innerShadowPosition);
        const innerShadowSpreadSignal = signal(properties.innerShadowSpread ??
            DEFAULT_GRADIENT_PANEL_PROPS.innerShadowSpread);
        const innerShadowFalloffSignal = signal(properties.innerShadowFalloff ??
            DEFAULT_GRADIENT_PANEL_PROPS.innerShadowFalloff);
        // Drop Shadow.
        const dropShadowColorSignal = signal(properties.dropShadowColor ?? DEFAULT_GRADIENT_PANEL_PROPS.dropShadowColor);
        const dropShadowBlurSignal = signal(properties.dropShadowBlur ?? DEFAULT_GRADIENT_PANEL_PROPS.dropShadowBlur);
        const dropShadowPositionSignal = signal(properties.dropShadowPosition ??
            DEFAULT_GRADIENT_PANEL_PROPS.dropShadowPosition);
        const dropShadowSpreadSignal = signal(properties.dropShadowSpread ??
            DEFAULT_GRADIENT_PANEL_PROPS.dropShadowSpread);
        const dropShadowFalloffSignal = signal(properties.dropShadowFalloff ??
            DEFAULT_GRADIENT_PANEL_PROPS.dropShadowFalloff);
        // Margin = max(DropShadowBlur + Position + Spread, StrokeWidth / 2).
        const shadowExpansion = computed(() => {
            const blur = Math.max(dropShadowBlurSignal.value, 0);
            const spread = Math.max(dropShadowSpreadSignal.value, 0);
            const pos = dropShadowPositionSignal.value;
            let extra = 0;
            if (pos) {
                if (Array.isArray(pos))
                    extra = Math.max(Math.abs(pos[0]), Math.abs(pos[1]));
                else
                    extra = Math.max(Math.abs(pos.x), Math.abs(pos.y));
            }
            return blur + extra + spread;
        });
        // Stroke
        const strokeColorSignal = signal(properties.strokeColor ?? DEFAULT_GRADIENT_PANEL_PROPS.strokeColor);
        const strokeWidthSignal = signal(properties.strokeWidth ??
            DEFAULT_GRADIENT_PANEL_PROPS.strokeWidth);
        const strokeAlignSignal = signal(properties.strokeAlign ??
            DEFAULT_GRADIENT_PANEL_PROPS.strokeAlign);
        // Margin for layout expansion.
        const expansionMarginSignal = computed(() => {
            const s = shadowExpansion.value;
            const sWidth = strokeWidthSignal.value;
            const align = strokeAlignSignal.value;
            let strokeExpand = 0;
            // If Center (1), expand by W/2.
            // If Outside (2), expand by W.
            if (align === 'center')
                strokeExpand = sWidth * 0.5;
            else if (align === 'outside')
                strokeExpand = sWidth;
            // The shadow starts from the stroke edge, so we need to add the stroke expansion to the shadow expansion.
            // But we also need to ensure we at least cover the stroke itself (which is strokeExpand).
            // Since s + strokeExpand >= strokeExpand (assuming s >= 0), we can just sum them.
            return s + strokeExpand;
        });
        super({
            ...properties,
            overflow: 'visible',
        });
        this.name = 'GradientPanel';
        // Drop Shadow
        this.dropShadowLayer = new DropShadowLayer({
            dropShadowColor: dropShadowColorSignal,
            dropShadowBlur: dropShadowBlurSignal,
            dropShadowPosition: dropShadowPositionSignal,
            dropShadowSpread: dropShadowSpreadSignal,
            dropShadowFalloff: dropShadowFalloffSignal,
            strokeWidth: strokeWidthSignal,
            strokeAlign: strokeAlignSignal,
        });
        // Fill.
        this.fillLayer = new FillLayer({
            fillColor: fillColorSignal,
        });
        // Inner Shadow
        this.innerShadowLayer = new InnerShadowLayer({
            innerShadowColor: innerShadowColorSignal,
            innerShadowBlur: innerShadowBlurSignal,
            innerShadowPosition: innerShadowPositionSignal,
            innerShadowSpread: innerShadowSpreadSignal,
            innerShadowFalloff: innerShadowFalloffSignal,
            strokeWidth: strokeWidthSignal,
            strokeAlign: strokeAlignSignal,
        });
        // Stroke
        this.strokeLayer = new StrokeLayer({
            strokeColor: strokeColorSignal,
            strokeWidth: strokeWidthSignal,
            strokeAlign: strokeAlignSignal,
        });
        // Add Layers in correct order.
        this.addLayer(this.dropShadowLayer);
        this.addLayer(this.fillLayer);
        this.addLayer(this.innerShadowLayer);
        this.addLayer(this.strokeLayer);
        // Store Signals.
        this.cornerRadiusSignal = cornerRadiusSignal;
        this.fillColorSignal = fillColorSignal;
        this.innerShadowColorSignal = innerShadowColorSignal;
        this.innerShadowBlurSignal = innerShadowBlurSignal;
        this.innerShadowPositionSignal = innerShadowPositionSignal;
        this.innerShadowSpreadSignal = innerShadowSpreadSignal;
        this.innerShadowFalloffSignal = innerShadowFalloffSignal;
        this.dropShadowColorSignal = dropShadowColorSignal;
        this.dropShadowBlurSignal = dropShadowBlurSignal;
        this.dropShadowPositionSignal = dropShadowPositionSignal;
        this.dropShadowSpreadSignal = dropShadowSpreadSignal;
        this.dropShadowFalloffSignal = dropShadowFalloffSignal;
        this.expansionMarginSignal = expansionMarginSignal;
        this.strokeColorSignal = strokeColorSignal;
        this.strokeWidthSignal = strokeWidthSignal;
        this.strokeAlignSignal = strokeAlignSignal;
        // Layout & Z-Order.
        // Common layout configs.
        const absProps = {
            positionType: 'absolute',
            pointerEvents: 'none',
        };
        // Fill
        this.fillLayer.setProperties({
            ...absProps,
            zIndexOffset: -10,
            pointerEvents: properties.pointerEvents ?? 'auto',
        });
        // Inner Shadow
        this.innerShadowLayer.setProperties({
            ...absProps,
            zIndexOffset: -8,
        });
        // Drop Shadow
        this.dropShadowLayer.setProperties({
            ...absProps,
            zIndexOffset: -4,
        });
        // Stroke
        this.strokeLayer.setProperties({
            ...absProps,
            zIndexOffset: -6,
        });
        // Sync layout.
        const marginNeg = computed(() => -this.expansionMarginSignal.value);
        effect(() => {
            const m = marginNeg.value;
            const props = {
                positionTop: m,
                positionLeft: m,
                positionRight: m,
                positionBottom: m,
            };
            this.fillLayer.setProperties(props);
            this.innerShadowLayer.setProperties(props);
            this.dropShadowLayer.setProperties(props);
            this.strokeLayer.setProperties(props);
        });
        // Sync Corner Radius & Stroke Width & Margin.
        effect(() => {
            const r = this.cornerRadiusSignal.value;
            const w = this.strokeWidthSignal.value;
            const m = this.expansionMarginSignal.value;
            // Apply to all layers.
            for (const layer of this.panelLayers) {
                if (layer.material.uniforms.u_corner_radius) {
                    layer.material.uniforms.u_corner_radius.value = r;
                }
                if (layer.material.uniforms.u_stroke_width) {
                    layer.material.uniforms.u_stroke_width.value = w;
                }
                if (layer.material.uniforms.u_drop_shadow_margin) {
                    layer.material.uniforms.u_drop_shadow_margin.value = m;
                }
            }
        });
        // Auto-calculate renderOrder based on Nesting Level to prevent nested Z-fighting.
        const nestingLevelSignal = computed(() => {
            let count = 0;
            let p = this
                .parentContainer?.value;
            while (p != null) {
                count++;
                p = p
                    .parentContainer?.value;
            }
            return count;
        });
        this.nestingLevelSignal = nestingLevelSignal;
        effect(() => {
            const level = nestingLevelSignal.value;
            // Physically separate sequential layers inside local Group Z-stack.
            const baseZ = level * 0.01;
            this.dropShadowLayer.position.z = baseZ;
            this.fillLayer.position.z = baseZ + 0.001;
            this.innerShadowLayer.position.z = baseZ + 0.002;
            this.strokeLayer.position.z = baseZ + 0.003;
            const contentZ = baseZ + 0.004;
            for (const child of this.children) {
                if (child === this.dropShadowLayer ||
                    child === this.fillLayer ||
                    child === this.innerShadowLayer ||
                    child === this.strokeLayer) {
                    continue;
                }
                const childWithProps = child;
                if (typeof childWithProps.setProperties === 'function') {
                    childWithProps.setProperties({ transformTranslateZ: contentZ });
                }
                else {
                    child.position.z = contentZ;
                }
            }
        });
    }
    /** Overrides add method to cascade physical Z-position offsets for nested panels. */
    add(...objects) {
        super.add(...objects);
        const level = this.nestingLevelSignal?.value ?? 0;
        const baseZ = level * 0.01;
        const contentZ = baseZ + 0.004;
        for (const obj of objects) {
            if (obj === this.dropShadowLayer ||
                obj === this.fillLayer ||
                obj === this.innerShadowLayer ||
                obj === this.strokeLayer) {
                continue;
            }
            const objWithProps = obj;
            if (typeof objWithProps.setProperties === 'function') {
                objWithProps.setProperties({ transformTranslateZ: contentZ });
            }
            else {
                obj.position.z = contentZ;
            }
        }
        return this;
    }
    // Setters.
    /** Sets the corner radius of the panel. */
    setCornerRadius(radius) {
        this.cornerRadiusSignal.value = radius;
    }
    /** Sets the fill color or gradient. */
    setFillColor(c) {
        this.fillColorSignal.value = c;
    }
    /** Sets the inner shadow color or gradient. */
    setInnerShadowColor(c) {
        this.innerShadowColorSignal.value = c;
    }
    /** Sets the inner shadow blur radius. */
    setInnerShadowBlur(v) {
        this.innerShadowBlurSignal.value = v;
    }
    /** Sets the inner shadow position offset. */
    setInnerShadowPosition(v) {
        this.innerShadowPositionSignal.value = v;
    }
    /** Sets the inner shadow spread expansion. */
    setInnerShadowSpread(v) {
        this.innerShadowSpreadSignal.value = v;
    }
    /** Sets the inner shadow falloff rate. */
    setInnerShadowFalloff(v) {
        this.innerShadowFalloffSignal.value = v;
    }
    /** Sets the drop shadow color or gradient. */
    setDropShadowColor(c) {
        this.dropShadowColorSignal.value = c;
    }
    /** Sets the drop shadow blur radius. */
    setDropShadowBlur(v) {
        this.dropShadowBlurSignal.value = v;
    }
    /** Sets the drop shadow position offset. */
    setDropShadowPosition(v) {
        this.dropShadowPositionSignal.value = v;
    }
    /** Sets the drop shadow spread expansion. */
    setDropShadowSpread(v) {
        this.dropShadowSpreadSignal.value = v;
    }
    /** Sets the drop shadow falloff rate. */
    setDropShadowFalloff(v) {
        this.dropShadowFalloffSignal.value = v;
    }
    /** Sets the stroke color or gradient. */
    setStrokeColor(c) {
        this.strokeColorSignal.value = c;
    }
    /** Sets the stroke width. */
    setStrokeWidth(width) {
        this.strokeWidthSignal.value = width;
    }
    /** Sets the stroke alignment (inside, outside, center). */
    setStrokeAlign(align) {
        this.strokeAlignSignal.value = align;
    }
    /**
     * Updates multiple properties at once.
     * Extracts known properties to apply them via signals/setters,
     * passing remaining properties to the super class.
     * @param props - Object containing properties to update.
     */
    setProperties(props) {
        // Extract properties to ensure they are applied in the correct order
        // and not passed to super if not needed.
        const { fillColor, innerShadowColor, innerShadowBlur, innerShadowPosition, innerShadowSpread, innerShadowFalloff, dropShadowColor, dropShadowBlur, dropShadowPosition, dropShadowSpread, dropShadowFalloff, strokeColor, strokeWidth, strokeAlign, cornerRadius, ...superProps } = props;
        // Pass the rest to ShaderPanel.
        super.setProperties(superProps);
        // 1. Fill.
        if (fillColor !== undefined) {
            this.setFillColor(fillColor);
        }
        // 2. Inner Shadow.
        if (innerShadowColor !== undefined)
            this.innerShadowColorSignal.value = innerShadowColor;
        if (innerShadowBlur !== undefined)
            this.innerShadowBlurSignal.value = innerShadowBlur;
        if (innerShadowPosition !== undefined)
            this.innerShadowPositionSignal.value = innerShadowPosition;
        if (innerShadowSpread !== undefined)
            this.innerShadowSpreadSignal.value = innerShadowSpread;
        if (innerShadowFalloff !== undefined)
            this.innerShadowFalloffSignal.value = innerShadowFalloff;
        // 3. Drop Shadow.
        if (dropShadowColor !== undefined)
            this.dropShadowColorSignal.value = dropShadowColor;
        if (dropShadowBlur !== undefined)
            this.dropShadowBlurSignal.value = dropShadowBlur;
        if (dropShadowPosition !== undefined)
            this.dropShadowPositionSignal.value = dropShadowPosition;
        if (dropShadowSpread !== undefined)
            this.dropShadowSpreadSignal.value = dropShadowSpread;
        if (dropShadowFalloff !== undefined)
            this.dropShadowFalloffSignal.value = dropShadowFalloff;
        // 4. Stroke.
        if (strokeColor !== undefined) {
            this.setStrokeColor(strokeColor);
        }
        if (strokeWidth !== undefined) {
            this.setStrokeWidth(strokeWidth);
        }
        if (strokeAlign !== undefined) {
            this.setStrokeAlign(strokeAlign);
        }
        // 5. Corner Radius.
        if (cornerRadius !== undefined) {
            this.setCornerRadius(cornerRadius);
        }
    }
}

export { GradientPanel };
