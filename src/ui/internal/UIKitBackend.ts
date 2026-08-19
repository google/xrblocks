import {
  Component,
  Container,
  Image,
  type ImageOutProperties,
  Svg,
  Text,
  reversePainterSortStable,
} from '@pmndrs/uikit';
import * as THREE from 'three';

import {getSemanticControl} from '../../interaction/SemanticControl';
import {UIButton} from '../components/UIButton';
import {UICard, getUICardEdgeOptions} from '../components/UICard';
import {UIIcon} from '../components/UIIcon';
import {UIImage} from '../components/UIImage';
import {UIOverlay} from '../components/UIOverlay';
import {UISlider} from '../components/UISlider';
import {UIText} from '../components/UIText';
import {DEFAULT_GRADIENT_PANEL_PROPS} from '../constants/GradientPanelConstants';
import {
  getUIElementKind,
  getUIRevision,
  getUIStructureRevision,
  isUIElement,
  registerUIPresentationObject,
  type UIElement,
  type UIStyle,
} from '../UIElement';
import type {UITheme} from '../UITheme';
import type {UIValidationBounds, UIValidationIssue} from '../UIValidation';
import {GradientPanel} from '../primitives/GradientPanel';
import {UICardEdge} from './UICardEdge';
import {AdaptiveText, type AdaptiveTextProperties} from './AdaptiveText';
import type {
  UIBackend,
  UIHitMapping,
  UIMount,
  UIPresentationState,
  UIPresentationStateFor,
} from './UIBackend';

const ICON_BASE =
  'https://cdn.jsdelivr.net/gh/marella/material-symbols@v0.33.0/svg/';
const OVERLAY_RENDER_ORDER_BASE = 1_000_000_000;
const OVERLAY_Z_INDEX_STEP = 100_000_000;
const OVERLAY_ROOT_ORDER_STEP = 1_000_000;
const imageTextureLoader = new THREE.TextureLoader();

class UIKitMount implements UIMount {
  object: THREE.Object3D = new THREE.Group();
  private rendered?: Container;
  private binding?: UIKitNodeBinding;
  private readonly readyWork: Array<() => void> = [];
  private structureRevision = -1;
  private hitMappingsChanged = true;
  private disposed = false;
  private viewportWidth = -1;
  private viewportHeight = -1;
  private readonly isOverlay: boolean;

  constructor(
    private readonly root: UIElement,
    private readonly icons: IconCache
  ) {
    this.object.name = `Private ${root.name}`;
    this.isOverlay = getUIElementKind(root) === 'overlay';
  }

  commit(
    theme: UITheme,
    viewport: {width: number; height: number},
    rootOrder: number
  ): readonly UIHitMapping[] | undefined {
    if (this.disposed) return undefined;
    for (const work of this.readyWork.splice(0)) work();

    const rootStack = this.isOverlay
      ? OVERLAY_RENDER_ORDER_BASE +
        Number(this.root.style.zIndex ?? 0) * OVERLAY_Z_INDEX_STEP +
        rootOrder * OVERLAY_ROOT_ORDER_STEP
      : undefined;
    const context: CommitContext = {
      theme,
      rootStack,
      sequence: {value: 0},
    };
    if (!this.binding) {
      this.binding = new UIKitNodeBinding(
        this.root,
        this.icons,
        this.enqueue,
        context
      );
      this.rendered = this.isOverlay
        ? createOverlayViewport(this.binding.node as Container, viewport)
        : (this.binding.node as Container);
      this.viewportWidth = viewport.width;
      this.viewportHeight = viewport.height;
      this.structureRevision = getUIStructureRevision(this.root);
      this.object.add(this.rendered);
      this.hitMappingsChanged = true;
    }

    if (this.structureRevision !== getUIStructureRevision(this.root)) {
      this.structureRevision = getUIStructureRevision(this.root);
      this.binding.reconcileTree(context);
      this.hitMappingsChanged = true;
    }
    if (this.isOverlay) this.updateViewport(viewport);
    if (this.binding.commit(context)) this.hitMappingsChanged = true;

    if (!this.hitMappingsChanged) return undefined;
    this.hitMappingsChanged = false;
    return this.binding.hitMappings();
  }

  present(stateFor: UIPresentationStateFor): void {
    this.binding?.present(stateFor);
  }

  update(deltaSeconds: number): void {
    this.rendered?.update(deltaSeconds * 1000);
  }

