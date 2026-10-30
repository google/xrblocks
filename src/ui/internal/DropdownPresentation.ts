import {Container, Text} from '@pmndrs/uikit';
import * as THREE from 'three';

import type {UIDropdown, UIDropdownOption} from '../components/UIDropdown';
import {GradientPanel} from '../primitives/GradientPanel';
import {MergedSvg} from '../primitives/MergedSvg';
import type {UITheme} from '../UITheme';
import {normalizeAlphaHexColor, parseColorWithAlpha} from '../utils/ColorUtils';

/** zIndex steps that lift the list in overlays, which order by renderOrder. */
export const DROPDOWN_OVERLAY_Z_INDEX = 100;
const LIST_OFFSET = '110%' as const;
const LIST_CORNER_RADIUS = 12;
const ICON_SIZE = 20;
// Inline icons render without the icon CDN, so they never show a fallback.
const svg = (path: string) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path fill="#ffffff" d="${path}"/></svg>`;
const CHEVRON_DOWN = svg('M4.6 8.2 12 15.6l7.4-7.4 1.4 1.4-8.8 8.8-8.8-8.8z');
const CHEVRON_UP = svg('M4.6 15.8 12 8.4l7.4 7.4 1.4-1.4L12 5.6l-8.8 8.8z');
const CHECK = svg('M3.4 12.6 4.8 11.2l4.4 4.4 10-10 1.4 1.4-11.4 11.4z');
// Pins label glyphs to the top of the label box. Yoga re-rounds the cached
// layout of measured text on every relayout (a looping UIProgress relays out
// its card several times a second), so a label box can grow past its text and
// centered glyphs slide down onto the next option row.
const LABEL_ALIGN = {verticalAlign: 'top'} as const;
const BELOW = {positionTop: LIST_OFFSET, positionBottom: undefined} as const;
const ABOVE = {positionTop: undefined, positionBottom: LIST_OFFSET} as const;
const edgePoint = new THREE.Vector3();

/**
 * Private trigger content and option list of a UIDropdown. Option nodes mount
 * inside `list`, which is absolutely positioned against the trigger, so the
 * open list never changes the card layout.
 */
export class DropdownPresentation {
  readonly list: GradientPanel;
  private readonly label: Text;
  private readonly chevron: MergedSvg;
  private above = false;
  private zIndex?: number;

  constructor(
    private readonly dropdown: UIDropdown,
    private readonly trigger: Container
  ) {
    this.label = new Text({
      text: '',
      flexShrink: 1,
      pointerEvents: 'none',
      ...LABEL_ALIGN,
    });
    this.label.name = 'UIDropdownLabel';
    this.chevron = new MergedSvg({
      content: CHEVRON_DOWN,
      width: ICON_SIZE,
      height: ICON_SIZE,
      flexShrink: 0,
      pointerEvents: 'none',
    });
    this.chevron.name = 'UIDropdownChevron';
    this.list = new GradientPanel({
      ...BELOW,
      positionType: 'absolute',
      positionLeft: 0,
      minWidth: '100%',
      flexDirection: 'column',
      alignItems: 'stretch',
      cornerRadius: LIST_CORNER_RADIUS,
      strokeWidth: 1,
      visibility: 'hidden',
      pointerEvents: 'none',
    });
    this.list.name = 'UIDropdownList';
    trigger.add(this.label, this.chevron, this.list);
  }

  commit(
    theme: UITheme,
    color: THREE.ColorRepresentation | undefined,
    renderOrder: number | undefined
  ): void {
    const {colors} = theme;
    const dropdown = this.dropdown;
    const chosen = dropdown.options.find(
      (option) => option.value === dropdown.value
    );
    const textColor = color ?? colors.text;
    this.label.setProperties({
      text: chosen?.label ?? dropdown.placeholder,
      color: normalizeAlphaHexColor(
        chosen || dropdown.disabled ? textColor : colors.secondaryText
      ),
    });
    this.chevron.setProperties({
      content: dropdown.open ? CHEVRON_UP : CHEVRON_DOWN,
      color: normalizeAlphaHexColor(textColor),
    });
    // The list covers sibling content, so it uses an opaque surface color.
    const {color: surface} = parseColorWithAlpha(colors.surface);
    this.list.setProperties({
      fillColor: `#${surface.getHexString()}`,
      strokeColor: colors.outline,
      visibility: dropdown.open ? undefined : 'hidden',
      renderOrder:
        renderOrder === undefined
          ? undefined
          : renderOrder + DROPDOWN_OVERLAY_Z_INDEX * 1_000,
    });
    this.syncZIndex();
  }

  /** Opens the list above the trigger when it would pass the root's bottom. */
  afterLayout(): void {
    this.syncZIndex();
    const above = this.opensAbove();
    if (above === undefined || above === this.above) return;
    this.above = above;
    this.list.setProperties(above ? ABOVE : BELOW);
  }

  dispose(): void {
    for (const node of [this.label, this.chevron, this.list]) {
      node.removeFromParent();
      node.dispose();
    }
  }

  /**
   * Keeps the list one uikit zIndex step above its trigger. uikit zIndex is
   * absolute, not relative to the parent, and each step also biases hit
   * distance by 1 cm, so a fixed value falls under a trigger inside a stacked
   * overlay or panel. The list is mounted before this first runs: a
   * GradientPanel built detached with a zIndex stopped later siblings from
   * drawing while the list was hidden.
   */
  private syncZIndex(): void {
    const zIndex = (this.trigger.orderInfo.peek()?.majorIndex ?? 0) + 1;
    if (zIndex === this.zIndex) return;
    this.zIndex = zIndex;
    this.list.setProperties({zIndex});
  }

  private opensAbove(): boolean | undefined {
    const trigger = this.trigger.globalPanelMatrix.peek();
    const list = this.list.globalPanelMatrix.peek();
    const root = this.trigger.root.peek().component.globalPanelMatrix.peek();
    if (!trigger || !list || !root) return undefined;
    const triggerTop = edgeY(trigger, 0.5);
    const triggerHeight = triggerTop - edgeY(trigger, -0.5);
    const listHeight = edgeY(list, 0.5) - edgeY(list, -0.5);
    const gap = triggerHeight * 0.1;
    const roomBelow = triggerTop - triggerHeight - gap - edgeY(root, -0.5);
    const roomAbove = edgeY(root, 0.5) - triggerTop - gap;
    // Flip only for clearly more room, so equal space keeps the list below.
    return listHeight > roomBelow && roomAbove > roomBelow + gap;
  }
}

