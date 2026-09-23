import {
  abortableEffect,
  type InProperties,
  type RenderContext,
  type WithSignal,
} from '@pmndrs/uikit';
import * as THREE from 'three';

import {ManipulationAction} from '../../interaction/manipulation/ManipulationTypes';
import {
  MAX_RESIZE_CORNER_FRACTION,
  RESIZE_CORNER_SIDE_MARGINS,
} from '../constants/UICardEdgeConstants';
import {UICardEdgeFragmentShader} from '../shaders/UICardEdge.frag';
import {parseColorWithAlpha} from '../utils/ColorUtils';
import {
  PanelLayer,
  type PanelLayerProperties,
  PanelShaderMaterial,
  type SignalProperties,
  type WritableSignalProperties,
} from '../primitives/layers/PanelLayer';

const DEFAULT_EDGE_PROPERTIES = {
  margin: 50,
  cardCornerRadius: 0,
  edgeWidth: 2,
  spotlightColor: 'rgba(255, 255, 255, 1)',
  spotlightRadius: 20,
  spotlightBlur: 40,
  debug: false,
  resizable: false,
} as const;

/** Private visual and hit-area settings for a card manipulation edge. */
export interface UICardEdgeProperties {
  /** Width of the manipulation band extending outward from the card edge. */
  margin?: number;
  /** Corner radius of the card surface in layout pixels. */
  cardCornerRadius?: number;
  /** Visible shader edge width in layout pixels. */
  edgeWidth?: number;
  /** Color shared by the cursor spotlight and illuminated outline. */
  spotlightColor?: THREE.ColorRepresentation;
  /** Cursor spotlight radius in layout pixels. */
  spotlightRadius?: number;
  /** Cursor spotlight blur in layout pixels. */
  spotlightBlur?: number;
  /** Shows the complete hit surface for diagnostics. */
  debug?: boolean;
  /** Routes corner hits to the Resize action instead of Translate. */
  resizable?: boolean;
}

type HandleLayerProperties = PanelLayerProperties & {
  u_edge_margin?: number;
  u_card_corner_radius?: number;
  u_edge_width?: number;
  u_cursor_spotlight_color?: THREE.ColorRepresentation;
  u_cursor_radius?: number;
  u_cursor_spotlight_blur?: number;
  u_cursor_uv?: THREE.Vector2;
  u_show_glow?: number;
  u_cursor_uv_2?: THREE.Vector2;
  u_show_glow_2?: number;
  u_debug?: number;
  u_resizable?: number;
};

class UICardEdgeLayer extends PanelLayer<HandleLayerProperties> {
  constructor(
    inputProperties?: InProperties<HandleLayerProperties>,
    initialClasses?: Array<InProperties<HandleLayerProperties> | string>,
    config: {
      renderContext?: RenderContext;
      defaultOverrides?: InProperties<HandleLayerProperties>;
      defaults?: WithSignal<HandleLayerProperties>;
    } = {}
  ) {
    super(
      new PanelShaderMaterial({
        fragmentShader: UICardEdgeFragmentShader,
        depthWrite: false,
        side: THREE.DoubleSide,
        uniforms: createUniforms(),
      }),
      inputProperties,
      initialClasses,
      config
    );

    abortableEffect(() => {
      const signals = (
        this.properties as unknown as {
          signal: SignalProperties<HandleLayerProperties>;
        }
      ).signal;
      setNumber(this.material, 'u_edge_margin', signals.u_edge_margin?.value);
      setNumber(
        this.material,
        'u_card_corner_radius',
        signals.u_card_corner_radius?.value
      );
      setNumber(this.material, 'u_edge_width', signals.u_edge_width?.value);
      setColor(
        this.material,
        'u_cursor_spotlight_color',
        signals.u_cursor_spotlight_color?.value
      );
      setNumber(
        this.material,
        'u_cursor_radius',
        signals.u_cursor_radius?.value
      );
      setNumber(
        this.material,
        'u_cursor_spotlight_blur',
        signals.u_cursor_spotlight_blur?.value
      );
      setVector2(this.material, 'u_cursor_uv', signals.u_cursor_uv?.value);
      setNumber(this.material, 'u_show_glow', signals.u_show_glow?.value);
      setVector2(this.material, 'u_cursor_uv_2', signals.u_cursor_uv_2?.value);
      setNumber(this.material, 'u_show_glow_2', signals.u_show_glow_2?.value);
      setNumber(this.material, 'u_debug', signals.u_debug?.value);
      setNumber(this.material, 'u_resizable', signals.u_resizable?.value);
    }, this.abortSignal);
  }