  validate(): readonly UIValidationIssue[] {
    const issues: UIValidationIssue[] = [];
    for (const [element, node] of this.binding?.elementNodes() ?? []) {
      const size = node.size.peek();
      const center = node.relativeCenter.peek();
      if (
        !validPair(size) ||
        (node.parentContainer.peek() && !validPair(center))
      ) {
        issues.push({
          code: 'invalid-layout',
          severity: 'error',
          element,
          message: `${element.name} does not have a finite calculated layout.`,
        });
        continue;
      }
      if (element instanceof UIText && node.isClipped.peek()) {
        issues.push({
          code: 'text-clipped',
          severity: 'error',
          element,
          message: `${element.name} is clipped by its layout container.`,
        });
      }
      const parent = node.parentContainer.peek();
      const parentSize = parent?.size.peek();
      if (!parent || !validPair(parentSize) || !center) continue;
      const bounds = boundsFromCenter(center, size);
      const containerBounds = contentBounds(parent);
      if (containsBounds(containerBounds, bounds)) continue;
      const overlayRoot = element === this.root && this.isOverlay;
      issues.push({
        code: overlayRoot ? 'outside-viewport' : 'content-overflow',
        severity: overlayRoot ? 'error' : 'warning',
        element,
        message: overlayRoot
          ? `${element.name} extends outside the overlay viewport.`
          : `${element.name} extends outside its layout container.`,
        bounds,
        containerBounds,
      });
    }
    return issues;
  }

  dispose(): void {
    this.disposed = true;
    this.readyWork.length = 0;
    const binding = this.binding;
    const rendered = this.rendered;
    binding?.dispose();
    if (rendered && rendered !== binding?.node) {
      rendered.removeFromParent();
      rendered.dispose();
    }
    this.binding = undefined;
    this.rendered = undefined;
    this.object.clear();
  }

  private enqueue = (work: () => void): void => {
    if (!this.disposed) this.readyWork.push(work);
  };

  private updateViewport(viewport: {width: number; height: number}): void {
    const wrapper = this.rendered;
    if (
      !wrapper ||
      (this.viewportWidth === viewport.width &&
        this.viewportHeight === viewport.height)
    )
      return;
    this.viewportWidth = viewport.width;
    this.viewportHeight = viewport.height;
    wrapper.setProperties({
      width: viewport.width,
      height: viewport.height,
      sizeX: viewport.width,
      sizeY: viewport.height,
    });
  }
}

class UIKitBackend implements UIBackend {
  private readonly icons = new IconCache();
  private renderer?: THREE.WebGLRenderer;
  private previousLocalClippingEnabled = false;

  configureRenderer(renderer: THREE.WebGLRenderer): void {
    if (this.renderer === renderer) return;
    this.restoreRenderer();
    this.renderer = renderer;
    this.previousLocalClippingEnabled = renderer.localClippingEnabled;
    renderer.localClippingEnabled = true;
    renderer.setTransparentSort(reversePainterSortStable);
  }

  createMount(root: UIElement): UIMount {
    return new UIKitMount(root, this.icons);
  }

  dispose(): void {
    this.restoreRenderer();
    this.icons.dispose();
  }

  private restoreRenderer(): void {
    if (!this.renderer) return;
    this.renderer.localClippingEnabled = this.previousLocalClippingEnabled;
    this.renderer = undefined;
  }
}

export function createUIBackend(): UIBackend {
  return new UIKitBackend();
}

interface CommitContext {
  readonly theme: UITheme;
  readonly rootStack: number | undefined;
  readonly sequence: {value: number};
}

type UIKitNode =
  | Container
  | Image<ImageOutProperties<unknown>>
  | Svg
  | AdaptiveText
  | GradientPanel;

/** A retained physical node and the small private subtree it owns. */
class UIKitNodeBinding {
  readonly node: UIKitNode;
  private readonly unregisterPresentationObject: () => void;
  private readonly children = new Map<UIElement, UIKitNodeBinding>();
  private readonly childOrder: UIElement[] = [];
  private readonly cursorPoints = [
    new THREE.Vector3(),
    new THREE.Vector3(),
  ] as const;
  private readonly notifyResource = () => {
    if (!this.disposed) this.enqueue(() => this.resourceRevision++);
  };
  private edge?: UICardEdge;
  private buttonIcon?: Svg;
  private buttonLabel?: Text;
  private sliderContent?: SliderContent;
  private imageTexture?: THREE.Texture;
  private ownsImageTexture = false;
  private imageSource?: string | THREE.Texture;
  private imageRequest = 0;
  private resourceRevision = 0;
  private appliedResourceRevision = -1;
  private revision = -1;
  private presentationKey = -1;
  private pointerEvents?: string;
  private hitEnabled?: boolean;
  private theme?: UITheme;
  private baseProperties: Record<string, unknown> = {};
  private presentedProperties: Record<string, unknown> = {};
  private renderOrder?: number;
  private disposed = false;

