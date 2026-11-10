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
  EDGE_BAND_MARGIN,
  EDGE_GLOW_FADE_SECONDS,
  EDGE_GLOW_PRESS_FILL_SECONDS,
  EDGE_GLOW_PRESS_LENGTH_SECONDS,
  EDGE_GLOW_PRESSED_FILL_COLOR,
  EDGE_GLOW_PRESSED_RIM_COLOR,
  EDGE_GLOW_RELEASE_SECONDS,
  MAX_RESIZE_CORNER_FRACTION,
  RESIZE_CORNER_ARC_COLOR,
  RESIZE_CORNER_ARC_LEAVE_CUT_SECONDS,
  RESIZE_CORNER_ARC_LEAVE_FADE_SECONDS,
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
import type {CursorFlags} from './UIBackend';

/**
 * Tolerance for accumulated frame times, so a frame that lands on a deadline
 * in floating point still reaches it.
 */
const FRAME_TIME_EPSILON_SECONDS = 1e-6;
/** Marks a cursor whose arc is not fading out after leaving the band. */
const ARC_NOT_LEAVING = -1;
/** Holding state of two cursors that are only pointing. */
const NOT_HOLDING: Readonly<CursorFlags> = [false, false];

/** Names of one cursor's uniforms in the edge material. */
interface CursorUniformNames {
  readonly cursorUv: string;
  readonly showGlow: string;
  readonly glowPressLength: string;
  readonly glowPressFill: string;
  readonly cornerSign: string;
  readonly cornerAlpha: string;
  readonly cornerPress: string;
}

const FIRST_CURSOR_UNIFORMS: CursorUniformNames = {
  cursorUv: 'u_cursor_uv',
  showGlow: 'u_show_glow',
  glowPressLength: 'u_glow_press_length',
  glowPressFill: 'u_glow_press_fill',
  cornerSign: 'u_corner_sign',
  cornerAlpha: 'u_corner_alpha',
  cornerPress: 'u_corner_press',
};

const SECOND_CURSOR_UNIFORMS: CursorUniformNames = {
  cursorUv: 'u_cursor_uv_2',
  showGlow: 'u_show_glow_2',
  glowPressLength: 'u_glow_press_length_2',
  glowPressFill: 'u_glow_press_fill_2',
  cornerSign: 'u_corner_sign_2',
  cornerAlpha: 'u_corner_alpha_2',
  cornerPress: 'u_corner_press_2',
};

/** One cursor's state on the edge, with the names of its uniforms. */
class CursorSlot {
  readonly local = new THREE.Vector3();
  readonly uv = new THREE.Vector2();
  /** The resize corner its arc is drawn on, as x/y signs. */
  readonly cornerSign = new THREE.Vector2();
  /** Whether it is on a resize corner, or holding one. */
  cornerShown = false;
  /** Whether its side glow is fading in rather than out. */
  glowShown = false;
  glowAlpha = 0;
  /** Whether it was holding on the previous update. */
  holding = false;
  /**
   * Seconds since it left the band from its shown corner arc, while that arc
   * fades out, or ARC_NOT_LEAVING.
   */
  arcLeaveElapsed = ARC_NOT_LEAVING;
  /** Whether its hold started on a side of the band. */
  sidePressed = false;
  /** Whether its hold started on a resize corner. */
  cornerPressed = false;
  /** Progress of the pressed glow length, from 0 to 1. */
  glowPressLength = 0;
  /** Progress of the pressed glow fill and color, from 0 to 1. */
  glowPressFill = 0;
  /** Progress of the pressed arc width, from 0 to 1. */
  cornerPress = 0;

  constructor(readonly uniforms: CursorUniformNames) {}
}

