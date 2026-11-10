import {
  abortableEffect,
  type InProperties,
  type RenderContext,
  type WithSignal,
} from '@pmndrs/uikit';
import * as THREE from 'three';

import type {OuterBandIntersection} from '../../interaction/HitResolver';
import {ManipulationAction} from '../../interaction/manipulation/ManipulationTypes';
import {
  EDGE_GLOW_FADE_SECONDS,
  EDGE_GLOW_PRESS_FILL_SECONDS,
  EDGE_GLOW_PRESS_LENGTH_SECONDS,
  EDGE_GLOW_PRESSED_FILL_COLOR,
  EDGE_GLOW_PRESSED_RIM_COLOR,
  EDGE_GLOW_RELEASE_SECONDS,
  MAX_RESIZE_CORNER_FRACTION,
  RESIZE_CORNER_ARC_COLOR,
  RESIZE_CORNER_ARC_PRESS_SECONDS,
  RESIZE_CORNER_LENGTH,
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
  // Android XR's side edge rim and hit band reach about 87 mm past the panel.
  margin: 87,
  cardCornerRadius: 0,
  spotlightColor: 'rgba(255, 255, 255, 1)',
  debug: false,
  resizable: false,
} as const;

/** Private visual and hit-area settings for a card manipulation edge. */
export interface UICardEdgeProperties {
  /** Width of the manipulation band extending outward from the card edge. */
  margin?: number;
  /** Corner radius of the card surface in layout pixels. */
  cardCornerRadius?: number;
  /** Color of the hover glow on the edge. */
  spotlightColor?: THREE.ColorRepresentation;
  /** Shows the complete hit surface for diagnostics. */
  debug?: boolean;
  /** Routes corner hits to the Resize action instead of Translate. */
  resizable?: boolean;
}