  constructor(
    readonly element: UIElement,
    private readonly icons: IconCache,
    private readonly enqueue: (work: () => void) => void,
    context: CommitContext
  ) {
    const properties = this.propertiesFor(
      context,
      baseState(element),
      undefined
    );
    const kind = getUIElementKind(element);
    if (kind === 'text') {
      this.node = new AdaptiveText(properties as AdaptiveTextProperties);
    } else if (kind === 'image') {
      this.node = new Image<ImageOutProperties<unknown>>(
        properties,
        undefined,
        {loadTexture: false}
      );
    } else if (kind === 'icon') {
      this.node = new Svg(properties);
    } else {
      this.node = new GradientPanel(properties);
    }
    this.unregisterPresentationObject = registerUIPresentationObject(
      this.element,
      this.node
    );
    this.baseProperties = properties;
    this.presentedProperties = properties;
    this.theme = context.theme;
    this.reconcileTree(context);
    this.commit(context);
  }

  reconcileTree(context: CommitContext): void {
    if (!isContainerNode(this.node)) return;
    const nextOrder = this.element.children.filter(isUIElement);
    const next = new Map<UIElement, UIKitNodeBinding>();
    for (const child of nextOrder) {
      const binding =
        this.children.get(child) ??
        new UIKitNodeBinding(child, this.icons, this.enqueue, context);
      next.set(child, binding);
    }
    for (const [element, binding] of this.children) {
      if (!next.has(element)) binding.dispose();
    }
    this.children.clear();
    this.childOrder.length = 0;
    for (const child of nextOrder) {
      const binding = next.get(child)!;
      this.children.set(child, binding);
      this.childOrder.push(child);
      this.node.add(binding.node);
      binding.reconcileTree(context);
    }
    this.ensurePrivateNodes(context.theme);
    if (this.edge) {
      this.edge.removeFromParent();
      this.node.add(this.edge);
    }
  }

  /** Returns true when physical hit mappings changed. */
  commit(context: CommitContext): boolean {
    if (this.disposed) return false;
    const order =
      context.rootStack === undefined
        ? undefined
        : context.rootStack +
          Number(this.element.style.zIndex ?? 0) * 1_000 +
          context.sequence.value++;
    const orderChanged = order !== this.renderOrder;
    const revision = getUIRevision(this.element);
    const nextPointerEvents = this.element.xb?.pointerEvents;
    const needsProperties =
      revision !== this.revision ||
      context.theme !== this.theme ||
      orderChanged ||
      nextPointerEvents !== this.pointerEvents ||
      this.resourceRevision !== this.appliedResourceRevision;
    let hitMappingsChanged = orderChanged;
    if (needsProperties) {
      this.renderOrder = order;
      const properties = this.propertiesFor(
        context,
        baseState(this.element),
        order
      );
      this.applyProperties(properties);
      this.baseProperties = properties;
      this.presentedProperties = properties;
      this.presentationKey = -1;
      this.revision = revision;
      this.theme = context.theme;
      this.appliedResourceRevision = this.resourceRevision;
      this.ensurePrivateNodes(context.theme);
      hitMappingsChanged = this.syncEdge(properties);
    }
    this.node.visible = this.element.visible;
    this.syncImage();
    this.setHitEnabled(this.baseProperties);
    for (const child of this.childOrder) {
      if (this.children.get(child)!.commit(context)) hitMappingsChanged = true;
    }
    return hitMappingsChanged;
  }

  present(stateFor: UIPresentationStateFor): void {
    if (this.disposed) return;
    const state = stateFor(
      this.element,
      this.edge ? this.cursorPoints : undefined
    );
    const key = stateKey(state);
    if (key !== this.presentationKey) {
      const context: CommitContext = {
        theme: this.theme!,
        rootStack: undefined,
        sequence: {value: 0},
      };
      const properties = this.propertiesFor(context, state, this.renderOrder);
      this.applyProperties(properties);
      this.presentedProperties = properties;
      this.presentationKey = key;
      this.ensurePrivateNodes(this.theme!);
    }
    this.edge?.setCursorPoints(
      state.cursorPointCount > 0 ? this.cursorPoints[0] : undefined,
      state.cursorPointCount > 1 ? this.cursorPoints[1] : undefined
    );
    for (const child of this.childOrder)
      this.children.get(child)!.present(stateFor);
  }

