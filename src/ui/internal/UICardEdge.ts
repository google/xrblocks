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
  RESIZE_CORNER_ARC_COLOR,
  RESIZE_CORNER_ARC_FADE_SECONDS,
  RESIZE_CORNER_SIDE_MARGINS,
} from '../constants/UICardEdgeConstants';
import {parseColorWithAlpha} from '../utils/ColorUtils';
import {
  PanelLayer,
  type PanelLayerProperties,
  type SignalProperties,
  type WritableSignalProperties,
} from '../primitives/layers/PanelLayer';
import {
  createCardEdgeMaterial,
  type PanelMaterial,
  type PanelUniforms,
} from './PanelMaterialFactory';

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
      createCardEdgeMaterial({
        depthWrite: false,
        side: THREE.DoubleSide,
        uniforms: createUniforms(),
      }),
      inputProperties,
      initialClasses,
      config
    );
    this.visible = false;

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
    this.visible = Boolean(
      signals.u_show_glow?.value || signals.u_show_glow_2?.value
    );
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
  /** Per cursor: the resize corner its arc is drawn on, as x/y signs. */
  private readonly cornerSign = [new THREE.Vector2(), new THREE.Vector2()];
  private readonly cornerAlpha = [0, 0];
  /** Per cursor: whether its corner arc is fading in rather than out. */
  private readonly cornerShown = [false, false];

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
    setColor(this.material, 'u_corner_color', RESIZE_CORNER_ARC_COLOR);

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
  }

  /** Returns true when a world point lies in the outer edge hit band. */
  containsPoint = (point: THREE.Vector3, padding = 0): boolean => {
    const size = this.size.value;
    if (!size) return false;
    this.updateWorldMatrix(true, false);
    if (Math.abs(this.matrixWorld.determinant()) < Number.EPSILON) return false;
    const local = this.worldToLocal(point.clone());
    const xScale = new THREE.Vector3()
      .setFromMatrixColumn(this.matrixWorld, 0)
      .length();
    const paddingPixels =
      padding > 0 && xScale > Number.EPSILON ? (padding / xScale) * size[0] : 0;
    const uv = new THREE.Vector2(local.x + 0.5, local.y + 0.5);
    return isOuterEdgeHit(
      uv,
      size,
      this.margin,
      this._cardCornerRadius,
      paddingPixels
    );
  };

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

  /**
   * Updates the cursors pointing at the edge. A cursor on a resize corner
   * shows that corner's arc instead of the glow, like Android XR. While
   * `holding`, a cursor keeps its corner arc wherever it points.
   */
  setCursorPoints(
    first?: THREE.Vector3,
    second?: THREE.Vector3,
    holding = false
  ): void {
    this.setCursorPoint(first, 0, holding);
    this.setCursorPoint(second, 1, holding);
  }

  /** Advances the corner arc fades. */
  update(deltaSeconds: number): void {
    const step = deltaSeconds / RESIZE_CORNER_ARC_FADE_SECONDS;
    for (const index of [0, 1] as const) {
      const target = this.cornerShown[index] ? 1 : 0;
      const alpha = this.cornerAlpha[index];
      this.cornerAlpha[index] =
        target > alpha
          ? Math.min(target, alpha + step)
          : Math.max(target, alpha - step);
      setNumber(
        this.material,
        index === 0 ? 'u_corner_alpha' : 'u_corner_alpha_2',
        this.cornerAlpha[index]
      );
    }
    this.updateVisibility();
  }

  private setCursorPoint(
    point: THREE.Vector3 | undefined,
    index: 0 | 1,
    holding: boolean
  ): void {
    const size = this.size.value;
    let uv: THREE.Vector2 | undefined;
    if (point && size) {
      const local = this.cursorLocal[index].copy(point);
      this.worldToLocal(local);
      uv = this.cursorUV[index].set(local.x + 0.5, local.y + 0.5);
    }
    const onBand =
      !!uv &&
      !!size &&
      isOuterEdgeHit(uv, size, this.margin, this._cardCornerRadius);
    if (!holding) {
      const onCorner =
        onBand &&
        this._resizable &&
        isCornerHit(uv!, size!, this.margin, this._cardCornerRadius);
      if (onCorner) {
        this.cornerSign[index].set(uv!.x < 0.5 ? -1 : 1, uv!.y < 0.5 ? -1 : 1);
        setVector2(
          this.material,
          index === 0 ? 'u_corner_sign' : 'u_corner_sign_2',
          this.cornerSign[index]
        );
      }
      this.cornerShown[index] = onCorner;
    }
    // Like Android XR, only the edge band glows; pointing at the card itself
    // shows nothing.
    this.setCursor(this.cornerShown[index] || !onBand ? undefined : uv, index);
    this.updateVisibility();
  }

  private updateVisibility(): void {
    const signals = (
      this.properties as unknown as {
        signal: SignalProperties<HandleLayerProperties>;
      }
    ).signal;
    this.visible = Boolean(
      signals.u_show_glow?.value ||
        signals.u_show_glow_2?.value ||
        this.cornerShown[0] ||
        this.cornerShown[1] ||
        this.cornerAlpha[0] > 0 ||
        this.cornerAlpha[1] > 0
    );
  }
}

function createUniforms(): PanelUniforms {
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
    u_corner_color: {value: new THREE.Vector4(1, 1, 1, 1)},
    u_corner_sign: {value: new THREE.Vector2()},
    u_corner_alpha: {value: 0},
    u_corner_sign_2: {value: new THREE.Vector2()},
    u_corner_alpha_2: {value: 0},
  };
}

function setNumber(
  material: PanelMaterial,
  name: string,
  value: number | undefined
): void {
  if (value !== undefined) material.uniforms[name].value = value;
}

function setColor(
  material: PanelMaterial,
  name: string,
  value: THREE.ColorRepresentation | undefined
): void {
  if (value === undefined) return;
  const {color, opacity} = parseColorWithAlpha(value);
  (material.uniforms[name].value as THREE.Vector4).set(
    color.r,
    color.g,
    color.b,
    opacity
  );
}

function setVector2(
  material: PanelMaterial,
  name: string,
  value: THREE.Vector2 | undefined
): void {
  if (value !== undefined)
    (material.uniforms[name].value as THREE.Vector2).copy(value);
}

export function isOuterEdgeHit(
  uv: THREE.Vector2,
  size: readonly [number, number],
  margin: number,
  cardCornerRadius: number,
  padding = 0
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
    roundedBoxDistance(x, y, halfWidth, halfHeight, outerRadius) <= padding &&
    roundedBoxDistance(x, y, innerHalfWidth, innerHalfHeight, innerRadius) >=
      -padding
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
