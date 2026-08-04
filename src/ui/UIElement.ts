import * as THREE from 'three';

import {Script} from '../core/Script';
import type {PointerEvents, ReticleMode} from '../interaction/InteractionTypes';
import {TransformScript} from '../placement/TransformScript';
import {MAX_GRADIENT_STOPS} from './constants/GradientPanelConstants';
import type {GradientPaint, Paint} from './types/ShaderTypes';

export type UIUnit = number | `${number}%` | 'auto';
export type UIColor = Paint;

export interface UIStateStyle {
  backgroundColor?: UIColor;
  color?: THREE.ColorRepresentation;
  opacity?: number;
  borderColor?: Paint;
  borderWidth?: number;
  borderRadius?: number;
}

export interface UIStyle extends UIStateStyle {
  width?: UIUnit;
  height?: UIUnit;
  minWidth?: number;
  minHeight?: number;
  maxWidth?: number;
  maxHeight?: number;
  flexDirection?: 'row' | 'column';
  justifyContent?: 'flex-start' | 'center' | 'flex-end' | 'space-between';
  alignItems?: 'flex-start' | 'center' | 'flex-end' | 'stretch';
  alignSelf?: 'auto' | 'flex-start' | 'center' | 'flex-end' | 'stretch';
  flexGrow?: number;
  flexShrink?: number;
  flexBasis?: number | 'auto';
  positionType?: 'relative' | 'absolute';
  top?: number;
  right?: number;
  bottom?: number;
  left?: number;
  zIndex?: number;
  gap?: number;
  rowGap?: number;
  columnGap?: number;
  padding?: number;
  paddingTop?: number;
  paddingRight?: number;
  paddingBottom?: number;
  paddingLeft?: number;
  margin?: number;
  marginTop?: number;
  marginRight?: number;
  marginBottom?: number;
  marginLeft?: number;
  fontSize?: number;
  fontWeight?: number | 'normal' | 'medium' | 'bold';
  lineHeight?: number;
  textAlign?: 'left' | 'center' | 'right';
  innerShadowColor?: Paint;
  innerShadowBlur?: number;
  dropShadowColor?: Paint;
  dropShadowBlur?: number;
  dropShadowSpread?: number;
  overflow?: 'visible' | 'hidden';
  objectFit?: 'contain' | 'cover' | 'fill';
  whiteSpace?: 'normal' | 'nowrap';
  textOverflow?: 'clip' | 'ellipsis';
  ':hover'?: UIStateStyle;
  ':active'?: UIStateStyle;
  ':disabled'?: UIStateStyle;
}

export interface UIElementOptions {
  style?: UIStyle;
  children?: THREE.Object3D[];
  visible?: boolean;
  pointerEvents?: PointerEvents;
  interactionEnabled?: boolean;
  reticleMode?: ReticleMode;
}

export type UIElementKind =
  | 'card'
  | 'overlay'
  | 'panel'
  | 'text'
  | 'button'
  | 'slider'
  | 'image'
  | 'icon';

interface UIElementState {
  readonly kind: UIElementKind;
  revision: number;
}

const STYLE_KEYS = new Set<keyof UIStyle>([
  'width',
  'height',
  'minWidth',
  'minHeight',
  'maxWidth',
  'maxHeight',
  'flexDirection',
  'justifyContent',
  'alignItems',
  'alignSelf',
  'flexGrow',
  'flexShrink',
  'flexBasis',
  'positionType',
  'top',
  'right',
  'bottom',
  'left',
  'zIndex',
  'gap',
  'rowGap',
  'columnGap',
  'padding',
  'paddingTop',
  'paddingRight',
  'paddingBottom',
  'paddingLeft',
  'margin',
  'marginTop',
  'marginRight',
  'marginBottom',
  'marginLeft',
  'backgroundColor',
  'color',
  'opacity',
  'borderColor',
  'borderWidth',
  'borderRadius',
  'fontSize',
  'fontWeight',
  'lineHeight',
  'textAlign',
  'innerShadowColor',
  'innerShadowBlur',
  'dropShadowColor',
  'dropShadowBlur',
  'dropShadowSpread',
  'overflow',
  'objectFit',
  'whiteSpace',
  'textOverflow',
  ':hover',
  ':active',
  ':disabled',
]);

const STATE_STYLE_KEYS = new Set<keyof UIStateStyle>([
  'backgroundColor',
  'color',
  'opacity',
  'borderColor',
  'borderWidth',
  'borderRadius',
]);