  hitMappings(): UIHitMapping[] {
    const mappings: UIHitMapping[] = [
      {physical: this.node, logical: this.element},
    ];
    if (this.edge) mappings.push({physical: this.edge, logical: this.element});
    for (const child of this.childOrder) {
      mappings.push(...this.children.get(child)!.hitMappings());
    }
    return mappings;
  }

  *elementNodes(): IterableIterator<[UIElement, UIKitNode]> {
    yield [this.element, this.node];
    for (const child of this.childOrder)
      yield* this.children.get(child)!.elementNodes();
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.unregisterPresentationObject();
    for (const child of this.children.values()) child.dispose();
    this.children.clear();
    this.childOrder.length = 0;
    this.edge?.removeFromParent();
    this.edge?.dispose();
    this.buttonIcon?.removeFromParent();
    this.buttonIcon?.dispose();
    this.buttonLabel?.removeFromParent();
    this.buttonLabel?.dispose();
    this.sliderContent?.dispose();
    if (this.ownsImageTexture) this.imageTexture?.dispose();
    this.imageTexture = undefined;
    this.node.removeFromParent();
    this.node.dispose();
  }

  private propertiesFor(
    context: CommitContext,
    state: UIPresentationState,
    renderOrder: number | undefined
  ): Record<string, unknown> {
    const style = toUIKitStyle(
      resolveStyle(this.element, state, context.theme)
    );
    if (renderOrder !== undefined) {
      style.depthTest = false;
      style.depthWrite = false;
      style.renderOrder = renderOrder;
    }
    const kind = getUIElementKind(this.element);
    if (kind === 'text') {
      return {
        text: (this.element as UIText).text,
        color:
          (style.color as THREE.ColorRepresentation | undefined) ??
          context.theme.colors.text,
        ...style,
        pointerEvents: this.element.xb?.pointerEvents ?? 'auto',
      };
    }
    if (kind === 'image') {
      const {cornerRadius: rawCornerRadius, ...imageStyle} = style;
      const cornerRadius = numericCornerRadius(rawCornerRadius);
      return {
        ...imageStyle,
        borderTopLeftRadius: cornerRadius,
        borderTopRightRadius: cornerRadius,
        borderBottomLeftRadius: cornerRadius,
        borderBottomRightRadius: cornerRadius,
        pointerEvents: this.element.xb?.pointerEvents ?? 'auto',
      };
    }
    if (kind === 'icon') {
      return {
        content: this.icons.get(
          iconAssetPath(this.element as UIIcon),
          this.notifyResource
        ),
        ...style,
        pointerEvents: this.element.xb?.pointerEvents ?? 'auto',
      };
    }
    return panelDefaults(this.element, context.theme, style);
  }

  private applyProperties(properties: Record<string, unknown>): void {
    const changed = changedProperties(this.presentedProperties, properties);
    if (Object.keys(changed).length === 0) return;
    if (this.node instanceof AdaptiveText) {
      this.node.updateTextProperties(properties as AdaptiveTextProperties);
    } else {
      this.node.setProperties(changed);
    }
    if (this.node instanceof Image) {
      this.node.material.opacity = resolvedOpacity(properties.opacity);
    }
    if (this.renderOrder !== undefined)
      this.node.renderOrder = this.renderOrder;
  }

  private ensurePrivateNodes(theme: UITheme): void {
    if (!(this.node instanceof GradientPanel)) return;
    const kind = getUIElementKind(this.element);
    if (kind === 'button') this.updateButtonContent(theme);
    if (kind === 'slider') {
      this.sliderContent ??= createSliderContent(this.node);
      this.sliderContent.update(this.element as UISlider, theme);
    }
  }

