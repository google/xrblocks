import {cloneUIStyle} from './UIElement';
import type {UIElementKind, UIStyle} from './UIElement';

export interface UIThemeColors {
  readonly surface: string;
  readonly raisedSurface: string;
  readonly primary: string;
  readonly primaryText: string;
  readonly text: string;
  readonly secondaryText: string;
  readonly outline: string;
  readonly disabledSurface: string;
  readonly disabledText: string;
}

/** UIKit-facing styles applied before an element's own style. */
export type UIThemeStyles = Readonly<
  Partial<Record<UIElementKind, Readonly<UIStyle>>>
>;

export interface UITheme {
  readonly colors: UIThemeColors;
  readonly borderRadius: number;
  readonly styles?: UIThemeStyles;
}

export interface UIThemeUpdate {
  readonly colors?: Partial<UIThemeColors>;
  readonly borderRadius?: number;
  readonly styles?: UIThemeStyles;
}

export type UIThemePresetName = 'grayGlass' | 'colorful';

const COLOR_PROPERTIES = [
  'surface',
  'raisedSurface',
  'primary',
  'primaryText',
  'text',
  'secondaryText',
  'outline',
  'disabledSurface',
  'disabledText',
] as const satisfies readonly (keyof UIThemeColors)[];

const COLOR_PROPERTY_SET = new Set<string>(COLOR_PROPERTIES);
const THEME_PROPERTIES = new Set(['colors', 'borderRadius', 'styles']);
const UI_ELEMENT_KINDS = new Set<UIElementKind>([
  'card',
  'overlay',
  'panel',
  'text',
  'button',
  'slider',
  'image',
  'icon',
]);

export const grayGlassTheme = createThemeSnapshot({
  colors: {
    surface: 'rgba(28, 28, 32, 0.78)',
    raisedSurface: 'rgba(255, 255, 255, 0.08)',
    primary: '#61dafb',
    primaryText: '#282c34',
    text: '#ffffff',
    secondaryText: '#aab2c0',
    outline: 'rgba(255, 255, 255, 0.18)',
    disabledSurface: '#282c3466',
    disabledText: '#aab2c0',
  },
  borderRadius: 32,
  styles: {
    card: {
      backgroundColor: {
        gradientType: 'linear',
        rotation: 90,
        stops: [
          {position: 0, color: 'rgba(55, 55, 65, 0.75)'},
          {position: 0.4, color: 'rgba(32, 32, 38, 0.80)'},
          {position: 1, color: 'rgba(18, 18, 22, 0.85)'},
        ],
      },
      borderColor: {
        gradientType: 'linear',
        rotation: 90,
        stops: [
          {position: 0, color: 'rgba(255, 255, 255, 0.42)'},
          {position: 0.5, color: 'rgba(255, 255, 255, 0.14)'},
          {position: 1, color: 'rgba(255, 255, 255, 0.22)'},
        ],
      },
      borderWidth: 1.5,
      borderRadius: 32,
      padding: 24,
      gap: 16,
      innerShadowColor: 'rgba(255, 255, 255, 0.05)',
      innerShadowBlur: 24,
    },
    button: {
      height: 46,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      paddingLeft: 18,
      paddingRight: 22,
      backgroundColor: 'rgba(255, 255, 255, 0.08)',
      color: '#ffffff',
      borderColor: 'rgba(255, 255, 255, 0.18)',
      borderWidth: 1.5,
      borderRadius: 23,
      ':hover': {backgroundColor: 'rgba(255, 255, 255, 0.14)'},
      ':disabled': {
        backgroundColor: '#282c3466',
        color: '#aab2c0',
      },
    },
    text: {
      color: '#ffffff',
    },
  },
});