const DEFAULT_EDGE_PROPERTIES = {
  margin: EDGE_BAND_MARGIN,
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
      setNumber(this.material, 'u_debug', signals.u_debug?.value);
    }, this.abortSignal);
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
  private readonly cursors = [
    new CursorSlot(FIRST_CURSOR_UNIFORMS),
    new CursorSlot(SECOND_CURSOR_UNIFORMS),
  ] as const;

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
          const band: OuterBandIntersection = intersection;
          band.outerBandDistance = outerBandDistance(uv, size, this.margin);
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

  /** Detaches the edge and releases the material it owns. */
  override dispose(): void {
    super.dispose();
    this.material.dispose();
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
   * Updates the cursors pointing at the edge, with whether each one is
   * holding. A cursor on a resize corner shows that corner's arc instead of
   * the glow: the glow fades out first, and the arc appears once it is gone.
   * Moving back to a side hides the arc at once and fades the glow in;
   * leaving the band from a corner fades the arc out. While holding, a cursor
   * keeps its corner arc wherever it points. A hold that starts on a side
   * shortens and tints the glow and keeps it at the grab point; one that
   * starts on a resize corner thins the arc.
   */
  setCursorPoints(
    first?: THREE.Vector3,
    second?: THREE.Vector3,
    holding: Readonly<CursorFlags> = NOT_HOLDING
  ): void {
    this.setCursorPoint(first, this.cursors[0], holding[0]);
    this.setCursorPoint(second, this.cursors[1], holding[1]);
  }

  /**
   * Advances the glow fades, leaving arc fades and press transitions, and
   * shows arcs whose glow has faded out.
   */
  update(deltaSeconds: number): void {
    const step = deltaSeconds / EDGE_GLOW_FADE_SECONDS;
    const release = deltaSeconds / EDGE_GLOW_RELEASE_SECONDS;
    for (const cursor of this.cursors) {
      cursor.glowAlpha = approach(
        cursor.glowAlpha,
        cursor.glowShown ? 1 : 0,
        step
      );
      setNumber(this.material, cursor.uniforms.showGlow, cursor.glowAlpha);
      const pressed = cursor.sidePressed;
      cursor.glowPressLength = approach(
        cursor.glowPressLength,
        pressed ? 1 : 0,
        pressed ? deltaSeconds / EDGE_GLOW_PRESS_LENGTH_SECONDS : release
      );
      cursor.glowPressFill = approach(
        cursor.glowPressFill,
        pressed ? 1 : 0,
        pressed ? deltaSeconds / EDGE_GLOW_PRESS_FILL_SECONDS : release
      );
      if (cursor.cornerPressed) {
        cursor.cornerPress = approach(
          cursor.cornerPress,
          1,
          deltaSeconds / RESIZE_CORNER_ARC_PRESS_SECONDS
        );
      }
      if (cursor.arcLeaveElapsed !== ARC_NOT_LEAVING) {
        cursor.arcLeaveElapsed += deltaSeconds;
        if (
          cursor.arcLeaveElapsed >=
          RESIZE_CORNER_ARC_LEAVE_CUT_SECONDS - FRAME_TIME_EPSILON_SECONDS
        ) {
          cursor.arcLeaveElapsed = ARC_NOT_LEAVING;
        }
      }
      this.updatePress(cursor);
      this.updateArc(cursor);
    }
    this.updateVisibility();
  }

  private setCursorPoint(
    point: THREE.Vector3 | undefined,
    cursor: CursorSlot,
    holding: boolean
  ): void {
    const size = this.size.value;
    const uv = point && size ? this.cursorUv(point, cursor) : undefined;
    const onBand =
      uv !== undefined &&
      size !== undefined &&
      isOuterEdgeHit(uv, size, this.margin, this._cardCornerRadius);
    const pressStarted = holding && !cursor.holding;
    const released = !holding && cursor.holding;
    const arcWasFull = this.arcAlpha(cursor) === 1;
    cursor.holding = holding;
    if (!holding || pressStarted) {
      const onCorner =
        onBand &&
        this._resizable &&
        isCornerHit(uv, size, this.margin, this._cardCornerRadius);
      if (onCorner) {
        cursor.cornerSign.set(uv.x < 0.5 ? -1 : 1, uv.y < 0.5 ? -1 : 1);
        setVector2(
          this.material,
          cursor.uniforms.cornerSign,
          cursor.cornerSign
        );
      }
      cursor.cornerShown = onCorner;
    }
    if (pressStarted) {
      cursor.cornerPressed = cursor.cornerShown;
      cursor.sidePressed = onBand && !cursor.cornerShown;
    } else if (!holding) {
      cursor.cornerPressed = false;
      cursor.sidePressed = false;
      cursor.cornerPress = 0;
    }
    // Only the edge band glows; pointing at the card itself shows nothing. A
    // fading glow keeps its last cursor so it fades in place, and a pressed
    // side keeps the cursor where the card was grabbed.
    cursor.glowShown =
      (onBand || (cursor.sidePressed && !!uv)) && !cursor.cornerShown;
    if (uv && cursor.glowShown && (pressStarted || !cursor.sidePressed)) {
      setVector2(this.material, cursor.uniforms.cursorUv, uv);
    }
    // An arc fades out when its pointer leaves the band, but goes at once for
    // a side, or when a resize is released off the band.
    if (cursor.cornerShown || cursor.glowShown || released) {
      cursor.arcLeaveElapsed = ARC_NOT_LEAVING;
    } else if (arcWasFull) {
      cursor.arcLeaveElapsed = 0;
    }
    this.updatePress(cursor);
    this.updateArc(cursor);
    this.updateVisibility();
  }

  /** Writes a world point's edge UV into the cursor's scratch. */
  private cursorUv(point: THREE.Vector3, cursor: CursorSlot): THREE.Vector2 {
    const local = this.worldToLocal(cursor.local.copy(point));
    return cursor.uv.set(local.x + 0.5, local.y + 0.5);
  }

  private arcAlpha(cursor: CursorSlot): number {
    if (cursor.cornerShown) return cursor.glowAlpha === 0 ? 1 : 0;
    const elapsed = cursor.arcLeaveElapsed;
    return elapsed === ARC_NOT_LEAVING
      ? 0
      : Math.max(0, 1 - elapsed / RESIZE_CORNER_ARC_LEAVE_FADE_SECONDS);
  }

  private updateArc(cursor: CursorSlot): void {
    setNumber(
      this.material,
      cursor.uniforms.cornerAlpha,
      this.arcAlpha(cursor)
    );
  }

  private updatePress(cursor: CursorSlot): void {
    const {uniforms} = cursor;
    setNumber(this.material, uniforms.glowPressLength, cursor.glowPressLength);
    setNumber(this.material, uniforms.glowPressFill, cursor.glowPressFill);
    setNumber(this.material, uniforms.cornerPress, cursor.cornerPress);
  }

  private updateVisibility(): void {
    this.material.visible =
      this.cursorVisible(this.cursors[0]) ||
      this.cursorVisible(this.cursors[1]);
  }

  private cursorVisible(cursor: CursorSlot): boolean {
    return (
      cursor.glowAlpha > 0 ||
      cursor.glowPressLength > 0 ||
      cursor.glowPressFill > 0 ||
      cursor.cornerPress > 0 ||
      this.arcAlpha(cursor) > 0
    );
  }
}

/** Moves `value` toward `target` by at most `step`. */
function approach(value: number, target: number, step: number): number {
  return value < target
    ? Math.min(target, value + step)
    : Math.max(target, value - step);
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

/**
 * Returns true on the band: outside the card's rounded rect and inside the
 * band's square-cornered outer box, so the far diagonal tip of each corner
 * responds too, even though the drawn band's outer corners are rounded.
 */
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
  return (
    Math.max(Math.abs(x) - halfWidth, Math.abs(y) - halfHeight) <= padding &&
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
