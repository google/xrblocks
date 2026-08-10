import type {ManipulationOptions} from '../../interaction/manipulation/ManipulationTypes';
import {normalizeManipulationConfig} from '../../interaction/manipulation/ManipulationConfig';
import {type UIAppearance, validateUIAppearance} from '../UIAppearance';
import {UIElement, type UIElementOptions} from '../UIElement';

export interface UISize {
  width: number;
  height: number;
}

export interface UICardEdgeOptions {
  translateFromSurface?: boolean;
}

export type UICardAnchorX = 'left' | 'center' | 'right';
export type UICardAnchorY = 'bottom' | 'center' | 'top';

export interface UICardOptions extends UIElementOptions {
  size: UISize;
  pixelSize?: number;
  anchorX?: UICardAnchorX;
  anchorY?: UICardAnchorY;
  appearance?: UIAppearance;
  manipulation?: boolean | ManipulationOptions;
  edge?: boolean | UICardEdgeOptions;
}

/** The only world-transform root in a spatial UI tree. */
export class UICard extends UIElement {
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

  constructor({
    size,
    pixelSize = 0.001,
    anchorX = 'center',
    anchorY = 'center',
    appearance = 'surface',
    manipulation,
    edge = false,
    ...options
  }: UICardOptions) {
    validateSize(size);
    validatePixelSize(pixelSize);
    validateAnchor(anchorX, ['left', 'center', 'right'], 'anchorX');
    validateAnchor(anchorY, ['bottom', 'center', 'top'], 'anchorY');
    validateUIAppearance(appearance);
    super('card', options);
    this.pixelSize = pixelSize;
    this.anchorX = anchorX;
    this.anchorY = anchorY;
    this.appearance = appearance;
    this.sizeTarget = {...size};
    this.sizeProxy = new Proxy(this.sizeTarget, {
      set: (target, property, value) => {
        if (
          (property !== 'width' && property !== 'height') ||
          typeof value !== 'number' ||
          !Number.isFinite(value) ||
          value < 0
        ) {
          throw new Error('UICard size values must be finite and nonnegative.');
        }
        Reflect.set(target, property, value);
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
  }

  get size(): UISize {
    return this.sizeProxy;
  }

  set size(value: UISize) {
    validateSize(value);
    this.sizeProxy.width = value.width;
    this.sizeProxy.height = value.height;
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

  private validateEdge(
    enabled = this.edgeEnabled,
    manipulation: boolean | ManipulationOptions | undefined = this.xb
      ?.manipulation
  ): void {
    if (!enabled) return;
    const config = normalizeManipulationConfig(manipulation);
    if (!config?.translate) {
      throw new Error('UICard edge requires Translate manipulation.');
    }
  }
}

export function getUICardEdgeOptions(
  card: UICard
): Readonly<Required<UICardEdgeOptions>> | undefined {
  return card.edge || undefined;
}

function normalizeCardManipulation(
  value: boolean | ManipulationOptions | undefined
): boolean | ManipulationOptions | undefined {
  if (value === undefined || value === false) return value;
  if (value === true) {
    return {
      actions: {
        translate: {faceCamera: true},
        scale: true,
      },
      handle: {action: 'translate'},
    };
  }
  const actions = value.actions ? {...value.actions} : undefined;
  if (actions?.translate === true) {
    actions.translate = {faceCamera: true};
  } else if (actions?.translate && typeof actions.translate === 'object') {
    actions.translate = {
      ...actions.translate,
      faceCamera: actions.translate.faceCamera ?? true,
    };
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
  return {
    ...value,
    actions,
    handle: value.handle ? {...value.handle} : undefined,
  };
}

function validateSize(size: UISize): void {
  if (
    !size ||
    !Number.isFinite(size.width) ||
    !Number.isFinite(size.height) ||
    size.width < 0 ||
    size.height < 0
  ) {
    throw new Error('UICard size values must be finite and nonnegative.');
  }
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
