import type {UIElement} from './UIElement';
import {
  createThemeSnapshot,
  defaultTheme,
  type UITheme,
  type UIThemePresetName,
  type UIThemeUpdate,
  uiThemePresets,
  updateThemeSnapshot,
} from './UITheme';
import {
  createUIValidationReport,
  type UIValidationReport,
} from './UIValidation';

type UIValidator = (root?: UIElement) => UIValidationReport;
let activeValidator: UIValidator | undefined;

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

  /** Validates the latest completed layout for one UI root or all UI roots. */
  validate(root?: UIElement): UIValidationReport {
    return (
      activeValidator?.(root) ??
      createUIValidationReport(false, [
        {
          code: 'not-ready',
          severity: 'error',
          element: root,
          message: 'The UI renderer has not completed a layout.',
        },
      ])
    );
  }

  /** Internal revision used by the private renderer. */
  get revision(): number {
    return this.themeRevision;
  }
}

export const ui = new UI();

/** Installs the active renderer's mounted-layout validator. */
export function setUIValidator(validator: UIValidator | undefined): void {
  activeValidator = validator;
}