  private updateButtonContent(theme: UITheme): void {
    const button = this.element as UIButton;
    const color =
      (this.presentedProperties.color as
        | THREE.ColorRepresentation
        | undefined) ??
      (button.disabled ? theme.colors.disabledText : theme.colors.primaryText);
    if (button.icon) {
      const properties = {
        content: this.icons.get(
          defaultIconAssetPath(button.icon),
          this.notifyResource
        ),
        width: 24,
        height: 24,
        color,
        pointerEvents: 'none' as const,
      };
      if (!this.buttonIcon) {
        this.buttonIcon = new Svg(properties);
        this.node.add(this.buttonIcon);
      } else {
        this.buttonIcon.setProperties(properties);
      }
    } else if (this.buttonIcon) {
      this.buttonIcon.removeFromParent();
      this.buttonIcon.dispose();
      this.buttonIcon = undefined;
    }
    if (button.label) {
      const properties = {
        text: button.label,
        color,
        pointerEvents: 'none' as const,
      };
      if (!this.buttonLabel) {
        this.buttonLabel = new Text(properties);
        this.node.add(this.buttonLabel);
      } else {
        this.buttonLabel.setProperties(properties);
      }
    } else if (this.buttonLabel) {
      this.buttonLabel.removeFromParent();
      this.buttonLabel.dispose();
      this.buttonLabel = undefined;
    }
  }

  private syncEdge(properties: Record<string, unknown>): boolean {
    if (!(this.node instanceof GradientPanel)) return false;
    const options =
      getUIElementKind(this.element) === 'card'
        ? getUICardEdgeOptions(this.element as UICard)
        : undefined;
    if (!options && this.edge) {
      this.edge.removeFromParent();
      this.edge.dispose();
      this.edge = undefined;
      return true;
    }
    if (options && !this.edge) {
      this.edge = new UICardEdge({
        cardCornerRadius: numericCornerRadius(properties.cornerRadius),
      });
      this.node.add(this.edge);
      return true;
    }
    this.edge?.setCardCornerRadius(
      numericCornerRadius(properties.cornerRadius)
    );
    return false;
  }

  private syncImage(): void {
    if (!(this.node instanceof Image)) return;
    const source = (this.element as UIImage).src;
    if (source === this.imageSource) return;
    this.imageSource = source;
    const request = ++this.imageRequest;
    if (source instanceof THREE.Texture) {
      this.replaceImageTexture(source, false);
      return;
    }
    void imageTextureLoader
      .loadAsync(source)
      .then((texture) => {
        texture.colorSpace = THREE.SRGBColorSpace;
        texture.matrixAutoUpdate = false;
        if (this.disposed) {
          texture.dispose();
          return;
        }
        this.enqueue(() => {
          if (
            this.disposed ||
            request !== this.imageRequest ||
            this.imageSource !== source
          ) {
            texture.dispose();
            return;
          }
          this.replaceImageTexture(texture, true);
          this.resourceRevision++;
        });
      })
      .catch(() => undefined);
  }

  private replaceImageTexture(
    texture: THREE.Texture,
    ownsTexture: boolean
  ): void {
    const previous = this.imageTexture;
    const previousOwned = this.ownsImageTexture;
    this.imageTexture = texture;
    this.ownsImageTexture = ownsTexture;
    (this.node as Image).texture.value = texture;
    if (previousOwned && previous && previous !== texture) previous.dispose();
  }

  private setHitEnabled(properties: Record<string, unknown>): void {
    const kind = getUIElementKind(this.element);
    const blocksHits =
      kind === 'button' ||
      kind === 'slider' ||
      !isTransparent(properties.fillColor);
    const pointerEvents = this.element.xb?.pointerEvents;
    const enabled = blocksHits && pointerEvents !== 'none';
    if (pointerEvents === this.pointerEvents && enabled === this.hitEnabled)
      return;
    this.pointerEvents = pointerEvents;
    this.hitEnabled = enabled;
    setPhysicalHitEnabled(this.node, enabled);
  }
}

function isContainerNode(node: UIKitNode): node is Container | GradientPanel {
  return node instanceof Container || node instanceof GradientPanel;
}

function baseState(element: UIElement): UIPresentationState {
  return {
    hovered: false,
    active: false,
    disabled: getSemanticControl(element)?.isDisabled() ?? false,
    cursorPointCount: 0,
  };
}

function setPhysicalHitEnabled(object: THREE.Object3D, enabled: boolean): void {
  object.xb ??= {};
  object.xb.pointerEvents = enabled ? 'auto' : 'none';
}

function changedProperties(
  previous: Record<string, unknown>,
  next: Record<string, unknown>
): Record<string, unknown> {
  const properties: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(next)) {
    if (!Object.is(previous[key], value)) properties[key] = value;
  }
  for (const key of Object.keys(previous)) {
    if (!(key in next)) properties[key] = undefined;
  }
  return properties;
}

function numericCornerRadius(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value)
    ? Math.max(0, value)
    : 0;
}

function resolvedOpacity(value: unknown): number {
  if (typeof value === 'number') return value;
  if (typeof value === 'string' && value.endsWith('%')) {
    return Number.parseFloat(value) / 100;
  }
  return 1;
}

