import type * as THREE from 'three';

import type {
  ManipulationOptions,
  ResizeOptions,
  TranslateOptions,
} from '../../interaction/manipulation/ManipulationTypes';
import {normalizeManipulationConfig} from '../../interaction/manipulation/ManipulationConfig';
import {type UIAppearance, validateUIAppearance} from '../UIAppearance';
import {UIElement, type UIElementOptions} from '../UIElement';

export interface UISize {
  width: number | 'auto';
  height: number | 'auto';
}

export interface UIResolvedSize {
  width: number;
  height: number;
}

export interface UICardEdgeOptions {
  translateFromSurface?: boolean;
}

/**
 * An Android XR style title pill (orbiter) floating above a card, with an
 * optional app icon and minimize and close buttons.
 */
export interface UICardOrbiterOptions {
  /** Material Symbols icon name shown at the left. Omit for no icon. */
  icon?: string;
  /**
   * Called when the app icon is clicked, e.g. to open the app's own menu.
   * Only then does the icon show a hover disc and take clicks; without it the
   * icon is decorative. Requires `icon`.
   */
  onIcon?: () => void;
  /**
   * Called by the minimize button instead of the default, which collapses the
   * card to its orbiter (see `UICard.minimized`).
   */
  onMinimize?: () => void;
  /** Called by the close button. Defaults to hiding the card. */
  onClose?: () => void;
}

export type UICardAnchorX = 'left' | 'center' | 'right';
export type UICardAnchorY = 'bottom' | 'center' | 'top';

export interface UICardOptions extends UIElementOptions {
  size?: Partial<UISize>;
  pixelSize?: number;
  anchorX?: UICardAnchorX;
  anchorY?: UICardAnchorY;
  appearance?: UIAppearance;
  manipulation?: boolean | ManipulationOptions;
  edge?: boolean | UICardEdgeOptions;
  /**
   * Shows an orbiter centered above the card's top edge. It keeps a constant
   * size when the card resizes and fades out while a resize corner is held.
   * By default, minimize collapses the card to its orbiter and close hides the
   * card; pass handlers for app-specific behavior. Off by default.
   */
  orbiter?: boolean | UICardOrbiterOptions;
}

/** The only world-transform root in a spatial UI tree. */
export class UICard<
  TEventMap extends THREE.Object3DEventMap = THREE.Object3DEventMap,
> extends UIElement<TEventMap> {
  name = 'UICard';
  readonly pixelSize: number;
  readonly anchorX: UICardAnchorX;
  readonly anchorY: UICardAnchorY;
  readonly appearance: UIAppearance;
  private readonly sizeTarget: UISize;
  private readonly sizeProxy: UISize;
  private readonly edgeTarget: Required<UICardEdgeOptions> = {
    translateFromSurface: false,
  };
  private readonly edgeProxy: Required<UICardEdgeOptions>;
  private edgeEnabled = false;
  private orbiterOptions?: Readonly<UICardOrbiterOptions>;
  private minimizedState = false;

  constructor({
    size = {},
    pixelSize = 0.001,
    anchorX = 'center',
    anchorY = 'center',
    appearance = 'surface',
    manipulation,
    edge = false,
    orbiter = false,
    ...options
  }: UICardOptions = {}) {
    const normalizedSize = normalizeSize(size);
    validatePixelSize(pixelSize);
    validateAnchor(anchorX, ['left', 'center', 'right'], 'anchorX');
    validateAnchor(anchorY, ['bottom', 'center', 'top'], 'anchorY');
    validateUIAppearance(appearance);
    super('card', options);
    this.pixelSize = pixelSize;
    this.anchorX = anchorX;
    this.anchorY = anchorY;
    this.appearance = appearance;
    this.sizeTarget = normalizedSize;
    this.sizeProxy = new Proxy(this.sizeTarget, {
      set: (target, property, value) => {
        if (property === 'width' || property === 'height') {
          validateDimension(value);
        } else {
          throw new Error(
            `Unknown UICard size property "${String(property)}".`
          );
        }
        Reflect.set(target, property, value);
        resolvedSizes.delete(this);
        this.markUIDirty();
        return true;
      },
    });
    this.edgeProxy = new Proxy(this.edgeTarget, {
      set: (target, property, value) => {
        if (property !== 'translateFromSurface' || typeof value !== 'boolean') {
          throw new Error(
            `Unknown or invalid UICard edge option "${String(property)}".`
          );
        }
        const previous = Reflect.get(target, property);
        Reflect.set(target, property, value);
        try {
          this.validateEdge();
        } catch (error) {
          Reflect.set(target, property, previous);
          throw error;
        }
        this.markUIDirty();
        return true;
      },
    });

    this.manipulation = manipulation;
    this.edge = edge;
    this.orbiter = orbiter;
  }

  get size(): UISize {
    return this.sizeProxy;
  }

  set size(value: Partial<UISize>) {
    const normalized = normalizeSize(value);
    this.sizeProxy.width = normalized.width;
    this.sizeProxy.height = normalized.height;
  }

  get manipulation(): boolean | ManipulationOptions | undefined {
    return this.xb?.manipulation;
  }

  set manipulation(value: boolean | ManipulationOptions | undefined) {
    const normalized = normalizeCardManipulation(value);
    this.validateEdge(this.edgeEnabled, normalized);
    this.xb ??= {};
    this.xb.manipulation = normalized;
    this.markUIDirty();
  }

  get edge(): false | Required<UICardEdgeOptions> {
    return this.edgeEnabled ? this.edgeProxy : false;
  }

  set edge(value: boolean | UICardEdgeOptions) {
    const enabled = value !== false;
    const options = value && value !== true ? value : {};
    const next = {
      translateFromSurface: options.translateFromSurface ?? false,
    };
    this.validateEdge(enabled, this.xb?.manipulation);
    this.edgeEnabled = enabled;
    this.edgeTarget.translateFromSurface = next.translateFromSurface;
    this.markUIDirty();
  }

  get orbiter(): false | Readonly<UICardOrbiterOptions> {
    return this.orbiterOptions ?? false;
  }

  set orbiter(value: boolean | UICardOrbiterOptions) {
    this.orbiterOptions = normalizeOrbiter(value);
    if (!this.orbiterOptions) this.minimizedState = false;
    this.markUIDirty();
  }

  /**
   * Whether the card is collapsed to its orbiter. A minimized card hides its
   * surface, content, and edge, which stop taking hits, while the orbiter
   * stays in place and restores the card from its restore button or body.
   * Set it to minimize or restore the card; minimizing requires an orbiter,
   * and removing the orbiter restores the card.
   */
  get minimized(): boolean {
    return this.minimizedState;
  }

  set minimized(value: boolean) {
    if (typeof value !== 'boolean') {
      throw new Error('UICard minimized must be a boolean.');
    }
    if (value && !this.orbiterOptions) {
      throw new Error('UICard minimized requires an orbiter.');
    }
    if (value === this.minimizedState) return;
    this.minimizedState = value;
    this.markUIDirty();
  }

  private validateEdge(
    enabled = this.edgeEnabled,
    manipulation: boolean | ManipulationOptions | undefined = this.xb
      ?.manipulation
  ): void {
    if (!enabled) return;
    const config = normalizeManipulationConfig(manipulation);
    if (!config?.translate && !config?.resize) {
      throw new Error('UICard edge requires Translate or Resize manipulation.');
    }
  }
}

