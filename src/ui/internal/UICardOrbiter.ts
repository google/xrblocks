import {registerSemanticControl} from '../../interaction/SemanticControl';
import {UIButton} from '../components/UIButton';
import type {UICard, UICardOrbiterOptions} from '../components/UICard';
import {UIIcon} from '../components/UIIcon';
import {UIPanel} from '../components/UIPanel';
import {isUIElement, type UIElement, type UIStyle} from '../UIElement';

/**
 * Pill size in layout pixels (1 mm at the default card pixel size). It does
 * not follow the card's size. Source: Android XR orbiter recordings.
 */
export const PILL_WIDTH = 265;
export const PILL_HEIGHT = 86;
/** Corner radius of the pill, in layout pixels. */
const PILL_RADIUS = 30;
/** Gap between the pill and the card's top edge, in layout pixels. */
export const PILL_GAP = 19;
/** Fill color of the pill. */
const PILL_COLOR = '#101216';
/** Color of the pill's glyphs. */
const GLYPH_COLOR = '#c8cbcf';
/** Size of each item, which is also its hover disc, in layout pixels. */
export const DISC_SIZE = 67;
/** Distance between item centers, in layout pixels. */
export const ITEM_SPACING = 89;
/** Size of the app icon, in layout pixels. */
export const APP_ICON_SIZE = 56;
/** Size of the minimize bar, in layout pixels. */
export const MINIMIZE_BAR_WIDTH = 23;
export const MINIMIZE_BAR_HEIGHT = 2.6;
/**
 * Drop of the minimize bar below the pill's mid-height, in layout pixels, so
 * it sits like an underscore.
 */
export const MINIMIZE_BAR_DROP = 11;
/**
 * Close glyph box and weight. Icons scale their glyph to the box, so these
 * set the stroke width. Source: Android XR orbiter recordings.
 */
export const CLOSE_ICON_SIZE = 17;
export const CLOSE_ICON_WEIGHT = 700;
/** Material Symbols glyph for restore, like a picture-in-picture expand. */
const RESTORE_ICON = 'open_in_full';
/** Restore glyph box and weight, matching the close glyph's strokes. */
const RESTORE_ICON_SIZE = 22;
const RESTORE_ICON_WEIGHT = 600;
/** Disc colors behind a hovered and a pressed button. */
const DISC_HOVER_COLOR = '#202626';
const DISC_ACTIVE_COLOR = 'rgb(40, 42, 46)';
/**
 * App icon disc size and colors. The disc shows and hides without a fade,
 * and the icon itself does not change. Source: Android XR orbiter recordings.
 */
export const ICON_DISC_SIZE = 64;
const ICON_DISC_HOVER_COLOR = '#1e2223';
const ICON_DISC_ACTIVE_COLOR = 'rgb(38, 41, 42)';
/** Ease-out fade while a resize corner is held, in seconds. */
const FADE_OUT_SECONDS = 0.22;
/**
 * Delay after a resize ends before the ease-in fade starts, in seconds. Cards
 * reflow live, so the pill does not wait for content to relay out.
 */
const FADE_IN_DELAY_SECONDS = 0.3;
/** Ease-in fade after a resize, in seconds. */
const FADE_IN_SECONDS = 0.175;

const DISC_STATE_STYLE = {borderWidth: 0, color: GLYPH_COLOR} as const;
// Theme roles may pad panels and buttons per side, which `padding` alone
// does not override.
const NO_PADDING = {
  paddingTop: 0,
  paddingRight: 0,
  paddingBottom: 0,
  paddingLeft: 0,
} as const;

/** Private model of a card's orbiter, rendered as a child of the card's node. */
export class UICardOrbiter {
  readonly root: UIPanel;
  private readonly minimize: UIButton;
  private readonly minimizeBar: UIPanel;
  private readonly restoreIcon: UIIcon;
  private readonly elements: UIElement[];
  private alpha = 1;
  private fadeFrom = 1;
  private fadeElapsed = 0;
  private resizing = false;
  private shownMinimized?: boolean;