function resolveStyle(
  element: UIElement,
  state: UIPresentationState,
  theme: UITheme
): UIStyle {
  const kind = getUIElementKind(element);
  const surfaceStyle = hasSurfaceAppearance(element)
    ? (theme.styles?.surface ?? {})
    : {};
  const themeStyle =
    kind === 'card' || kind === 'overlay' ? {} : (theme.styles?.[kind] ?? {});
  const style = element.style;
  return {
    ...surfaceStyle,
    ...themeStyle,
    ...style,
    ...(state.hovered ? surfaceStyle?.[':hover'] : undefined),
    ...(state.hovered ? themeStyle[':hover'] : undefined),
    ...(state.hovered ? style[':hover'] : undefined),
    ...(state.active ? surfaceStyle?.[':active'] : undefined),
    ...(state.active ? themeStyle[':active'] : undefined),
    ...(state.active ? style[':active'] : undefined),
    ...(state.disabled ? surfaceStyle?.[':disabled'] : undefined),
    ...(state.disabled ? themeStyle[':disabled'] : undefined),
    ...(state.disabled ? style[':disabled'] : undefined),
  };
}

function stateKey(state: UIPresentationState): number {
  return (
    Number(state.hovered) |
    (Number(state.active) << 1) |
    (Number(state.disabled) << 2)
  );
}

function isTransparent(color: unknown): boolean {
  if (color === undefined || color === 'transparent') return true;
  if (typeof color !== 'string') return false;
  const compact = color.replace(/\s/g, '').toLowerCase();
  return (
    /^#[0-9a-f]{3}0$/u.test(compact) ||
    /^#[0-9a-f]{6}00$/u.test(compact) ||
    /^(?:rgba|hsla)\([^)]*,0(?:\.0+)?\)$/u.test(compact)
  );
}

function panelDefaults(
  element: UIElement,
  theme: UITheme,
  style: Record<string, unknown>
): NonNullable<ConstructorParameters<typeof GradientPanel>[0]> {
  const kind = getUIElementKind(element);
  const defaults: Record<string, unknown> = {
    fillColor:
      kind === 'button'
        ? (element as UIButton).disabled
          ? theme.colors.disabledSurface
          : theme.colors.primary
        : hasSurfaceAppearance(element)
          ? theme.colors.surface
          : kind === 'slider'
            ? 'rgba(255, 255, 255, 0)'
            : 'rgba(0, 0, 0, 0)',
    cornerRadius: theme.borderRadius,
    opacity: style.opacity ?? 1,
    strokeColor: style.strokeColor ?? 'transparent',
    strokeWidth: style.strokeWidth ?? 0,
    strokeAlign: style.strokeAlign ?? DEFAULT_GRADIENT_PANEL_PROPS.strokeAlign,
    innerShadowColor:
      style.innerShadowColor ?? DEFAULT_GRADIENT_PANEL_PROPS.innerShadowColor,
    innerShadowBlur:
      style.innerShadowBlur ?? DEFAULT_GRADIENT_PANEL_PROPS.innerShadowBlur,
    innerShadowPosition:
      style.innerShadowPosition ??
      DEFAULT_GRADIENT_PANEL_PROPS.innerShadowPosition,
    innerShadowSpread:
      style.innerShadowSpread ?? DEFAULT_GRADIENT_PANEL_PROPS.innerShadowSpread,
    innerShadowFalloff:
      style.innerShadowFalloff ??
      DEFAULT_GRADIENT_PANEL_PROPS.innerShadowFalloff,
    dropShadowColor:
      style.dropShadowColor ?? DEFAULT_GRADIENT_PANEL_PROPS.dropShadowColor,
    dropShadowBlur:
      style.dropShadowBlur ?? DEFAULT_GRADIENT_PANEL_PROPS.dropShadowBlur,
    dropShadowPosition:
      style.dropShadowPosition ??
      DEFAULT_GRADIENT_PANEL_PROPS.dropShadowPosition,
    dropShadowSpread:
      style.dropShadowSpread ?? DEFAULT_GRADIENT_PANEL_PROPS.dropShadowSpread,
    dropShadowFalloff:
      style.dropShadowFalloff ?? DEFAULT_GRADIENT_PANEL_PROPS.dropShadowFalloff,
    color: style.color,
    pointerEvents: element.xb?.pointerEvents ?? 'auto',
    ...style,
  };
  if (kind === 'card' || kind === 'overlay') {
    defaults.flexDirection = style.flexDirection ?? 'column';
    defaults.justifyContent = style.justifyContent ?? 'center';
    defaults.alignItems = style.alignItems ?? 'stretch';
  }
  if (kind === 'card') {
    const card = element as UICard;
    defaults.backfaceColor = defaults.fillColor;
    defaults.pixelSize = card.pixelSize;
    defaults.sizeX = card.size.width;
    defaults.sizeY = card.size.height;
    defaults.width = card.size.width / card.pixelSize;
    defaults.height = card.size.height / card.pixelSize;
    defaults.anchorX = card.anchorX;
    defaults.anchorY = card.anchorY;
  } else if (kind === 'overlay') {
    defaults.depthTest = false;
  }
  return defaults;
}

