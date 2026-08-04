import type {UITheme, UIThemePresetName, UIThemeUpdate} from './UITheme';
import {
  createThemeSnapshot,
  defaultTheme,
  uiThemePresets,
  updateThemeSnapshot,
} from './UITheme';

/** Lightweight global UI settings. It does not load the rendering backend. */
export class UI {
  private themeSnapshot = defaultTheme;
  private themeRevision = 0;

  get theme(): UITheme {
    return this.themeSnapshot;
  }

  set theme(value: UIThemePresetName | UITheme) {
    const snapshot =
      typeof value === 'string'
        ? uiThemePresets[value]
        : createThemeSnapshot(value);
    if (!snapshot) throw new Error(`Unknown UI theme preset "${value}".`);
    this.themeSnapshot = snapshot;
    this.themeRevision++;
  }

  setTheme(update: UIThemeUpdate): void {
    this.themeSnapshot = updateThemeSnapshot(this.themeSnapshot, update);
    this.themeRevision++;
  }

  /** Internal revision used by the private renderer. */
  get revision(): number {
    return this.themeRevision;
  }
}

export const ui = new UI();