  constructor(
    private readonly card: UICard,
    readonly options: Readonly<UICardOrbiterOptions>
  ) {
    const hideCard = () => {
      card.visible = false;
    };
    const appIcon =
      options.icon &&
      named(
        new UIIcon({
          icon: options.icon,
          style: {
            width: APP_ICON_SIZE,
            height: APP_ICON_SIZE,
            flexShrink: 0,
            color: GLYPH_COLOR,
          },
        }),
        'UICardOrbiterIcon'
      );
    // The icon only looks and acts clickable when the app gives it an action.
    const onIcon = options.onIcon;
    const slot = new UIPanel({
      style: itemStyle(),
      children: !appIcon
        ? []
        : onIcon
          ? [
              named(
                new UIButton({
                  ariaLabel: 'App icon',
                  onClick: () => onIcon(),
                  style: discStyle(
                    ICON_DISC_SIZE,
                    ICON_DISC_HOVER_COLOR,
                    ICON_DISC_ACTIVE_COLOR
                  ),
                  children: [appIcon],
                }),
                'UICardOrbiterIconButton'
              ),
            ]
          : [appIcon],
    });
    this.minimizeBar = named(
      new UIPanel({
        style: {
          width: MINIMIZE_BAR_WIDTH,
          height: MINIMIZE_BAR_HEIGHT,
          flexShrink: 0,
          marginTop: 2 * MINIMIZE_BAR_DROP,
          borderRadius: MINIMIZE_BAR_HEIGHT / 2,
          backgroundColor: GLYPH_COLOR,
        },
      }),
      'UICardOrbiterMinimizeBar'
    );
    this.restoreIcon = named(
      new UIIcon({
        icon: RESTORE_ICON,
        weight: RESTORE_ICON_WEIGHT,
        style: {
          width: RESTORE_ICON_SIZE,
          height: RESTORE_ICON_SIZE,
          flexShrink: 0,
          color: GLYPH_COLOR,
        },
      }),
      'UICardOrbiterRestoreIcon'
    );
    this.minimize = named(
      new UIButton({
        ariaLabel: 'Minimize',
        onClick: () => {
          if (card.minimized) card.minimized = false;
          else if (options.onMinimize) options.onMinimize();
          else card.minimized = true;
        },
        style: discStyle(),
        children: [this.minimizeBar, this.restoreIcon],
      }),
      'UICardOrbiterMinimize'
    );
    const close = named(
      new UIButton({
        ariaLabel: 'Close',
        onClick: () => (options.onClose ?? hideCard)(),
        style: discStyle(),
        children: [
          named(
            new UIIcon({
              icon: 'close',
              weight: CLOSE_ICON_WEIGHT,
              style: {
                width: CLOSE_ICON_SIZE,
                height: CLOSE_ICON_SIZE,
                flexShrink: 0,
                color: GLYPH_COLOR,
              },
            }),
            'UICardOrbiterCloseIcon'
          ),
        ],
      }),
      'UICardOrbiterClose'
    );
    this.root = named(
      new UIPanel({
        style: {
          position: 'absolute',
          top: -(PILL_GAP + PILL_HEIGHT),
          left: '50%',
          marginLeft: -PILL_WIDTH / 2,
          width: PILL_WIDTH,
          height: PILL_HEIGHT,
          flexDirection: 'row',
          justifyContent: 'center',
          alignItems: 'center',
          gap: ITEM_SPACING - DISC_SIZE,
          ...NO_PADDING,
          borderWidth: 0,
          borderRadius: PILL_RADIUS,
          backgroundColor: PILL_COLOR,
        },
        children: [slot, this.minimize, close],
      }),
      'UICardOrbiter'
    );
    // While minimized, pressing anywhere on the pill restores the card.
    registerSemanticControl(this.root, {
      kind: 'button',
      isDisabled: () => !card.minimized,
      activate: () => {
        card.minimized = false;
      },
    });
    this.elements = [this.root];
    this.root.traverse((object) => {
      if (object !== this.root && isUIElement(object)) {
        this.elements.push(object);
      }
    });
    this.syncMinimized();
  }

  /** Shows the restore glyph and label while the card is minimized. */
  syncMinimized(): void {
    const minimized = this.card.minimized;
    if (minimized === this.shownMinimized) return;
    this.shownMinimized = minimized;
    this.minimize.ariaLabel = minimized ? 'Restore' : 'Minimize';
    this.minimizeBar.style.display = minimized ? 'none' : 'flex';
    this.restoreIcon.style.display = minimized ? 'flex' : 'none';
  }

  /** Advances the resize fade by one frame. */
  update(deltaSeconds: number, resizing: boolean): void {
    if (resizing !== this.resizing) {
      this.resizing = resizing;
      this.fadeFrom = this.alpha;
      this.fadeElapsed = 0;
    }
    this.fadeElapsed += deltaSeconds;
    let alpha: number;
    if (resizing) {
      const t = Math.min(1, this.fadeElapsed / FADE_OUT_SECONDS);
      alpha = this.fadeFrom * (1 - t) ** 2;
    } else {
      const t = Math.min(
        1,
        Math.max(0, this.fadeElapsed - FADE_IN_DELAY_SECONDS) / FADE_IN_SECONDS
      );
      alpha = this.fadeFrom + (1 - this.fadeFrom) * t * t;
    }
    if (alpha === this.alpha) return;
    this.alpha = alpha;
    for (const element of this.elements) element.style.opacity = alpha;
    this.root.visible = alpha > 0;
  }
}

function named<T extends UIElement>(element: T, name: string): T {
  element.name = name;
  return element;
}

function itemStyle(): UIStyle {
  return {
    width: DISC_SIZE,
    height: DISC_SIZE,
    flexShrink: 0,
    justifyContent: 'center',
    alignItems: 'center',
  };
}

function discStyle(
  size = DISC_SIZE,
  hoverColor = DISC_HOVER_COLOR,
  activeColor = DISC_ACTIVE_COLOR
): UIStyle {
  return {
    ...itemStyle(),
    width: size,
    height: size,
    flexDirection: 'column',
    gap: 0,
    ...NO_PADDING,
    borderWidth: 0,
    borderRadius: size / 2,
    backgroundColor: 'transparent',
    color: GLYPH_COLOR,
    ':hover': {...DISC_STATE_STYLE, backgroundColor: hoverColor},
    ':active': {...DISC_STATE_STYLE, backgroundColor: activeColor},
  };
}