function createOverlayViewport(
  surface: Container,
  viewport: {width: number; height: number}
): Container {
  const wrapper = new Container({
    width: viewport.width,
    height: viewport.height,
    sizeX: viewport.width,
    sizeY: viewport.height,
    pixelSize: 1,
    flexDirection: 'column',
    justifyContent: 'center',
    alignItems: 'center',
    pointerEvents: 'none',
    depthTest: false,
  });
  wrapper.add(surface);
  return wrapper;
}

function hasSurfaceAppearance(
  element: UIElement
): element is UICard | UIOverlay {
  return (
    (element instanceof UICard || element instanceof UIOverlay) &&
    element.appearance === 'surface'
  );
}

function validPair(
  value: readonly [number, number] | undefined
): value is readonly [number, number] {
  return (
    value !== undefined &&
    Number.isFinite(value[0]) &&
    Number.isFinite(value[1])
  );
}

function boundsFromCenter(
  center: readonly [number, number],
  size: readonly [number, number]
): UIValidationBounds {
  return {
    x: center[0] - size[0] / 2,
    y: center[1] - size[1] / 2,
    width: size[0],
    height: size[1],
  };
}

function contentBounds(parent: Component): UIValidationBounds {
  const [width, height] = parent.size.peek() ?? [0, 0];
  const [top, right, bottom, left] = parent.paddingInset.peek() ?? [0, 0, 0, 0];
  return {
    x: -width / 2 + left,
    y: -height / 2 + bottom,
    width: Math.max(0, width - left - right),
    height: Math.max(0, height - top - bottom),
  };
}

function containsBounds(
  container: UIValidationBounds,
  child: UIValidationBounds
): boolean {
  const tolerance = 0.5;
  return (
    child.x >= container.x - tolerance &&
    child.y >= container.y - tolerance &&
    child.x + child.width <= container.x + container.width + tolerance &&
    child.y + child.height <= container.y + container.height + tolerance
  );
}

const FALLBACK_ICON = `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">
  <path fill="#ffffff" d="M11 18h2v2h-2zm1-16a7 7 0 0 0-7 7h2a5 5 0 1 1 8.6 3.5C13.7 14.2 11 15.2 11 18h2c0-1.5 1.4-2.2 3.1-3.7A7 7 0 0 0 12 2z"/>
</svg>`;

/** Backend-owned icon cache. Completions are staged by bindings. */
class IconCache {
  private readonly content = new Map<string, string>();
  private readonly pending = new Map<
    string,
    {controller: AbortController; subscribers: Set<() => void>}
  >();
  private disposed = false;

  get(path: string, subscriber: () => void): string {
    const cached = this.content.get(path);
    if (cached) return cached;
    let request = this.pending.get(path);
    if (!request) {
      const controller = new AbortController();
      const newRequest = {controller, subscribers: new Set<() => void>()};
      request = newRequest;
      this.pending.set(path, newRequest);
      void fetch(`${ICON_BASE}${path}`, {
        signal: controller.signal,
      })
        .then((response) => {
          if (!response.ok)
            throw new Error(`Icon request failed: ${response.status}`);
          return response.text();
        })
        .then((content) => {
          if (this.disposed) return;
          if (!content.includes('<svg')) throw new Error('Invalid icon SVG.');
          this.content.set(path, content);
          for (const notify of newRequest.subscribers) notify();
        })
        .catch(() => {
          if (!this.disposed) {
            this.content.set(path, FALLBACK_ICON);
            for (const notify of newRequest.subscribers) notify();
          }
        })
        .finally(() => this.pending.delete(path));
    }
    request.subscribers.add(subscriber);
    return FALLBACK_ICON;
  }