  setCursor(uv: THREE.Vector2 | undefined, index: 0 | 1): void {
    const signals = (
      this.properties as unknown as {
        signal: WritableSignalProperties<HandleLayerProperties>;
      }
    ).signal;
    const cursor = index === 0 ? signals.u_cursor_uv : signals.u_cursor_uv_2;
    const visible = index === 0 ? signals.u_show_glow : signals.u_show_glow_2;
    if (cursor && uv) {
      if (cursor.value) cursor.value.copy(uv);
      else cursor.value = uv;
      setVector2(
        this.material,
        index === 0 ? 'u_cursor_uv' : 'u_cursor_uv_2',
        uv
      );
    }
    if (visible) visible.value = uv ? 1 : 0;
  }
}

/** Private shader-backed card edge. */
export class UICardEdge extends UICardEdgeLayer {
  name = 'UICardEdge';
  readonly margin: number;
  /**
   * Hit target that edge corner intersections are retargeted to. UIKit only
   * accepts UIKit children, so it stays detached and mirrors the edge's world
   * matrix for reticle normals.
   */
  readonly resizeHandle = new THREE.Object3D();
  private _cardCornerRadius: number;
  private _resizable: boolean;
  private readonly cursorLocal = [new THREE.Vector3(), new THREE.Vector3()];
  private readonly cursorUV = [new THREE.Vector2(), new THREE.Vector2()];

  constructor(properties: UICardEdgeProperties = {}) {
    const resolved = {...DEFAULT_EDGE_PROPERTIES, ...properties};
    const margin = Math.max(0, resolved.margin);
    const cardCornerRadius = Math.max(0, resolved.cardCornerRadius);
    super({
      positionType: 'absolute',
      positionTop: -margin,
      positionRight: -margin,
      positionBottom: -margin,
      positionLeft: -margin,
      width: 'auto',
      height: 'auto',
      pointerEvents: 'auto',
      zIndexOffset: -20,
      u_edge_margin: margin,
      u_card_corner_radius: cardCornerRadius,
      u_edge_width: resolved.edgeWidth,
      u_cursor_spotlight_color: resolved.spotlightColor,
      u_cursor_radius: resolved.spotlightRadius,
      u_cursor_spotlight_blur: resolved.spotlightBlur,
      u_cursor_uv: new THREE.Vector2(0.5, 0.5),
      u_show_glow: 0,
      u_cursor_uv_2: new THREE.Vector2(0.5, 0.5),
      u_show_glow_2: 0,
      u_debug: resolved.debug ? 1 : 0,
      u_resizable: resolved.resizable ? 1 : 0,
    });
    this.xb = {
      manipulationHandle: {action: ManipulationAction.Translate},
    };
    this.margin = margin;
    this._cardCornerRadius = cardCornerRadius;
    this._resizable = resolved.resizable;
    this.resizeHandle.name = 'UICardResizeHandle';
    this.resizeHandle.xb = {
      manipulationHandle: {action: ManipulationAction.Resize},
    };
    this.resizeHandle.matrixAutoUpdate = false;
    this.resizeHandle.matrixWorldAutoUpdate = false;

    const baseRaycast = this.raycast.bind(this);
    this.raycast = (raycaster, intersections) => {
      const firstNewIntersection = intersections.length;
      baseRaycast(raycaster, intersections);
      const size = this.size.value;
      for (
        let index = intersections.length - 1;
        index >= firstNewIntersection;
        index--
      ) {
        const intersection = intersections[index];
        const uv = intersection.uv;
        if (
          !size ||
          !uv ||
          !isOuterEdgeHit(uv, size, this.margin, this._cardCornerRadius)
        ) {
          intersections.splice(index, 1);
        } else if (
          this._resizable &&
          isCornerHit(uv, size, this.margin, this._cardCornerRadius)
        ) {
          this.resizeHandle.matrixWorld.copy(this.matrixWorld);
          intersection.object = this.resizeHandle;
        }
      }
    };
  }

  get cardCornerRadius(): number {
    return this._cardCornerRadius;
  }

  setCardCornerRadius(radius: number): void {
    const nextRadius = Math.max(0, radius);
    this._cardCornerRadius = nextRadius;
    const signal = (
      this.properties as unknown as {
        signal: WritableSignalProperties<HandleLayerProperties>;
      }
    ).signal.u_card_corner_radius;
    if (signal) signal.value = nextRadius;
    setNumber(this.material, 'u_card_corner_radius', nextRadius);
  }

  get resizable(): boolean {
    return this._resizable;
  }

  setResizable(resizable: boolean): void {
    this._resizable = resizable;
    const signal = (
      this.properties as unknown as {
        signal: WritableSignalProperties<HandleLayerProperties>;
      }
    ).signal.u_resizable;
    if (signal) signal.value = resizable ? 1 : 0;
    setNumber(this.material, 'u_resizable', resizable ? 1 : 0);
  }