export interface DropdownOptionContent {
  update(
    option: UIDropdownOption,
    theme: UITheme,
    color: THREE.ColorRepresentation | undefined
  ): void;
  dispose(): void;
}

/** Adds the check mark and label of one option row. */
export function createDropdownOptionContent(
  row: Container
): DropdownOptionContent {
  const check = new MergedSvg({
    content: CHECK,
    width: ICON_SIZE,
    height: ICON_SIZE,
    flexShrink: 0,
    pointerEvents: 'none',
  });
  check.name = 'UIDropdownCheck';
  const label = new Text({
    text: '',
    flexShrink: 1,
    pointerEvents: 'none',
    ...LABEL_ALIGN,
  });
  label.name = 'UIDropdownOptionLabel';
  row.add(check, label);
  return {
    update: (option, theme, color) => {
      const {colors} = theme;
      check.setProperties({
        color: normalizeAlphaHexColor(
          option.disabled ? colors.disabledText : colors.primary
        ),
        // Unset inherits the list's visibility, so a closed list hides it.
        visibility: option.checked ? undefined : 'hidden',
      });
      label.setProperties({
        text: option.label,
        color: normalizeAlphaHexColor(color ?? colors.text),
      });
    },
    dispose: () => {
      for (const node of [check, label]) {
        node.removeFromParent();
        node.dispose();
      }
    },
  };
}

function edgeY(matrix: THREE.Matrix4, y: number): number {
  return edgePoint.set(0, y, 0).applyMatrix4(matrix).y;
}
