import {
  Component,
  Container,
  Image,
  Svg,
  Text,
  reversePainterSortStable,
} from '@pmndrs/uikit';
import {signal} from '@preact/signals-core';
import * as THREE from 'three';

import {UIButton} from '../components/UIButton';
import {UICard, getUICardEdgeOptions} from '../components/UICard';
import {UIIcon} from '../components/UIIcon';
import {UIImage} from '../components/UIImage';
import {UIOverlay} from '../components/UIOverlay';
import {UISlider} from '../components/UISlider';
import {UIText} from '../components/UIText';
import {
  getUIElementKind,
  getUIContentRevision,
  getUIRevision,
  invalidateUIElement,
  isUIElement,
  type UIElement,
  type UIStyle,
} from '../UIElement';
import type {UITheme} from '../UITheme';
import type {UIValidationBounds, UIValidationIssue} from '../UIValidation';
import {GradientPanel} from '../primitives/GradientPanel';
import {UICardEdge} from './UICardEdge';
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

type PresentationUpdate = (stateFor: UIPresentationStateFor) => void;

class UIKitMount implements UIMount {
  object: THREE.Object3D = new THREE.Group();
  private rendered?: Container;
  private presentationUpdates: PresentationUpdate[] = [];
  private readonly elementNodes = new Map<UIElement, Component>();
  private readonly isOverlay: boolean;

  constructor(
    private readonly root: UIElement,
    private readonly icons: IconCache
  ) {
    this.object.name = `Private ${root.name}`;
    this.isOverlay = getUIElementKind(root) === 'overlay';
  }

  sync(
    theme: UITheme,
    viewport: {width: number; height: number},
    stateFor: UIPresentationStateFor,
    rootOrder: number
  ): UIHitMapping[] {
    this.rendered?.removeFromParent();
    this.rendered?.dispose();
    this.presentationUpdates = [];
    this.elementNodes.clear();
    const mappings: UIHitMapping[] = [];
    const rendered = createNode(
      this.root,
      theme,
      mappings,
      viewport,
      stateFor,
      getUIElementKind(this.root) === 'overlay'
        ? OVERLAY_RENDER_ORDER_BASE +
            Number(this.root.style.zIndex ?? 0) * OVERLAY_Z_INDEX_STEP +
            rootOrder * OVERLAY_ROOT_ORDER_STEP
        : undefined,
      {value: 0},
      this.icons,
      this.presentationUpdates,
      this.elementNodes
    ) as Container;
    this.rendered = this.isOverlay
      ? createOverlayViewport(rendered, viewport)
      : rendered;
    this.object.add(this.rendered);
    return mappings;
  }

  present(stateFor: UIPresentationStateFor): void {
    for (const update of this.presentationUpdates) {
      update(stateFor);
    }
  }

  update(deltaSeconds: number): void {
    this.rendered?.update(deltaSeconds);
  }