export function getUICardEdgeOptions(
  card: UICard
): Readonly<Required<UICardEdgeOptions>> | undefined {
  return card.edge || undefined;
}

export function getUICardOrbiterOptions(
  card: UICard
): Readonly<UICardOrbiterOptions> | undefined {
  return card.orbiter || undefined;
}

const resizingCards = new WeakSet<UICard>();

/** Records whether a Resize manipulation is holding one of the card's corners. */
export function setUICardResizing(card: UICard, resizing: boolean): void {
  if (resizing) resizingCards.add(card);
  else resizingCards.delete(card);
}

/** Returns whether a Resize manipulation is holding one of the card's corners. */
export function isUICardResizing(card: UICard): boolean {
  return resizingCards.has(card);
}

const resolvedSizes = new WeakMap<UICard, UIResolvedSize>();

/** Returns the current physical card size after layout resolves. */
export function getResolvedUICardSize(
  card: UICard
): Readonly<UIResolvedSize> | undefined {
  if (card.size.width !== 'auto' && card.size.height !== 'auto') {
    return {width: card.size.width, height: card.size.height};
  }
  return resolvedSizes.get(card);
}

/** Stores a backend-calculated physical size for an automatically sized card. */
export function setResolvedUICardSize(
  card: UICard,
  size: UIResolvedSize
): void {
  if (card.size.width !== 'auto' && card.size.height !== 'auto') return;
  resolvedSizes.set(card, size);
}

/** Backend measurements of a card's content, in meters. */
export interface UICardContentMeasurer {
  /** Height the content needs at `width`. */
  height(width: number): number | undefined;
  /** Narrowest width at which no content overflows. */
  minWidth(): number | undefined;
}

const contentMeasurers = new WeakMap<UICard, UICardContentMeasurer>();

/** Registers the backend that measures a card's content. */
export function setUICardContentMeasurer(
  card: UICard,
  measurer: UICardContentMeasurer | undefined
): void {
  if (measurer) contentMeasurers.set(card, measurer);
  else contentMeasurers.delete(card);
}

/**
 * Returns the height in meters that the card's content needs at `width`, or
 * undefined before the card has a layout.
 */
export function measureUICardContentHeight(
  card: UICard,
  width: number
): number | undefined {
  return contentMeasurers.get(card)?.height(width);
}

/**
 * Returns the narrowest width in meters at which the card's content does not
 * overflow, or undefined before the card has a layout.
 */
export function measureUICardMinContentWidth(card: UICard): number | undefined {
  return contentMeasurers.get(card)?.minWidth();
}

/**
 * Closest and farthest a card moves from the viewer, in meters.
 * Source: https://developer.android.com/design/ui/xr/guides/spatial-ui
 */
