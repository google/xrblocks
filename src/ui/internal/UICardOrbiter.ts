import {registerSemanticControl} from '../../interaction/SemanticControl';
import {UIButton} from '../components/UIButton';
import type {UICard, UICardOrbiterOptions} from '../components/UICard';
import {UIIcon} from '../components/UIIcon';
import {UIPanel} from '../components/UIPanel';
import type {UIElement, UIStyle} from '../UIElement';

// Android XR's orbiter, measured in layout pixels (millimeters at the default
// card pixel size of 1 mm). It does not follow the card's size.
const PILL_WIDTH = 265;
const PILL_HEIGHT = 86;
const PILL_RADIUS = 30;
const PILL_GAP = 19;
const PILL_COLOR = '#101216';
const GLYPH_COLOR = '#c8cbcf';
// Item centers are 89 apart; each item is the size of its hover disc.
const DISC_SIZE = 67;
const ITEM_SPACING = 89;
const APP_ICON_SIZE = 56;
const MINIMIZE_BAR_WIDTH = 23;
const MINIMIZE_BAR_HEIGHT = 2.6;
// The minimize bar sits like an underscore below the pill's mid-height.
const MINIMIZE_BAR_DROP = 11;
// Icons scale their glyph to the box. At weight 700, a 17 mm close glyph has
// Android's 2.6 mm strokes.
const CLOSE_ICON_SIZE = 17;
const CLOSE_ICON_WEIGHT = 700;
// Material's expand glyph, like Android's picture-in-picture expand action,
// with about the same 2.3 mm strokes.
const RESTORE_ICON = 'open_in_full';
const RESTORE_ICON_SIZE = 22;
const RESTORE_ICON_WEIGHT = 600;
const DISC_HOVER_COLOR = '#202626';
const DISC_ACTIVE_COLOR = 'rgb(40, 42, 46)';
// Android XR's app icon disc: 42 dp across, centered on the icon, shown and
// hidden without a fade. The icon itself does not change.
const ICON_DISC_SIZE = 64;
const ICON_DISC_HOVER_COLOR = '#1e2223';
const ICON_DISC_ACTIVE_COLOR = 'rgb(38, 41, 42)';
// Android XR fades the orbiter out with an ease-out as a resize corner is
// pressed, then back in with an ease-in about 0.7 s after release, once the
// relaid-out content arrives. Cards reflow live, so 0.3 s is enough here.
const FADE_OUT_SECONDS = 0.22;
const FADE_IN_DELAY_SECONDS = 0.3;
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
      if (object !== this.root) this.elements.push(object as UIElement);
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
