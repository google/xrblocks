import {abortableEffect} from '@pmndrs/uikit';
import {computed, ReadonlySignal, signal, Signal} from '@preact/signals-core';
import * as THREE from 'three';
import {DEFAULT_GRADIENT_PANEL_PROPS} from '../constants/GradientPanelConstants';
import {Paint, StrokeAlign} from '../types/ShaderTypes';
import {ShaderPanel, ShaderPanelProperties} from './ShaderPanel';
import {DropShadowLayer} from './layers/DropShadowLayer';
import {FillLayer} from './layers/FillLayer';
import {InnerShadowLayer} from './layers/InnerShadowLayer';
import {StrokeLayer} from './layers/StrokeLayer';

/**
 * Properties for configuring a GradientPanel.
 * Supports Gradients for Stroke, InnerShadow, and DropShadow.
 */
export type GradientPanelProperties = Omit<
  ShaderPanelProperties,
  | 'borderColor'
  | 'borderOpacity'
  | 'backgroundColor'
  | 'backgroundOpacity'
  | 'borderRadius'
  | 'borderWidth'
> & {
  /** Corner radius of the panel. */
  cornerRadius?: number;

  /** Fill color or gradient. */
  fillColor?: Paint;

  /** Inner shadow color or gradient. */
  innerShadowColor?: Paint;
  /** Blurring radius of the inner shadow. */
  innerShadowBlur?: number;
  /** Directional offset of the inner shadow. */
  innerShadowPosition?: THREE.Vector2 | [number, number];
  /** Expansion of the inner shadow silhouette. */
  innerShadowSpread?: number;
  /** Rate of exponential decay for the inner shadow. */
  innerShadowFalloff?: number;

  /** Drop shadow color or gradient. */
  dropShadowColor?: Paint;
  /** Blurring radius of the drop shadow. */
  dropShadowBlur?: number;
  /** Directional offset of the drop shadow. */
  dropShadowPosition?: THREE.Vector2 | [number, number];
  /** Expansion of the drop shadow silhouette. */
  dropShadowSpread?: number;
  /** Rate of exponential decay for the drop shadow. */
  dropShadowFalloff?: number;

  /** Stroke color or gradient. */
  strokeColor?: Paint;
  /** Width of the stroke. */
  strokeWidth?: number;
  /** Alignment of the stroke (inside, outside, center). */
  strokeAlign?: StrokeAlign;
};

/**
 * GradientPanel.
 * Supports Gradients for Stroke, InnerShadow, and DropShadow.
 */
export class GradientPanel extends ShaderPanel<GradientPanelProperties> {
  name = 'GradientPanel';

  /** Signal storing the nesting level for order offset. */
  private nestingLevelSignal!: ReadonlySignal<number>;

  // Corner Radius
  /** Signal storing the corner radius. */
  private cornerRadiusSignal: Signal<number>;

  // Fill
  /** Signal storing the fill color/gradient. */
  private fillColorSignal: Signal<Paint>;

  // Inner Shadow
  /** Signal storing the inner shadow color/gradient. */
  private innerShadowColorSignal: Signal<Paint>;
  /** Signal storing the inner shadow blur radius. */
  private innerShadowBlurSignal: Signal<number>;
  /** Signal storing the inner shadow position offset. */
  private innerShadowPositionSignal: Signal<
    THREE.Vector2 | [number, number] | undefined
  >;
  /** Signal storing the inner shadow spread expansion. */
  private innerShadowSpreadSignal: Signal<number>;
  /** Signal storing the inner shadow falloff rate. */
  private innerShadowFalloffSignal: Signal<number>;

  // Drop Shadow
  /** Signal storing the computed expansion margin for all layers. */
  private expansionMarginSignal: Signal<number>;
  /** Signal storing the drop shadow color/gradient. */
  private dropShadowColorSignal: Signal<Paint>;
  /** Signal storing the drop shadow blur radius. */
  private dropShadowBlurSignal: Signal<number>;
  /** Signal storing the drop shadow position offset. */
  private dropShadowPositionSignal: Signal<
    THREE.Vector2 | [number, number] | undefined
  >;
  /** Signal storing the drop shadow spread expansion. */
  private dropShadowSpreadSignal: Signal<number>;
  /** Signal storing the drop shadow falloff rate. */
  private dropShadowFalloffSignal: Signal<number>;

  // Stroke
  /** Signal storing the stroke color/gradient. */
  private strokeColorSignal: Signal<Paint>;
  /** Signal storing the stroke width. */
  private strokeWidthSignal: Signal<number>;
  /** Signal storing the stroke alignment. */
  private strokeAlignSignal!: Signal<StrokeAlign>;