const NUMBER_KEYS = new Set<keyof UIStyle>([
  'minWidth',
  'minHeight',
  'maxWidth',
  'maxHeight',
  'flexGrow',
  'flexShrink',
  'top',
  'right',
  'bottom',
  'left',
  'zIndex',
  'gap',
  'rowGap',
  'columnGap',
  'padding',
  'paddingTop',
  'paddingRight',
  'paddingBottom',
  'paddingLeft',
  'margin',
  'marginTop',
  'marginRight',
  'marginBottom',
  'marginLeft',
  'opacity',
  'borderWidth',
  'borderRadius',
  'fontSize',
  'lineHeight',
  'innerShadowBlur',
  'dropShadowBlur',
  'dropShadowSpread',
]);

const PAINT_KEYS = new Set<keyof UIStyle>([
  'backgroundColor',
  'borderColor',
  'innerShadowColor',
  'dropShadowColor',
]);

const COLOR_KEYS = new Set<keyof UIStyle>(['color']);

const NONNEGATIVE_KEYS = new Set<keyof UIStyle>([
  'width',
  'height',
  'minWidth',
  'minHeight',
  'maxWidth',
  'maxHeight',
  'flexGrow',
  'flexShrink',
  'flexBasis',
  'gap',
  'rowGap',
  'columnGap',
  'padding',
  'paddingTop',
  'paddingRight',
  'paddingBottom',
  'paddingLeft',
  'borderWidth',
  'borderRadius',
  'fontSize',
  'lineHeight',
  'innerShadowBlur',
  'dropShadowBlur',
]);

const ENUM_VALUES: Partial<Record<keyof UIStyle, readonly unknown[]>> = {
  flexDirection: ['row', 'column'],
  justifyContent: ['flex-start', 'center', 'flex-end', 'space-between'],
  alignItems: ['flex-start', 'center', 'flex-end', 'stretch'],
  alignSelf: ['auto', 'flex-start', 'center', 'flex-end', 'stretch'],
  positionType: ['relative', 'absolute'],
  fontWeight: ['normal', 'medium', 'bold'],
  textAlign: ['left', 'center', 'right'],
  overflow: ['visible', 'hidden'],
  objectFit: ['contain', 'cover', 'fill'],
  whiteSpace: ['normal', 'nowrap'],
  textOverflow: ['clip', 'ellipsis'],
};

const states = new WeakMap<UIElement, UIElementState>();
const rootReferences = new Set<WeakRef<UIElement>>();

export abstract class UIElement extends Script {
  readonly isUI = true;
  private readonly styleTarget: UIStyle = {};
  private readonly styleProxy: UIStyle;

  protected constructor(kind: UIElementKind, options: UIElementOptions = {}) {
    super();
    states.set(this, {kind, revision: 0});
    this.addEventListener('added', this.assertPlacement);
    this.addEventListener('childadded', this.markUIStructureDirty);
    this.addEventListener('childremoved', this.markUIStructureDirty);
    if (isUIRootKind(kind)) rootReferences.add(new WeakRef(this));
    this.styleProxy = createStyleProxy(
      this.styleTarget,
      false,
      this.markUIStyleDirty
    );
    this.style = options.style ?? {};
    this.visible = options.visible ?? true;
    this.xb = {
      pointerEvents: options.pointerEvents ?? 'auto',
      interactionEnabled: options.interactionEnabled ?? true,
    };
    if (options.reticleMode !== undefined) {
      this.xb.reticleMode = options.reticleMode;
    }
    if (options.children) this.add(...options.children);
  }

  override add(...objects: THREE.Object3D[]): this {
    for (const object of objects) validateUIChild(this, object);
    for (const object of objects) super.add(object);
    return this;
  }

  override attach(object: THREE.Object3D): this {
    validateUIChild(this, object);
    return super.attach(object);
  }

  get style(): UIStyle {
    return this.styleProxy;
  }

  set style(style: UIStyle) {
    const entries = Object.entries(cloneUIStyle(style));
    for (const key of Object.keys(this.styleTarget) as (keyof UIStyle)[]) {
      Reflect.deleteProperty(this.styleProxy, key);
    }
    for (const [key, value] of entries) {
      Reflect.set(this.styleProxy, key, value);
    }
  }

  protected markUIDirty = (): void => {
    const state = states.get(this);
    if (state) state.revision++;
  };

  protected markUIStructureDirty = (): void => {
    markRootDirty(findUIRoot(this));
  };

  private markUIStyleDirty = (property: string): void => {
    this.markUIDirty();
    if (property === 'backgroundColor' || property === 'zIndex') {
      this.markUIStructureDirty();
    }
  };