  /** Returns the resize handle when a world point touches a resize corner. */
  touchTarget(point: THREE.Vector3): THREE.Object3D | undefined {
    const size = this.size.value;
    if (!this._resizable || !size) return undefined;
    this.updateWorldMatrix(true, false);
    const local = this.worldToLocal(point.clone());
    const uv = new THREE.Vector2(local.x + 0.5, local.y + 0.5);
    if (
      !isOuterEdgeHit(uv, size, this.margin, this._cardCornerRadius) ||
      !isCornerHit(uv, size, this.margin, this._cardCornerRadius)
    ) {
      return undefined;
    }
    this.resizeHandle.matrixWorld.copy(this.matrixWorld);
    return this.resizeHandle;
  }

  setCursorPoints(first?: THREE.Vector3, second?: THREE.Vector3): void {
    this.setCursorPoint(first, 0);
    this.setCursorPoint(second, 1);
  }

  private setCursorPoint(point: THREE.Vector3 | undefined, index: 0 | 1): void {
    if (!point || !this.size.value) {
      this.setCursor(undefined, index);
      return;
    }
    const local = this.cursorLocal[index].copy(point);
    this.worldToLocal(local);
    this.setCursor(
      this.cursorUV[index].set(local.x + 0.5, local.y + 0.5),
      index
    );
  }
}

function createUniforms(): Record<string, THREE.IUniform> {
  return {
    u_edge_margin: {value: 0},
    u_card_corner_radius: {value: 0},
    u_edge_width: {value: 0},
    u_cursor_spotlight_color: {value: new THREE.Vector4(1, 1, 1, 1)},
    u_cursor_radius: {value: 0},
    u_cursor_spotlight_blur: {value: 0},
    u_cursor_uv: {value: new THREE.Vector2(0.5, 0.5)},
    u_show_glow: {value: 0},
    u_cursor_uv_2: {value: new THREE.Vector2(0.5, 0.5)},
    u_show_glow_2: {value: 0},
    u_debug: {value: 0},
    u_resizable: {value: 0},
  };
}

function setNumber(
  material: THREE.ShaderMaterial,
  name: string,
  value: number | undefined
): void {
  if (value !== undefined) material.uniforms[name].value = value;
}

function setColor(
  material: THREE.ShaderMaterial,
  name: string,
  value: THREE.ColorRepresentation | undefined
): void {
  if (value === undefined) return;
  const {color, opacity} = parseColorWithAlpha(value);
  material.uniforms[name].value.set(color.r, color.g, color.b, opacity);
}

function setVector2(
  material: THREE.ShaderMaterial,
  name: string,
  value: THREE.Vector2 | undefined
): void {
  if (value !== undefined) material.uniforms[name].value.copy(value);
}

function isOuterEdgeHit(
  uv: THREE.Vector2,
  size: readonly [number, number],
  margin: number,
  cardCornerRadius: number
): boolean {
  const halfWidth = size[0] / 2;
  const halfHeight = size[1] / 2;
  const x = uv.x * size[0] - halfWidth;
  const y = uv.y * size[1] - halfHeight;
  const innerHalfWidth = Math.max(0, halfWidth - margin);
  const innerHalfHeight = Math.max(0, halfHeight - margin);
  const innerRadius = Math.min(
    cardCornerRadius,
    innerHalfWidth,
    innerHalfHeight
  );
  const outerRadius = Math.min(innerRadius + margin, halfWidth, halfHeight);
  return (
    roundedBoxDistance(x, y, halfWidth, halfHeight, outerRadius) <= 0 &&
    roundedBoxDistance(x, y, innerHalfWidth, innerHalfHeight, innerRadius) >= 0
  );
}

/**
 * Returns true inside the band's corner regions. Each region covers the rounded
 * corner arc plus one margin width along both adjoining sides.
 */
export function isCornerHit(
  uv: THREE.Vector2,
  size: readonly [number, number],
  margin: number,
  cardCornerRadius: number
): boolean {
  const halfWidth = size[0] / 2;
  const halfHeight = size[1] / 2;
  const innerRadius = Math.min(
    cardCornerRadius,
    Math.max(0, halfWidth - margin),
    Math.max(0, halfHeight - margin)
  );
  const extent = innerRadius + RESIZE_CORNER_SIDE_MARGINS * margin;
  const x = Math.abs(uv.x * size[0] - halfWidth);
  const y = Math.abs(uv.y * size[1] - halfHeight);
  return (
    x >= halfWidth - Math.min(extent, halfWidth * MAX_RESIZE_CORNER_FRACTION) &&
    y >= halfHeight - Math.min(extent, halfHeight * MAX_RESIZE_CORNER_FRACTION)
  );
}

function roundedBoxDistance(
  x: number,
  y: number,
  halfWidth: number,
  halfHeight: number,
  radius: number
): number {
  const qx = Math.abs(x) - halfWidth + radius;
  const qy = Math.abs(y) - halfHeight + radius;
  return (
    Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) +
    Math.min(Math.max(qx, qy), 0) -
    radius
  );
}