  // Layers
  /** Layer for rendering the drop shadow. */
  private dropShadowLayer!: DropShadowLayer;
  /** Layer for rendering the fill. */
  private fillLayer!: FillLayer;
  /** Layer for rendering the inner shadow. */
  private innerShadowLayer!: InnerShadowLayer;
  /** Layer for rendering the stroke. */
  private strokeLayer!: StrokeLayer;

  // Constructor
  constructor(properties: GradientPanelProperties = {}) {
    // Corner Radius
    const cornerRadiusSignal = signal(
      (properties.cornerRadius as number) ??
        DEFAULT_GRADIENT_PANEL_PROPS.cornerRadius
    );

    // Fill
    const fillColorSignal = signal(
      properties.fillColor ?? DEFAULT_GRADIENT_PANEL_PROPS.fillColor
    );

    // Inner Shadow.
    const innerShadowColorSignal = signal(
      properties.innerShadowColor ??
        DEFAULT_GRADIENT_PANEL_PROPS.innerShadowColor
    );
    const innerShadowBlurSignal = signal(
      properties.innerShadowBlur ?? DEFAULT_GRADIENT_PANEL_PROPS.innerShadowBlur
    );
    const innerShadowPositionSignal = signal(
      properties.innerShadowPosition ??
        DEFAULT_GRADIENT_PANEL_PROPS.innerShadowPosition
    );
    const innerShadowSpreadSignal = signal(
      properties.innerShadowSpread ??
        DEFAULT_GRADIENT_PANEL_PROPS.innerShadowSpread
    );
    const innerShadowFalloffSignal = signal(
      properties.innerShadowFalloff ??
        DEFAULT_GRADIENT_PANEL_PROPS.innerShadowFalloff
    );

    // Drop Shadow.
    const dropShadowColorSignal = signal(
      properties.dropShadowColor ?? DEFAULT_GRADIENT_PANEL_PROPS.dropShadowColor
    );
    const dropShadowBlurSignal = signal(
      properties.dropShadowBlur ?? DEFAULT_GRADIENT_PANEL_PROPS.dropShadowBlur
    );
    const dropShadowPositionSignal = signal(
      properties.dropShadowPosition ??
        DEFAULT_GRADIENT_PANEL_PROPS.dropShadowPosition
    );
    const dropShadowSpreadSignal = signal(
      properties.dropShadowSpread ??
        DEFAULT_GRADIENT_PANEL_PROPS.dropShadowSpread
    );
    const dropShadowFalloffSignal = signal(
      properties.dropShadowFalloff ??
        DEFAULT_GRADIENT_PANEL_PROPS.dropShadowFalloff
    );

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
          extra = Math.max(
            Math.abs((pos as THREE.Vector2).x),
            Math.abs((pos as THREE.Vector2).y)
          );
      }
      return blur + extra + spread;
    });

    // Stroke
    const strokeColorSignal = signal(
      properties.strokeColor ?? DEFAULT_GRADIENT_PANEL_PROPS.strokeColor
    );
    const strokeWidthSignal = signal(
      (properties.strokeWidth as number) ??
        DEFAULT_GRADIENT_PANEL_PROPS.strokeWidth
    );
    const strokeAlignSignal = signal(
      (properties.strokeAlign as StrokeAlign) ??
        DEFAULT_GRADIENT_PANEL_PROPS.strokeAlign
    );

    // Margin for layout expansion.
    const expansionMarginSignal = computed(() => {
      const s = shadowExpansion.value;
      const sWidth = strokeWidthSignal.value;
      const align = strokeAlignSignal.value;

      let strokeExpand = 0;
      // If Center (1), expand by W/2.
      // If Outside (2), expand by W.
      if (align === 'center') strokeExpand = sWidth * 0.5;
      else if (align === 'outside') strokeExpand = sWidth;

      // The shadow starts from the stroke edge, so we need to add the stroke expansion to the shadow expansion.
      // But we also need to ensure we at least cover the stroke itself (which is strokeExpand).
      // Since s + strokeExpand >= strokeExpand (assuming s >= 0), we can just sum them.
      return s + strokeExpand;
    });

    super({
      ...properties,
      overflow: 'visible',
    });

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
      positionType: 'absolute' as const,
      pointerEvents: 'none' as const,
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
    abortableEffect(() => {
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
    }, this.abortSignal);

    // Sync Corner Radius & Stroke Width & Margin.
    abortableEffect(() => {
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
    }, this.abortSignal);

    // Auto-calculate renderOrder based on Nesting Level to prevent nested Z-fighting.
    const nestingLevelSignal = computed(() => {
      let count = 0;
      let p = (this as unknown as {parentContainer?: {value: unknown}})
        .parentContainer?.value;
      while (p != null) {
        count++;
        p = (p as unknown as {parentContainer?: {value: unknown}})
          .parentContainer?.value;
      }
      return count;
    });
    this.nestingLevelSignal = nestingLevelSignal;

    abortableEffect(() => {
      const level = nestingLevelSignal.value;
      // Physically separate sequential layers inside local Group Z-stack.
      const baseZ = level * 0.01;
      this.dropShadowLayer.position.z = baseZ;
      this.fillLayer.position.z = baseZ + 0.001;
      this.innerShadowLayer.position.z = baseZ + 0.002;
      this.strokeLayer.position.z = baseZ + 0.003;

      const contentZ = baseZ + 0.004;
      for (const child of this.children) {
        if (
          child === this.dropShadowLayer ||
          child === this.fillLayer ||
          child === this.innerShadowLayer ||
          child === this.strokeLayer
        ) {
          continue;
        }
        const childWithProps = child as unknown as {
          setProperties?: (props: unknown) => void;
        };
        if (typeof childWithProps.setProperties === 'function') {
          childWithProps.setProperties({transformTranslateZ: contentZ});
        } else {
          child.position.z = contentZ;
        }
      }
    }, this.abortSignal);
  }

  /** Overrides add method to cascade physical Z-position offsets for nested panels. */
  override add(...objects: THREE.Object3D[]): this {
    super.add(...objects);
    const level = this.nestingLevelSignal?.value ?? 0;
    const baseZ = level * 0.01;
    const contentZ = baseZ + 0.004;

    for (const obj of objects) {
      if (
        obj === this.dropShadowLayer ||
        obj === this.fillLayer ||
        obj === this.innerShadowLayer ||
        obj === this.strokeLayer
      ) {
        continue;
      }
      const objWithProps = obj as unknown as {
        setProperties?: (props: unknown) => void;
      };
      if (typeof objWithProps.setProperties === 'function') {
        objWithProps.setProperties({transformTranslateZ: contentZ});
      } else {
        obj.position.z = contentZ;
      }
    }
    return this;
  }

  // Setters.
  /** Sets the corner radius of the panel. */
  setCornerRadius(radius: number) {
    this.cornerRadiusSignal.value = radius;
  }
  /** Sets the fill color or gradient. */
  setFillColor(c: Paint) {
    this.fillColorSignal.value = c;
  }
  /** Sets the inner shadow color or gradient. */
  setInnerShadowColor(c: Paint) {
    this.innerShadowColorSignal.value = c;
  }
  /** Sets the inner shadow blur radius. */
  setInnerShadowBlur(v: number) {
    this.innerShadowBlurSignal.value = v;
  }
  /** Sets the inner shadow position offset. */
  setInnerShadowPosition(v: THREE.Vector2) {
    this.innerShadowPositionSignal.value = v;
  }
  /** Sets the inner shadow spread expansion. */
  setInnerShadowSpread(v: number) {
    this.innerShadowSpreadSignal.value = v;
  }
  /** Sets the inner shadow falloff rate. */
  setInnerShadowFalloff(v: number) {
    this.innerShadowFalloffSignal.value = v;
  }
  /** Sets the drop shadow color or gradient. */
  setDropShadowColor(c: Paint) {
    this.dropShadowColorSignal.value = c;
  }
  /** Sets the drop shadow blur radius. */
  setDropShadowBlur(v: number) {
    this.dropShadowBlurSignal.value = v;
  }
  /** Sets the drop shadow position offset. */
  setDropShadowPosition(v: THREE.Vector2) {
    this.dropShadowPositionSignal.value = v;
  }
  /** Sets the drop shadow spread expansion. */
  setDropShadowSpread(v: number) {
    this.dropShadowSpreadSignal.value = v;
  }
  /** Sets the drop shadow falloff rate. */
  setDropShadowFalloff(v: number) {
    this.dropShadowFalloffSignal.value = v;
  }
  /** Sets the stroke color or gradient. */
  setStrokeColor(c: Paint) {
    this.strokeColorSignal.value = c;
  }
  /** Sets the stroke width. */
  setStrokeWidth(width: number) {
    this.strokeWidthSignal.value = width;
  }
  /** Sets the stroke alignment (inside, outside, center). */
  setStrokeAlign(align: StrokeAlign) {
    this.strokeAlignSignal.value = align;
  }

  /**
   * Updates multiple properties at once.
   * Extracts known properties to apply them via signals/setters,
   * passing remaining properties to the super class.
   * @param props - Object containing properties to update.
   */
  setProperties(
    props: Partial<GradientPanelProperties> & Record<string, unknown>
  ) {
    // Extract properties to ensure they are applied in the correct order
    // and not passed to super if not needed.
    const {
      fillColor,
      innerShadowColor,
      innerShadowBlur,
      innerShadowPosition,
      innerShadowSpread,
      innerShadowFalloff,
      dropShadowColor,
      dropShadowBlur,
      dropShadowPosition,
      dropShadowSpread,
      dropShadowFalloff,
      strokeColor,
      strokeWidth,
      strokeAlign,
      cornerRadius,
      ...superProps
    } = props;

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