type HandleLayerProperties = PanelLayerProperties & {
  u_edge_margin?: number;
  u_card_corner_radius?: number;
  u_cursor_spotlight_color?: THREE.ColorRepresentation;
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
    // Hide only the material: rays skip invisible objects, and the band must
    // stay hittable before it draws anything.
    this.material.visible = false;

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
      setColor(
        this.material,
        'u_cursor_spotlight_color',
        signals.u_cursor_spotlight_color?.value
      );
      setVector2(this.material, 'u_cursor_uv', signals.u_cursor_uv?.value);
      setNumber(this.material, 'u_show_glow', signals.u_show_glow?.value);
      setVector2(this.material, 'u_cursor_uv_2', signals.u_cursor_uv_2?.value);
      setNumber(this.material, 'u_show_glow_2', signals.u_show_glow_2?.value);
      setNumber(this.material, 'u_debug', signals.u_debug?.value);
    }, this.abortSignal);
  }

  setCursor(uv: THREE.Vector2, index: 0 | 1): void {
    const cursor =
      index === 0 ? this.signals.u_cursor_uv : this.signals.u_cursor_uv_2;
    if (!cursor) return;
    if (cursor.value) cursor.value.copy(uv);
    else cursor.value = uv.clone();
    setVector2(
      this.material,
      index === 0 ? 'u_cursor_uv' : 'u_cursor_uv_2',
      uv
    );
  }

  setGlowAlpha(alpha: number, index: 0 | 1): void {
    const glow =
      index === 0 ? this.signals.u_show_glow : this.signals.u_show_glow_2;
    if (glow) glow.value = alpha;
  }

  private get signals() {
    return (
      this.properties as unknown as {
        signal: WritableSignalProperties<HandleLayerProperties>;
      }
    ).signal;
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
  /** Per cursor: whether it is on a resize corner, or holding one. */
  private readonly cornerShown = [false, false];
  /** Per cursor: whether its side glow is fading in rather than out. */
  private readonly glowShown = [false, false];
  private readonly glowAlpha = [0, 0];
  /** Per cursor: whether it was holding on the previous update. */
  private readonly holding = [false, false];
  /** Per cursor: whether its hold started on a side of the band. */
  private readonly sidePressed = [false, false];
  /** Per cursor: whether its hold started on a resize corner. */
  private readonly cornerPressed = [false, false];
  /** Per cursor: progress of the pressed glow length, from 0 to 1. */
  private readonly glowPressLength = [0, 0];
  /** Per cursor: progress of the pressed glow fill and color, from 0 to 1. */
  private readonly glowPressFill = [0, 0];
  /** Per cursor: progress of the pressed arc width, from 0 to 1. */
  private readonly cornerPress = [0, 0];

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
      u_cursor_spotlight_color: resolved.spotlightColor,
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
    setColor(
      this.material,
      'u_glow_pressed_rim_color',
      EDGE_GLOW_PRESSED_RIM_COLOR
    );
    setColor(
      this.material,
      'u_glow_pressed_fill_color',
      EDGE_GLOW_PRESSED_FILL_COLOR
    );

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
        } else {
          (intersection as OuterBandIntersection).outerBandDistance =
            outerBandDistance(uv, size, this.margin);
          if (
            this._resizable &&
            isCornerHit(uv, size, this.margin, this._cardCornerRadius)
          ) {
            this.resizeHandle.matrixWorld.copy(this.matrixWorld);
            intersection.object = this.resizeHandle;
          }
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
   * shows that corner's arc instead of the glow, like Android XR: the glow
   * fades out first, and the arc appears once it is gone. While `holding`, a
   * cursor keeps its corner arc wherever it points. A hold that starts on a
   * side shortens and tints the glow and keeps it at the grab point; one that
   * starts on a resize corner thins the arc.
   */
  setCursorPoints(
    first?: THREE.Vector3,
    second?: THREE.Vector3,
    holding = false
  ): void {
    this.setCursorPoint(first, 0, holding);
    this.setCursorPoint(second, 1, holding);
  }

  /**
   * Advances the glow fades and press transitions, and shows arcs whose glow
   * has faded out.
   */
  update(deltaSeconds: number): void {
    const step = deltaSeconds / EDGE_GLOW_FADE_SECONDS;
    const release = deltaSeconds / EDGE_GLOW_RELEASE_SECONDS;
    for (const index of [0, 1] as const) {
      const alpha = this.glowAlpha[index];
      this.glowAlpha[index] = this.glowShown[index]
        ? Math.min(1, alpha + step)
        : Math.max(0, alpha - step);
      this.setGlowAlpha(this.glowAlpha[index], index);
      const pressed = this.sidePressed[index];
      this.glowPressLength[index] = pressed
        ? Math.min(
            1,
            this.glowPressLength[index] +
              deltaSeconds / EDGE_GLOW_PRESS_LENGTH_SECONDS
          )
        : Math.max(0, this.glowPressLength[index] - release);
      this.glowPressFill[index] = pressed
        ? Math.min(
            1,
            this.glowPressFill[index] +
              deltaSeconds / EDGE_GLOW_PRESS_FILL_SECONDS
          )
        : Math.max(0, this.glowPressFill[index] - release);
      if (this.cornerPressed[index]) {
        this.cornerPress[index] = Math.min(
          1,
          this.cornerPress[index] +
            deltaSeconds / RESIZE_CORNER_ARC_PRESS_SECONDS
        );
      }
      this.updatePress(index);
      this.updateArc(index);
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
    const pressStarted = holding && !this.holding[index];
    this.holding[index] = holding;
    if (!holding || pressStarted) {
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
    if (pressStarted) {
      this.cornerPressed[index] = this.cornerShown[index];
      this.sidePressed[index] = onBand && !this.cornerShown[index];
    } else if (!holding) {
      this.cornerPressed[index] = false;
      this.sidePressed[index] = false;
      this.cornerPress[index] = 0;
    }
    // Like Android XR, only the edge band glows; pointing at the card itself
    // shows nothing. A fading glow keeps its last cursor so it fades in place,
    // and a pressed side keeps the cursor where the card was grabbed.
    this.glowShown[index] =
      (onBand || (this.sidePressed[index] && !!uv)) && !this.cornerShown[index];
    if (this.glowShown[index] && (pressStarted || !this.sidePressed[index])) {
      this.setCursor(uv!, index);
    }
    this.updatePress(index);
    this.updateArc(index);
    this.updateVisibility();
  }

  private arcShown(index: 0 | 1): boolean {
    return this.cornerShown[index] && this.glowAlpha[index] === 0;
  }

  private updateArc(index: 0 | 1): void {
    setNumber(
      this.material,
      index === 0 ? 'u_corner_alpha' : 'u_corner_alpha_2',
      this.arcShown(index) ? 1 : 0
    );
  }

  private updatePress(index: 0 | 1): void {
    const suffix = index === 0 ? '' : '_2';
    setNumber(
      this.material,
      `u_glow_press_length${suffix}`,
      this.glowPressLength[index]
    );
    setNumber(
      this.material,
      `u_glow_press_fill${suffix}`,
      this.glowPressFill[index]
    );
    setNumber(
      this.material,
      `u_corner_press${suffix}`,
      this.cornerPress[index]
    );
  }

  private updateVisibility(): void {
    this.material.visible = ([0, 1] as const).some(
      (index) =>
        this.glowAlpha[index] > 0 ||
        this.glowPressLength[index] > 0 ||
        this.glowPressFill[index] > 0 ||
        this.cornerPress[index] > 0 ||
        this.arcShown(index)
    );
  }
}

function createUniforms(): PanelUniforms {
  return {
    u_edge_margin: {value: 0},
    u_card_corner_radius: {value: 0},
    u_cursor_spotlight_color: {value: new THREE.Vector4(1, 1, 1, 1)},
    u_cursor_uv: {value: new THREE.Vector2(0.5, 0.5)},
    u_show_glow: {value: 0},
    u_glow_press_length: {value: 0},
    u_glow_press_fill: {value: 0},
    u_cursor_uv_2: {value: new THREE.Vector2(0.5, 0.5)},
    u_show_glow_2: {value: 0},
    u_glow_press_length_2: {value: 0},
    u_glow_press_fill_2: {value: 0},
    u_glow_pressed_rim_color: {value: new THREE.Vector4(1, 1, 1, 1)},
    u_glow_pressed_fill_color: {value: new THREE.Vector4(1, 1, 1, 1)},
    u_debug: {value: 0},
    u_corner_color: {value: new THREE.Vector4(1, 1, 1, 1)},
    u_corner_sign: {value: new THREE.Vector2()},
    u_corner_alpha: {value: 0},
    u_corner_press: {value: 0},
    u_corner_sign_2: {value: new THREE.Vector2()},
    u_corner_alpha_2: {value: 0},
    u_corner_press_2: {value: 0},
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
 * Returns how far outside the card a point on the band is, in layout pixels,
 * so overlapping bands can favor the nearer card.
 */
export function outerBandDistance(
  uv: THREE.Vector2,
  size: readonly [number, number],
  margin: number
): number {
  const halfWidth = size[0] / 2;
  const halfHeight = size[1] / 2;
  const x = Math.abs(uv.x * size[0] - halfWidth) - (halfWidth - margin);
  const y = Math.abs(uv.y * size[1] - halfHeight) - (halfHeight - margin);
  return Math.max(0, x, y);
}

/**
 * Returns true inside the band's corner regions. Each region reaches
 * RESIZE_CORNER_LENGTH along both adjoining sides from the card edge, and at
 * least past the rounded corner, but at most MAX_RESIZE_CORNER_FRACTION of
 * each half side of the card.
 */
export function isCornerHit(
  uv: THREE.Vector2,
  size: readonly [number, number],
  margin: number,
  cardCornerRadius: number
): boolean {
  const halfWidth = size[0] / 2;
  const halfHeight = size[1] / 2;
  const innerHalfWidth = Math.max(0, halfWidth - margin);
  const innerHalfHeight = Math.max(0, halfHeight - margin);
  const innerRadius = Math.min(
    cardCornerRadius,
    innerHalfWidth,
    innerHalfHeight
  );
  const extent = margin + Math.max(innerRadius, RESIZE_CORNER_LENGTH);
  const x = Math.abs(uv.x * size[0] - halfWidth);
  const y = Math.abs(uv.y * size[1] - halfHeight);
  return (
    x >=
      halfWidth -
        Math.min(
          extent,
          margin + innerHalfWidth * MAX_RESIZE_CORNER_FRACTION
        ) &&
    y >=
      halfHeight -
        Math.min(extent, margin + innerHalfHeight * MAX_RESIZE_CORNER_FRACTION)
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