export const colorfulTheme = createThemeSnapshot({
  colors: {
    surface: 'rgba(10, 17, 31, 0.96)',
    raisedSurface: 'rgba(22, 35, 58, 0.96)',
    primary: '#22d3ee',
    primaryText: '#111827',
    text: '#f8fafc',
    secondaryText: '#cbd5e1',
    outline: '#8ff0df',
    disabledSurface: 'rgba(71, 85, 105, 0.45)',
    disabledText: '#94a3b8',
  },
  borderRadius: 32,
  styles: {
    card: {
      backgroundColor: 'rgba(10, 17, 31, 0.96)',
      borderColor: '#8ff0df',
      borderWidth: 3,
      borderRadius: 32,
    },
    button: {
      backgroundColor: '#233653',
      color: '#f8fafc',
      borderColor: '#8ff0df',
      borderWidth: 2,
      borderRadius: 22,
      ':hover': {backgroundColor: '#315274'},
      ':active': {backgroundColor: '#7c3aed'},
      ':disabled': {
        backgroundColor: 'rgba(71, 85, 105, 0.45)',
        color: '#94a3b8',
      },
    },
    text: {
      color: '#f8fafc',
    },
  },
});

export const uiThemePresets: Readonly<Record<UIThemePresetName, UITheme>> =
  Object.freeze({
    grayGlass: grayGlassTheme,
    colorful: colorfulTheme,
  });

export const defaultTheme: UITheme = grayGlassTheme;

/** Creates a detached, deeply frozen theme snapshot. */
export function createThemeSnapshot(value: UITheme): UITheme {
  validateRecord(value, 'UI theme');
  validateThemeProperties(value);
  const colors = cloneColors(value.colors, false) as UIThemeColors;
  const borderRadius = validateBorderRadius(value.borderRadius);
  const styles =
    value.styles === undefined ? undefined : cloneThemeStyles(value.styles);
  return deepFreeze({colors, borderRadius, ...(styles ? {styles} : undefined)});
}

/** Applies a partial update and returns one new immutable snapshot. */
export function updateThemeSnapshot(
  theme: UITheme,
  update: UIThemeUpdate
): UITheme {
  validateRecord(update, 'UI theme update');
  validateThemeProperties(update);
  const colors =
    update.colors === undefined
      ? theme.colors
      : {...theme.colors, ...cloneColors(update.colors, true)};
  return createThemeSnapshot({
    colors,
    borderRadius:
      update.borderRadius === undefined
        ? theme.borderRadius
        : update.borderRadius,
    styles: update.styles === undefined ? theme.styles : update.styles,
  });
}

function cloneColors(
  value: unknown,
  partial: boolean
): UIThemeColors | Partial<UIThemeColors> {
  validateRecord(value, 'UI theme colors');
  const colors = value as Record<string, unknown>;
  for (const [property, color] of Object.entries(colors)) {
    if (!COLOR_PROPERTY_SET.has(property) || typeof color !== 'string') {
      throw new Error(`Invalid UI theme color "${property}".`);
    }
  }
  if (!partial) {
    for (const property of COLOR_PROPERTIES) {
      if (typeof colors[property] !== 'string') {
        throw new Error(`Invalid UI theme color "${property}".`);
      }
    }
  }
  return {...colors} as Partial<UIThemeColors>;
}

function cloneThemeStyles(value: unknown): UIThemeStyles {
  validateRecord(value, 'UI theme styles');
  const styles: Partial<Record<UIElementKind, Readonly<UIStyle>>> = {};
  for (const [kind, style] of Object.entries(
    value as Record<string, unknown>
  )) {
    if (!UI_ELEMENT_KINDS.has(kind as UIElementKind)) {
      throw new Error(`Invalid UI theme style kind "${kind}".`);
    }
    styles[kind as UIElementKind] = cloneUIStyle(style as UIStyle);
  }
  return styles;
}

function validateThemeProperties(value: object): void {
  for (const property of Object.keys(value)) {
    if (!THEME_PROPERTIES.has(property)) {
      throw new Error(`Invalid UI theme property "${property}".`);
    }
  }
}

function validateBorderRadius(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
    throw new Error('Invalid UI theme property "borderRadius".');
  }
  return value;
}

function validateRecord(value: unknown, name: string): void {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${name} must be an object.`);
  }
}

function deepFreeze<T>(value: T): T {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) {
    return value;
  }
  for (const nested of Object.values(value)) deepFreeze(nested);
  return Object.freeze(value);
}