  dispose(): void {
    this.disposed = true;
    for (const {controller} of this.pending.values()) controller.abort();
    this.pending.clear();
    this.content.clear();
  }
}

interface SliderContent {
  update(slider: UISlider, theme: UITheme): void;
  dispose(): void;
}

function createSliderContent(panel: GradientPanel): SliderContent {
  const thumbSize = 28;
  const rail = new Container({
    positionType: 'absolute',
    positionLeft: thumbSize / 2,
    positionRight: thumbSize / 2,
    positionTop: '50%',
    transformTranslateY: '-50%',
    height: thumbSize,
    pointerEvents: 'none',
  });
  const track = new GradientPanel({
    positionType: 'absolute',
    positionLeft: 0,
    positionRight: 0,
    positionTop: '50%',
    transformTranslateY: '-50%',
    height: 10,
    fillColor: 'transparent',
    cornerRadius: 5,
    pointerEvents: 'none',
  });
  const fill = new GradientPanel({
    positionType: 'absolute',
    positionLeft: 0,
    positionTop: '50%',
    transformTranslateY: '-50%',
    height: 10,
    cornerRadius: 5,
    pointerEvents: 'none',
  });
  const thumb = new GradientPanel({
    positionType: 'absolute',
    positionTop: '50%',
    transformTranslateX: '-50%',
    transformTranslateY: '-50%',
    width: thumbSize,
    height: thumbSize,
    cornerRadius: thumbSize / 2,
    pointerEvents: 'none',
  });
  const update = (slider: UISlider, theme: UITheme) => {
    const ratio =
      slider.max === slider.min
        ? 0
        : (slider.value - slider.min) / (slider.max - slider.min);
    const color = slider.disabled
      ? theme.colors.disabledText
      : theme.colors.primary;
    track.setProperties({fillColor: theme.colors.outline});
    fill.setProperties({width: `${ratio * 100}%`, fillColor: color});
    thumb.setProperties({
      positionLeft: `${ratio * 100}%`,
      fillColor: color,
    });
  };
  rail.add(track, fill, thumb);
  panel.add(rail);
  return {
    update,
    dispose: () => {
      track.removeFromParent();
      fill.removeFromParent();
      thumb.removeFromParent();
      track.dispose();
      fill.dispose();
      thumb.dispose();
      rail.removeFromParent();
      rail.dispose();
    },
  };
}

function toUIKitStyle(style: UIStyle): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  if (style.padding !== undefined) {
    result.paddingTop = style.padding;
    result.paddingRight = style.padding;
    result.paddingBottom = style.padding;
    result.paddingLeft = style.padding;
  }
  if (style.margin !== undefined) {
    result.marginTop = style.margin;
    result.marginRight = style.margin;
    result.marginBottom = style.margin;
    result.marginLeft = style.margin;
  }
  if (style.gap !== undefined) {
    result.gapRow = style.gap;
    result.gapColumn = style.gap;
  }
  if (style.transform?.translateX !== undefined) {
    result.transformTranslateX = style.transform.translateX;
  }
  if (style.transform?.translateY !== undefined) {
    result.transformTranslateY = style.transform.translateY;
  }
  for (const [key, value] of Object.entries(style)) {
    if (
      key.startsWith(':') ||
      value === undefined ||
      key === 'padding' ||
      key === 'margin' ||
      key === 'gap' ||
      key === 'transform'
    ) {
      continue;
    }
    const mapped =
      key === 'position'
        ? 'positionType'
        : key === 'backgroundColor'
          ? 'fillColor'
          : key === 'borderColor'
            ? 'strokeColor'
            : key === 'borderWidth'
              ? 'strokeWidth'
              : key === 'borderAlign'
                ? 'strokeAlign'
                : key === 'borderRadius'
                  ? 'cornerRadius'
                  : key === 'top'
                    ? 'positionTop'
                    : key === 'right'
                      ? 'positionRight'
                      : key === 'bottom'
                        ? 'positionBottom'
                        : key === 'left'
                          ? 'positionLeft'
                          : key === 'rowGap'
                            ? 'gapRow'
                            : key === 'columnGap'
                              ? 'gapColumn'
                              : key;
    result[mapped] = value;
  }
  return result;
}

function iconAssetPath(icon: UIIcon): string {
  const name = `${encodeURIComponent(icon.icon)}${icon.filled ? '-fill' : ''}`;
  return `${icon.weight}/${icon.variant}/${name}.svg`;
}

function defaultIconAssetPath(icon: string): string {
  return `400/outlined/${encodeURIComponent(icon)}.svg`;
}