const CARD_MIN_DISTANCE = 0.75;
const CARD_MAX_DISTANCE = 5;
/**
 * Face-camera smoothing while moving, high enough that the card keeps facing
 * the viewer instead of turning behind the move.
 * Source: Android XR panel move recordings.
 */
const CARD_FACE_CAMERA_SMOOTHING = 1;

function cardTranslateDefaults(): TranslateOptions {
  return {
    faceCamera: true,
    smoothing: CARD_FACE_CAMERA_SMOOTHING,
    scaleWithDistance: true,
    pushPull: true,
    minDistance: CARD_MIN_DISTANCE,
    maxDistance: CARD_MAX_DISTANCE,
    raySmoothing: true,
  };
}

function cardResizeDefaults(): ResizeOptions {
  return {smoothing: true, overshoot: true};
}

function normalizeCardManipulation(
  value: boolean | ManipulationOptions | undefined
): boolean | ManipulationOptions | undefined {
  if (value === undefined || value === false) return value;
  if (value === true) {
    return {
      actions: {
        translate: cardTranslateDefaults(),
        scale: true,
        resize: cardResizeDefaults(),
      },
      handle: {action: 'translate'},
    };
  }
  const actions = value.actions ? {...value.actions} : undefined;
  if (actions?.translate === true) {
    actions.translate = cardTranslateDefaults();
  } else if (actions?.translate && typeof actions.translate === 'object') {
    actions.translate = {...cardTranslateDefaults(), ...actions.translate};
  }
  if (actions?.rotate && typeof actions.rotate === 'object') {
    actions.rotate = {
      ...actions.rotate,
      axis:
        actions.rotate.axis && typeof actions.rotate.axis === 'object'
          ? {...actions.rotate.axis}
          : actions.rotate.axis,
    };
  }
  if (actions?.scale && typeof actions.scale === 'object') {
    actions.scale = {
      ...actions.scale,
      minScale:
        actions.scale.minScale && typeof actions.scale.minScale === 'object'
          ? {...actions.scale.minScale}
          : actions.scale.minScale,
      maxScale:
        actions.scale.maxScale && typeof actions.scale.maxScale === 'object'
          ? {...actions.scale.maxScale}
          : actions.scale.maxScale,
    };
  }
  if (actions?.resize === true) {
    actions.resize = cardResizeDefaults();
  } else if (actions?.resize && typeof actions.resize === 'object') {
    actions.resize = {
      ...cardResizeDefaults(),
      ...actions.resize,
      minSize: actions.resize.minSize ? {...actions.resize.minSize} : undefined,
      maxSize: actions.resize.maxSize ? {...actions.resize.maxSize} : undefined,
    };
  }
  return {
    ...value,
    actions,
    handle: value.handle ? {...value.handle} : undefined,
  };
}

function normalizeOrbiter(
  value: boolean | UICardOrbiterOptions
): Readonly<UICardOrbiterOptions> | undefined {
  if (value === false) return undefined;
  if (value === true) return Object.freeze({});
  if (!value || typeof value !== 'object') {
    throw new Error('UICard orbiter must be a boolean or an options object.');
  }
  const {icon, onIcon, onMinimize, onClose} = value;
  if (icon !== undefined && (typeof icon !== 'string' || !icon)) {
    throw new Error('UICard orbiter icon must be a non-empty string.');
  }
  for (const handler of [onIcon, onMinimize, onClose]) {
    if (handler !== undefined && typeof handler !== 'function') {
      throw new Error('UICard orbiter handlers must be functions.');
    }
  }
  if (onIcon && icon === undefined) {
    throw new Error('UICard orbiter onIcon requires an icon.');
  }
  return Object.freeze({
    ...(icon === undefined ? {} : {icon}),
    ...(onIcon === undefined ? {} : {onIcon}),
    ...(onMinimize === undefined ? {} : {onMinimize}),
    ...(onClose === undefined ? {} : {onClose}),
  });
}

function normalizeSize(size: Partial<UISize>): UISize {
  if (!size || typeof size !== 'object') {
    throw new Error(
      'UICard size must be an object with optional width and height.'
    );
  }
  const {width = 'auto', height = 'auto'} = size;
  validateDimension(width);
  validateDimension(height);
  return {width, height};
}

function validateFixedSize(value: unknown): asserts value is number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
    throw new Error(
      "UICard size dimensions must be 'auto' or finite, nonnegative numbers."
    );
  }
}

function validateDimension(value: unknown): asserts value is number | 'auto' {
  if (value === 'auto') return;
  validateFixedSize(value);
}

function validatePixelSize(pixelSize: number): void {
  if (!Number.isFinite(pixelSize) || pixelSize <= 0) {
    throw new Error('UICard pixelSize must be positive and finite.');
  }
}

function validateAnchor(
  value: string,
  allowed: readonly string[],
  property: 'anchorX' | 'anchorY'
): void {
  if (!allowed.includes(value)) {
    throw new Error(`UICard ${property} has an invalid value.`);
  }
}