  private assertPlacement = (): void => {
    const parent = this.parent;
    if (!parent) return;
    const isRoot = isUIRootKind(getUIElementKind(this));
    if (isRoot && isUIElement(parent)) {
      this.removeFromParent();
      throw new Error('Nested UICard and UIOverlay roots are not allowed.');
    }
    if (!isRoot && !isUIElement(parent)) {
      this.removeFromParent();
      throw new Error(
        'Every UI element must be below one UICard or UIOverlay root.'
      );
    }
  };
}

export function isUIElement(object: THREE.Object3D): object is UIElement {
  return states.has(object as UIElement);
}

export function getUIElementKind(element: UIElement): UIElementKind {
  return states.get(element)!.kind;
}

export function getUIRevision(element: UIElement): number {
  return states.get(element)!.revision;
}

/** Collects public UI roots without retaining their application lifetime. */
export function collectUIRoots(target: UIElement[]): void {
  target.length = 0;
  for (const reference of rootReferences) {
    const root = reference.deref();
    if (root) target.push(root);
    else rootReferences.delete(reference);
  }
}

/** Invalidates one public wrapper after private asynchronous resource work. */
export function invalidateUIElement(element: UIElement): void {
  const state = states.get(element);
  if (state) state.revision++;
}

/** Validates and detaches a style from caller-owned mutable values. */
export function cloneUIStyle(style: UIStyle): UIStyle {
  if (!style || typeof style !== 'object' || Array.isArray(style)) {
    throw new Error('UI style must be an object.');
  }
  for (const [key, value] of Object.entries(style)) {
    validateStyle(key, value, false);
  }
  return Object.fromEntries(
    Object.entries(style).map(([key, value]) => [key, cloneStyleValue(value)])
  ) as UIStyle;
}

function createStyleProxy<T extends UIStyle | UIStateStyle>(
  target: T,
  stateOnly: boolean,
  onChange: (property: string) => void
): T {
  return new Proxy(target, {
    set(object, property, value) {
      if (typeof property !== 'string') return false;
      validateStyle(property, value, stateOnly);
      if (value === undefined) {
        if (!Reflect.has(object, property)) return true;
        Reflect.deleteProperty(object, property);
        onChange(property);
        return true;
      }
      const next =
        isStateStyleKey(property) && value && typeof value === 'object'
          ? createStyleProxy(
              cloneStyleValue(value) as UIStateStyle,
              true,
              onChange
            )
          : value;
      if (Reflect.get(object, property) === next) return true;
      Reflect.set(object, property, next);
      onChange(property);
      return true;
    },
    deleteProperty(object, property) {
      if (!Reflect.has(object, property)) return true;
      Reflect.deleteProperty(object, property);
      if (typeof property === 'string') onChange(property);
      return true;
    },
  });
}

function validateUIChild(parent: UIElement, child: THREE.Object3D): void {
  if (child === parent) {
    throw new Error('A UI element cannot be added to itself.');
  }
  if (isUIElement(child)) {
    if (isUIRootKind(getUIElementKind(child))) {
      throw new Error('Nested UICard and UIOverlay roots are not allowed.');
    }
    return;
  }
  if (getUIElementKind(parent) === 'card' && child instanceof TransformScript) {
    return;
  }
  throw new Error(
    'UI elements accept UI children. UICard also accepts TransformScript children.'
  );
}

function findUIRoot(object: THREE.Object3D): UIElement | undefined {
  let current: THREE.Object3D | null = object;
  while (current) {
    if (isUIElement(current) && isUIRootKind(getUIElementKind(current))) {
      return current;
    }
    current = current.parent;
  }
  return undefined;
}

function markRootDirty(root: UIElement | undefined): void {
  if (!root) return;
  states.get(root)!.revision++;
}

function isUIRootKind(kind: UIElementKind): boolean {
  return kind === 'card' || kind === 'overlay';
}