  validate(): readonly UIValidationIssue[] {
    const issues: UIValidationIssue[] = [];
    for (const [element, node] of this.elementNodes) {
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
    this.rendered?.dispose();
    this.rendered = undefined;
    this.presentationUpdates = [];
    this.elementNodes.clear();
    this.object.clear();
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

function createNode(
  element: UIElement,
  theme: UITheme,
  mappings: UIHitMapping[],
  viewport: {width: number; height: number},
  stateFor: UIPresentationStateFor,
  rootStack: number | undefined,
  sequence: {value: number},
  icons: IconCache,
  presentationUpdates: PresentationUpdate[],
  elementNodes: Map<UIElement, Component>
): THREE.Object3D {
  const kind = getUIElementKind(element);
  const cardEdgeOptions =
    kind === 'card' ? getUICardEdgeOptions(element as UICard) : undefined;
  const cursorPoints = cardEdgeOptions
    ? ([new THREE.Vector3(), new THREE.Vector3()] as const)
    : undefined;
  const presentation = stateFor(element, cursorPoints);
  const overlayRenderOrder =
    rootStack === undefined
      ? undefined
      : rootStack +
        Number(element.style.zIndex ?? 0) * 1_000 +
        sequence.value++;
  const styleFor = (state: UIPresentationState): Record<string, unknown> => {
    const style = toUIKitStyle(resolveStyle(element, state, theme));
    if (overlayRenderOrder !== undefined) {
      style.depthTest = false;
      style.depthWrite = false;
      style.renderOrder = overlayRenderOrder;
    }
    return style;
  };
  const style = styleFor(presentation);
  let node: THREE.Object3D;
  let blocksHits = true;
  let applyPresentation: (state: UIPresentationState) => void;
  let applyContent: (() => void) | undefined;
  let edge: UICardEdge | undefined;

  if (kind === 'text') {
    const text = element as UIText;
    const textContent = signal(text.text);
    const propertiesFor = (state: UIPresentationState) => {
      const nextStyle = styleFor(state);
      return {
        text: textContent,
        color:
          (nextStyle.color as THREE.ColorRepresentation | undefined) ??
          theme.colors.text,
        ...nextStyle,
        pointerEvents: element.xb?.pointerEvents ?? 'auto',
      };
    };
    const textNode = new Text(propertiesFor(presentation));
    node = textNode;
    applyContent = () => {
      textContent.value = text.text;
    };
    applyPresentation = (state) =>
      textNode.resetProperties(propertiesFor(state));
  } else if (kind === 'image') {
    const image = element as UIImage;
    const propertiesFor = (state: UIPresentationState) => ({
      src: image.src,
      ...styleFor(state),
      pointerEvents: element.xb?.pointerEvents ?? 'auto',
    });
    const imageNode = new Image(propertiesFor(presentation));
    node = imageNode;
    applyPresentation = (state) =>
      imageNode.resetProperties(propertiesFor(state));
  } else if (kind === 'icon') {
    const icon = element as UIIcon;
    const propertiesFor = (state: UIPresentationState) => ({
      content: icons.get(iconAssetPath(icon), element),
      ...styleFor(state),
      pointerEvents: element.xb?.pointerEvents ?? 'auto',
    });
    const iconNode = new Svg(propertiesFor(presentation));
    node = iconNode;
    applyPresentation = (state) =>
      iconNode.resetProperties(propertiesFor(state));
  } else {
    const propertiesFor = (state: UIPresentationState) =>
      panelDefaults(element, theme, styleFor(state));
    const panelStyle = propertiesFor(presentation);
    blocksHits =
      kind === 'button' ||
      kind === 'slider' ||
      !isTransparent(panelStyle.fillColor);
    const panel = new GradientPanel(panelStyle);
    node = panel;
    let previousPanelProperties = panelStyle;
    let buttonContent: Array<Text | Svg> = [];
    let updateSliderContent: (() => void) | undefined;

    if (kind === 'button') {
      buttonContent = addButtonContent(
        panel,
        element as UIButton,
        theme,
        icons,
        style.color as THREE.ColorRepresentation | undefined
      );
    } else if (kind === 'slider') {
      updateSliderContent = addSliderContent(panel, element as UISlider, theme);
    }

    for (const child of element.children) {
      if (!isUIElement(child)) continue;
      panel.add(
        createNode(
          child,
          theme,
          mappings,
          viewport,
          stateFor,
          rootStack,
          sequence,
          icons,
          presentationUpdates,
          elementNodes
        )
      );
    }

    if (cardEdgeOptions) {
      edge = new UICardEdge();
      panel.add(edge);
      edge.setCursorPoints(
        presentation.cursorPointCount > 0 ? cursorPoints?.[0] : undefined,
        presentation.cursorPointCount > 1 ? cursorPoints?.[1] : undefined
      );
      mappings.push({
        physical: edge,
        logical: element,
      });
    }
    applyPresentation = (state) => {
      const nextPanelProperties = propertiesFor(state);
      panel.setProperties(
        changedProperties(previousPanelProperties, nextPanelProperties)
      );
      previousPanelProperties = nextPanelProperties;
      if (kind === 'button') {
        updateButtonContent(
          buttonContent,
          element as UIButton,
          theme,
          icons,
          styleFor(state).color as THREE.ColorRepresentation | undefined
        );
      } else if (kind === 'slider') {
        updateSliderContent?.();
      }
    };
  }

  let revision = getUIRevision(element);
  let contentRevision = getUIContentRevision(element);
  let presentationKey = stateKey(presentation);
  let pointerEvents = element.xb?.pointerEvents;
  presentationUpdates.push((stateFor) => {
    const state = stateFor(element, cursorPoints);
    const nextRevision = getUIRevision(element);
    const nextContentRevision = getUIContentRevision(element);
    const nextKey = stateKey(state);
    const nextPointerEvents = element.xb?.pointerEvents;
    if (nextContentRevision !== contentRevision) {
      contentRevision = nextContentRevision;
      applyContent?.();
    }
    if (
      nextRevision !== revision ||
      nextKey !== presentationKey ||
      nextPointerEvents !== pointerEvents
    ) {
      revision = nextRevision;
      presentationKey = nextKey;
      pointerEvents = nextPointerEvents;
      applyPresentation(state);
    }
    node.visible = element.visible;
    edge?.setCursorPoints(
      state.cursorPointCount > 0 ? cursorPoints?.[0] : undefined,
      state.cursorPointCount > 1 ? cursorPoints?.[1] : undefined
    );
  });

  node.visible = element.visible;
  elementNodes.set(element, node as Component);
  if (overlayRenderOrder !== undefined) node.renderOrder = overlayRenderOrder;
  if (blocksHits) {
    mappings.push({
      physical: node,
      logical: element,
    });
  }
  return node;
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

function addButtonContent(
  panel: GradientPanel,
  button: UIButton,
  theme: UITheme,
  icons: IconCache,
  color?: THREE.ColorRepresentation
): Array<Text | Svg> {
  const content: Array<Text | Svg> = [];
  const contentColor =
    color ??
    (button.disabled ? theme.colors.disabledText : theme.colors.primaryText);
  if (button.icon) {
    content.push(
      new Svg({
        content: icons.get(defaultIconAssetPath(button.icon), button),
        width: 24,
        height: 24,
        color: contentColor,
        pointerEvents: 'none',
      })
    );
  }
  if (button.label) {
    content.push(
      new Text({
        text: button.label,
        color: contentColor,
        pointerEvents: 'none',
      })
    );
  }
  if (content.length > 0) panel.add(...content);
  return content;
}

function updateButtonContent(
  content: readonly (Text | Svg)[],
  button: UIButton,
  theme: UITheme,
  icons: IconCache,
  color?: THREE.ColorRepresentation
): void {
  const contentColor =
    color ??
    (button.disabled ? theme.colors.disabledText : theme.colors.primaryText);
  let index = 0;
  if (button.icon) {
    const icon = content[index++] as Svg;
    icon.resetProperties({
      content: icons.get(defaultIconAssetPath(button.icon), button),
      width: 24,
      height: 24,
      color: contentColor,
      pointerEvents: 'none',
    });
  }
  if (button.label) {
    const label = content[index] as Text;
    label.resetProperties({
      text: button.label,
      color: contentColor,
      pointerEvents: 'none',
    });
  }
}

const FALLBACK_ICON = `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">
  <path fill="#ffffff" d="M11 18h2v2h-2zm1-16a7 7 0 0 0-7 7h2a5 5 0 1 1 8.6 3.5C13.7 14.2 11 15.2 11 18h2c0-1.5 1.4-2.2 3.1-3.7A7 7 0 0 0 12 2z"/>
</svg>`;

/** Backend-owned network cache with an immediate deterministic fallback. */
class IconCache {
  private readonly content = new Map<string, string>();
  private readonly pending = new Map<
    string,
    {controller: AbortController; subscribers: Set<UIElement>}
  >();
  private disposed = false;

  get(path: string, subscriber: UIElement): string {
    const cached = this.content.get(path);
    if (cached) return cached;
    let request = this.pending.get(path);
    if (!request) {
      const controller = new AbortController();
      const newRequest = {controller, subscribers: new Set<UIElement>()};
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
          for (const subscriber of newRequest.subscribers) {
            invalidateUIElement(subscriber);
          }
        })
        .catch(() => {
          if (!this.disposed) this.content.set(path, FALLBACK_ICON);
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

function addSliderContent(
  panel: GradientPanel,
  slider: UISlider,
  theme: UITheme
): () => void {
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
    fillColor: theme.colors.outline,
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
  const update = () => {
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
  update();
  rail.add(track, fill, thumb);
  panel.add(rail);
  return update;
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
