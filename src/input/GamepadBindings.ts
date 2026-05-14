const STORAGE_KEY = 'xrblocks:simulator:gamepad-bindings:v1';

export type GamepadAction =
  | 'select'
  | 'cycleHandPoseLeft'
  | 'cycleHandPoseRight'
  | 'cycleSimulatorMode'
  | 'toggleUI'
  | 'toggleHand'
  | 'moveDown'
  | 'moveUp'
  | 'openSettings';

const DEFAULT_BINDINGS: Record<GamepadAction, number> = {
  select: 0, // A / Cross
  cycleHandPoseLeft: 14, // D-pad left
  cycleHandPoseRight: 15, // D-pad right
  cycleSimulatorMode: 3, // Y
  toggleUI: 5, // RB / R1
  toggleHand: 4, // LB / L1
  moveUp: 6, // LT (analog) — matches keyboard Q
  moveDown: 7, // RT (analog) — matches keyboard E
  openSettings: 9, // Start / Menu
};

/**
 * Manages gamepad button-to-action mappings with localStorage persistence.
 * One button per action — assigning a button removes it from any previous action.
 */
export class GamepadBindings {
  private bindings: Record<GamepadAction, number>;

  constructor() {
    this.bindings = {...DEFAULT_BINDINGS};
    this.load();
  }

  getBinding(action: GamepadAction): number {
    return this.bindings[action];
  }

  getAllBindings(): Record<GamepadAction, number> {
    return {...this.bindings};
  }

  setBinding(action: GamepadAction, buttonIndex: number) {
    // openSettings must always be bound so users can never lock themselves
    // out of the menu — silently ignore attempts to rebind or unbind it,
    // and refuse to assign its button to any other action.
    if (action === 'openSettings') return;
    if (buttonIndex === this.bindings.openSettings) return;
    // Auto-unbind any other action using this button, except openSettings
    // (same lock-out reason).
    for (const key of Object.keys(this.bindings) as GamepadAction[]) {
      if (
        key !== action &&
        key !== 'openSettings' &&
        this.bindings[key] === buttonIndex
      ) {
        this.bindings[key] = -1;
      }
    }
    this.bindings[action] = buttonIndex;
    this.save();
  }

  resetDefaults() {
    this.bindings = {...DEFAULT_BINDINGS};
    this.save();
  }

  private load() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw);
      if (parsed?.version !== 1 || typeof parsed.bindings !== 'object') return;
      for (const key of Object.keys(DEFAULT_BINDINGS) as GamepadAction[]) {
        if (typeof parsed.bindings[key] === 'number') {
          this.bindings[key] = parsed.bindings[key];
        }
      }
    } catch {
      // localStorage unavailable or corrupted — keep defaults.
    }
  }

  private save() {
    try {
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({version: 1, bindings: this.bindings})
      );
    } catch {
      // localStorage unavailable — silently continue.
    }
  }
}