function validateStyle(
  property: string,
  value: unknown,
  stateOnly: boolean
): void {
  const valid = stateOnly ? STATE_STYLE_KEYS : STYLE_KEYS;
  if (!valid.has(property as never)) {
    throw new Error(`Unknown UI style property "${property}".`);
  }
  if (value === undefined) return;
  if (stateOnly && !STATE_STYLE_KEYS.has(property as keyof UIStateStyle)) {
    throw new Error(`UI state styles cannot change "${property}".`);
  }
  if (isStateStyleKey(property)) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      throw new Error(`UI style "${property}" must be an object.`);
    }
    for (const [key, nested] of Object.entries(value)) {
      validateStyle(key, nested, true);
    }
    return;
  }
  if (
    NUMBER_KEYS.has(property as keyof UIStyle) &&
    (typeof value !== 'number' || !Number.isFinite(value))
  ) {
    throw new Error(`UI style "${property}" must be a finite number.`);
  }
  if (PAINT_KEYS.has(property as keyof UIStyle) && !isPaint(value)) {
    throw new Error(`UI style "${property}" must be a valid paint.`);
  }
  if (COLOR_KEYS.has(property as keyof UIStyle)) {
    if (!isSolidColor(value) || value === 'transparent') {
      throw new Error(`UI style "${property}" must be a valid color.`);
    }
  }
  if (property === 'flexBasis' && value !== 'auto') {
    if (typeof value !== 'number' || !Number.isFinite(value)) {
      throw new Error('UI style "flexBasis" must be finite or "auto".');
    }
  }
  if (property === 'fontWeight' && typeof value === 'number') {
    if (!Number.isFinite(value) || value <= 0) {
      throw new Error('UI style "fontWeight" must be positive and finite.');
    }
  }
  const enumValues = ENUM_VALUES[property as keyof UIStyle];
  if (
    enumValues &&
    !(property === 'fontWeight' && typeof value === 'number') &&
    !enumValues.includes(value)
  ) {
    throw new Error(`Invalid value for UI style "${property}".`);
  }
  if ((property === 'width' || property === 'height') && !isUIUnit(value)) {
    throw new Error(
      `UI style "${property}" must be a finite number, percentage, or "auto".`
    );
  }
  if (
    NONNEGATIVE_KEYS.has(property as keyof UIStyle) &&
    typeof value === 'number' &&
    value < 0
  ) {
    throw new Error(`UI style "${property}" cannot be negative.`);
  }
  if (
    (property === 'width' || property === 'height') &&
    typeof value === 'string' &&
    value.startsWith('-')
  ) {
    throw new Error(`UI style "${property}" cannot be negative.`);
  }
  if (
    property === 'opacity' &&
    typeof value === 'number' &&
    (value < 0 || value > 1)
  ) {
    throw new Error('UI style "opacity" must be between 0 and 1.');
  }
}

function isStateStyleKey(
  property: string
): property is ':hover' | ':active' | ':disabled' {
  return (
    property === ':hover' || property === ':active' || property === ':disabled'
  );
}

function isUIUnit(value: unknown): value is UIUnit {
  return (
    (typeof value === 'number' && Number.isFinite(value)) ||
    value === 'auto' ||
    (typeof value === 'string' && /^-?\d+(?:\.\d+)?%$/.test(value))
  );
}

function isPaint(value: unknown): value is Paint {
  if (isSolidColor(value)) return true;
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;

  const gradient = value as Partial<GradientPaint>;
  if (
    !['linear', 'radial', 'angular', 'diamond'].includes(
      gradient.gradientType ?? ''
    ) ||
    !Array.isArray(gradient.stops) ||
    gradient.stops.length < 2 ||
    gradient.stops.length > MAX_GRADIENT_STOPS ||
    (gradient.rotation !== undefined &&
      (!Number.isFinite(gradient.rotation) ||
        typeof gradient.rotation !== 'number')) ||
    !isVector2Like(gradient.center) ||
    !isVector2Like(gradient.scale)
  ) {
    return false;
  }

  let previousPosition = -Infinity;
  return gradient.stops.every((stop) => {
    const valid =
      !!stop &&
      typeof stop === 'object' &&
      typeof stop.position === 'number' &&
      Number.isFinite(stop.position) &&
      stop.position >= 0 &&
      stop.position <= 1 &&
      stop.position >= previousPosition &&
      isSolidColor(stop.color);
    previousPosition = stop?.position ?? previousPosition;
    return valid;
  });
}

function isSolidColor(value: unknown): value is THREE.ColorRepresentation {
  return (
    value instanceof THREE.Color ||
    (typeof value === 'number' && Number.isFinite(value)) ||
    (typeof value === 'string' && value.trim().length > 0)
  );
}

function isVector2Like(value: unknown): boolean {
  if (value === undefined || value instanceof THREE.Vector2) return true;
  return (
    Array.isArray(value) &&
    value.length === 2 &&
    value.every((component) =>
      typeof component === 'number' ? Number.isFinite(component) : false
    )
  );
}

function cloneStyleValue(value: unknown): unknown {
  if (value instanceof THREE.Color) return value.clone();
  if (value instanceof THREE.Vector2) return value.clone();
  if (Array.isArray(value)) return value.map(cloneStyleValue);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(
    Object.entries(value).map(([key, nested]) => [key, cloneStyleValue(nested)])
  );
}
