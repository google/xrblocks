import {GamepadController} from '../input/GamepadController.js';
import {Input} from '../input/Input.js';
import {SimulatorControls} from './SimulatorControls.js';
import {ISimulatorSettingsPanelElement} from './interfaces/ISimulatorSettingsPanelElement.js';
import {SimulatorHands} from './SimulatorHands.js';
import type {
  SimulatorCustomInstruction,
  SimulatorEnvironment,
  SimulatorMode,
  SimulatorOptions,
} from './SimulatorOptions.js';
import {SetSimulatorEnvironmentEvent} from './events/SimulatorEnvironmentEvents.js';
import {ShowSimulatorInstructionsEvent} from './events/SimulatorInstructionsEvents.js';
import {
  SetSimulatorDayNightEvent,
  SetSimulatorTimeOfDayEvent,
} from './events/SimulatorLightingEvents.js';
import {SetSimulatorHandPhysicsEvent} from './events/SimulatorPhysicsEvents.js';

/**
 * Callbacks that gate the lazily-loaded day/night lighting behind the
 * simulator settings UI: nothing loads until the user enables it.
 */
export interface SimulatorLightingBinding {
  isAvailable: () => boolean;
  isEnabled: () => boolean;
  getTimeOfDay: () => number;
  setEnabled: (enabled: boolean) => Promise<void> | void;
  setTimeOfDay: (timeOfDay: number) => void;
}

type SimulatorElementsLoader = () => Promise<unknown>;

function loadSimulatorElements() {
  return import('./internal/interface/SimulatorElements.js');
}

/** Minimal interface for the gamepad toast element. */
interface GamepadToastElement extends HTMLElement {
  show(controls: Record<string, string>, duration?: number): void;
  flash(message: string, duration?: number): void;
  dismiss(): void;
}

/** Minimal interface for the gamepad settings element. */
interface GamepadSettingsElement extends HTMLElement {
  bindings: unknown;
  gamepadController: unknown;
  show(): void;
  hide(): void;
}

/** Standard gamepad button names for display. */
const BUTTON_NAMES: Record<number, string> = {
  0: 'A',
  1: 'B',
  2: 'X',
  3: 'Y',
  4: 'LB',
  5: 'RB',
  6: 'LT',
  7: 'RT',
  8: 'Back',
  9: 'Start',
  10: 'L3',
  11: 'R3',
  12: 'D-Up',
  13: 'D-Down',
  14: 'D-Left',
  15: 'D-Right',
};

function btnName(index: number): string {
  return BUTTON_NAMES[index] ?? `Btn ${index}`;
}

type SimulatorInstructionsHTMLElement = HTMLElement & {
  customInstructions: SimulatorCustomInstruction[];
  simulatorMode?: SimulatorMode;
};

type SimulatorOverlayInstructionsHTMLElement = HTMLElement & {
  simulatorMode: SimulatorMode;
  visible: boolean;
};

export class SimulatorInterface {
  private elements: HTMLElement[] = [];
  private interfaceVisible = true;
  private _gamepadToast?: GamepadToastElement;
  private _gamepadSettings?: GamepadSettingsElement;
  private gamepadController?: GamepadController;
  private simulatorHands?: SimulatorHands;
  private elementsAvailable?: Promise<boolean>;
  private settingsElement?: ISimulatorSettingsPanelElement;
  private lighting?: SimulatorLightingBinding;
  private overlayInstructionsElement?: SimulatorOverlayInstructionsHTMLElement;
  private overlayFadeInTimer?: ReturnType<typeof setTimeout>;
  private overlayRemoveTimer?: ReturnType<typeof setTimeout>;
  private hasUserInteracted = false;
  private simulatorOptions?: SimulatorOptions;

  constructor(
    private readonly simulatorElementsLoader: SimulatorElementsLoader = loadSimulatorElements
  ) {}

  /**
   * Initialize the simulator interface.
   */
  async init(
    simulatorOptions: SimulatorOptions,
    simulatorControls: SimulatorControls,
    simulatorHands: SimulatorHands,
    input?: Input,
    setEnvironment?: (environment: SimulatorEnvironment) => Promise<void>,
    handPhysicsAvailable = false,
    lighting?: SimulatorLightingBinding
  ) {
    this.lighting = lighting;
    this.simulatorOptions = simulatorOptions;
    this.hasUserInteracted = false;
    this.clearOverlayTimers();
    if (!(await this.ensureElementsAvailable())) return;

    if (setEnvironment) {
      this.createSimulatorSettingsPanel(
        simulatorOptions,
        simulatorControls,
        setEnvironment,
        handPhysicsAvailable,
        lighting
      );
    }
    this.showGeminiLivePanel(simulatorOptions);
    this.createHandPosePanel(simulatorOptions, simulatorHands);
    this.createOverlayInstructions(
      simulatorOptions,
      simulatorControls.simulatorMode
    );
    this.simulatorHands = simulatorHands;
    simulatorHands.onHandednessChanged = (handedness) => {
      this._ensureGamepadToast().flash(
        `Active Hand: ${handedness === 'left' ? 'Left' : 'Right'}`
      );
    };
    if (simulatorOptions.instructions.showAutomatically) {
      this.showInstructions(simulatorOptions);
    }
    if (input) this._initGamepadUI(input);
  }

  private ensureElementsAvailable(): Promise<boolean> {
    this.elementsAvailable ??= this.simulatorElementsLoader()
      .then(() => true)
      .catch((error: unknown) => {
        console.info(
          'The simulator interface was not shown because Lit is not available. Add "lit" and "lit/" to the import map to enable it.',
          error
        );
        return false;
      });
    return this.elementsAvailable;
  }

  createSimulatorSettingsPanel(
    simulatorOptions: SimulatorOptions,
    simulatorControls: SimulatorControls,
    setEnvironment: (environment: SimulatorEnvironment) => Promise<void>,
    handPhysicsAvailable: boolean,
    lighting?: SimulatorLightingBinding
  ) {
    if (simulatorOptions.simulatorSettingsPanel.enabled) {
      const settingsElement = document.createElement(
        simulatorOptions.simulatorSettingsPanel.element
      ) as ISimulatorSettingsPanelElement;
      settingsElement.environments = simulatorOptions.environments;
      settingsElement.activeEnvironmentIndex =
        simulatorOptions.activeEnvironmentIndex;
      settingsElement.instructionsEnabled =
        simulatorOptions.instructions.enabled;
      settingsElement.handPhysicsAvailable = handPhysicsAvailable;
      settingsElement.handPhysicsEnabled = simulatorOptions.handPhysics.enabled;
      this.settingsElement = settingsElement;
      this.syncLightingState();
      document.body.appendChild(settingsElement);
      simulatorControls.setSimulatorSettingsPanelElement(settingsElement);
      settingsElement.addEventListener(
        SetSimulatorEnvironmentEvent.type,
        (event: Event) => {
          if (event instanceof SetSimulatorEnvironmentEvent) {
            const environment =
              simulatorOptions.environments[event.environmentIndex];
            if (!environment) {
              console.error(
                `Simulator environment index ${event.environmentIndex} does not exist.`
              );
              return;
            }
            void setEnvironment(environment).catch((error) => {
              console.error('Failed to switch simulator environment.', error);
            });
          }
        }
      );
      settingsElement.addEventListener(
        SetSimulatorDayNightEvent.type,
        (event: Event) => {
          if (event instanceof SetSimulatorDayNightEvent && lighting) {
            void Promise.resolve(lighting.setEnabled(event.enabled)).then(
              () => {
                this.syncLightingState();
              }
            );
          }
        }
      );
      settingsElement.addEventListener(
        SetSimulatorTimeOfDayEvent.type,
        (event: Event) => {
          if (event instanceof SetSimulatorTimeOfDayEvent) {
            lighting?.setTimeOfDay(event.timeOfDay);
          }
        }
      );
      settingsElement.addEventListener(
        ShowSimulatorInstructionsEvent.type,
        (event: Event) => {
          const mode =
            event instanceof ShowSimulatorInstructionsEvent
              ? event.simulatorMode
              : undefined;
          this.showInstructions(simulatorOptions, mode);
        }
      );
      settingsElement.addEventListener(
        SetSimulatorHandPhysicsEvent.type,
        (event: Event) => {
          if (event instanceof SetSimulatorHandPhysicsEvent) {
            simulatorOptions.handPhysics.enabled = event.enabled;
          }
        }
      );
      this.elements.push(settingsElement);
    }
  }

  /**
   * Re-reads the day/night lighting binding into the settings panel. Called
   * after environment switches (the environment may declare lighting or not),
   * after enable/disable, and after API-driven changes so the slider can
   * never show a time of day the simulator is not actually at.
   */
  syncLightingState() {
    const element = this.settingsElement;
    const lighting = this.lighting;
    if (!element || !lighting) return;
    element.dayNightAvailable = lighting.isAvailable();
    element.dayNightEnabled = lighting.isEnabled();
    element.timeOfDay = lighting.getTimeOfDay();
  }

  showInstructions(
    simulatorOptions: SimulatorOptions,
    simulatorMode?: SimulatorMode
  ) {
    if (simulatorOptions.instructions.enabled) {
      if (document.querySelector(simulatorOptions.instructions.element)) {
        return; // Already showing
      }
      const element = document.createElement(
        simulatorOptions.instructions.element
      ) as SimulatorInstructionsHTMLElement;
      element.customInstructions =
        simulatorOptions.instructions.customInstructions;
      element.simulatorMode = simulatorMode;
      document.body.appendChild(element);
      this.elements.push(element);
    }
  }

  showGeminiLivePanel(simulatorOptions: SimulatorOptions) {
    if (simulatorOptions.geminiLivePanel.enabled) {
      const element = document.createElement(
        simulatorOptions.geminiLivePanel.element
      );
      document.body.appendChild(element);
      this.elements.push(element);
    }
  }

  createHandPosePanel(
    simulatorOptions: SimulatorOptions,
    simulatorHands: SimulatorHands
  ) {
    if (simulatorOptions.handPosePanel.enabled) {
      const handsPanelElement = document.createElement(
        simulatorOptions.handPosePanel.element
      );
      document.body.appendChild(handsPanelElement);
      simulatorHands.setHandPosePanelElement(handsPanelElement);
      this.elements.push(handsPanelElement);
    }
  }

  createOverlayInstructions(
    simulatorOptions: SimulatorOptions,
    simulatorMode: SimulatorMode
  ) {
    if (
      simulatorOptions.instructions.enabled &&
      simulatorOptions.instructions.overlayEnabled
    ) {
      this.overlayInstructionsElement?.remove();
      const element = document.createElement(
        simulatorOptions.instructions.overlayElement
      ) as SimulatorOverlayInstructionsHTMLElement;
      element.simulatorMode = simulatorMode;
      element.visible = false;
      document.body.appendChild(element);
      this.overlayInstructionsElement = element;
      this.elements.push(element);
    }
  }

  /**
   * Starts the 5-second idle timer after the simulator finishes initializing.
   * If no user interaction occurs before the timer expires, the overlay
   * instructions fade in.
   */
  startOverlayInstructionsTimer(
    simulatorOptions: SimulatorOptions = this.simulatorOptions!,
    simulatorMode?: SimulatorMode
  ) {
    if (
      !simulatorOptions?.instructions.enabled ||
      !simulatorOptions.instructions.overlayEnabled ||
      this.hasUserInteracted
    ) {
      return;
    }
    this.simulatorOptions = simulatorOptions;
    if (simulatorMode && this.overlayInstructionsElement) {
      this.overlayInstructionsElement.simulatorMode = simulatorMode;
    }
    this.clearOverlayTimers();
    this.overlayFadeInTimer = setTimeout(() => {
      this.overlayFadeInTimer = undefined;
      if (!this.hasUserInteracted && this.overlayInstructionsElement) {
        this.overlayInstructionsElement.visible = true;
      }
    }, simulatorOptions.instructions.fadeInDelayMs);
  }

  /**
   * Notifies the interface that the user has interacted with the simulator.
   * Cancels the fade-in timer if the overlay has not yet appeared, or fades
   * the overlay out immediately.
   */
  notifyUserInteraction() {
    if (this.hasUserInteracted) return;
    this.hasUserInteracted = true;

    if (this.overlayFadeInTimer !== undefined) {
      clearTimeout(this.overlayFadeInTimer);
      this.overlayFadeInTimer = undefined;
      this.overlayInstructionsElement?.remove();
      this.overlayInstructionsElement = undefined;
      return;
    }

    if (this.overlayInstructionsElement) {
      this.overlayInstructionsElement.visible = false;
      this.overlayRemoveTimer = setTimeout(() => {
        this.overlayRemoveTimer = undefined;
        this.overlayInstructionsElement?.remove();
        this.overlayInstructionsElement = undefined;
      }, 500);
    }
  }

  setSimulatorMode(mode: SimulatorMode) {
    if (this.overlayInstructionsElement) {
      this.overlayInstructionsElement.simulatorMode = mode;
    }
  }

  private clearOverlayTimers() {
    if (this.overlayFadeInTimer !== undefined) {
      clearTimeout(this.overlayFadeInTimer);
      this.overlayFadeInTimer = undefined;
    }
    if (this.overlayRemoveTimer !== undefined) {
      clearTimeout(this.overlayRemoveTimer);
      this.overlayRemoveTimer = undefined;
    }
  }

  hideUiElements() {
    this.elements = this.elements.filter((el) => el.isConnected);
    for (const element of this.elements) {
      element.style.display = 'none';
    }
    this.interfaceVisible = false;
  }

  showUiElements() {
    this.elements = this.elements.filter((el) => el.isConnected);
    for (const element of this.elements) {
      element.style.display = '';
    }
    this.interfaceVisible = true;
  }

  getInterfaceVisible() {
    return !this.interfaceVisible;
  }

  toggleInterfaceVisible() {
    if (this.interfaceVisible) {
      this.hideUiElements();
    } else {
      this.showUiElements();
    }
  }

  private _initGamepadUI(input: Input) {
    const gp = input.gamepadController;
    this.gamepadController?.removeEventListener(
      'connected',
      this.onGamepadConnected
    );
    this.gamepadController = gp;
    gp.addEventListener('connected', this.onGamepadConnected);
    gp.onOpenSettings = () => this.toggleGamepadSettings(gp);
  }

  private onGamepadConnected = () => {
    const gp = this.gamepadController;
    if (!gp || gp.hasShownToast) return;
    gp.hasShownToast = true;
    this.showGamepadToast(gp);
  };

  dispose() {
    this.clearOverlayTimers();
    this.overlayInstructionsElement?.remove();
    this.overlayInstructionsElement = undefined;
    this.simulatorOptions = undefined;
    this.hasUserInteracted = false;
    if (this.gamepadController) {
      this.gamepadController.removeEventListener(
        'connected',
        this.onGamepadConnected
      );
      this.gamepadController.onOpenSettings = undefined;
      this.gamepadController = undefined;
    }
    if (this.simulatorHands) {
      this.simulatorHands.onHandednessChanged = undefined;
      this.simulatorHands = undefined;
    }
    for (const element of this.elements) element.remove();
    this.elements.length = 0;
    this._gamepadToast?.remove();
    this._gamepadToast = undefined;
    this._gamepadSettings?.remove();
    this._gamepadSettings = undefined;
  }

  private _ensureGamepadToast(): GamepadToastElement {
    if (!this._gamepadToast) {
      this._gamepadToast = document.createElement(
        'xrblocks-gamepad-toast'
      ) as GamepadToastElement;
      document.body.appendChild(this._gamepadToast);
    }
    return this._gamepadToast;
  }

  showGamepadToast(gp: GamepadController) {
    const toast = this._ensureGamepadToast();
    const b = gp.bindings;
    toast.show({
      'Left Stick': 'Move (or Hand in Controller mode)',
      'Right Stick': 'Look',
      [btnName(b.getBinding('moveUp')) +
      ' / ' +
      btnName(b.getBinding('moveDown'))]: 'Up / Down',
      [btnName(b.getBinding('select'))]: 'Select / Interact',
      [btnName(b.getBinding('cycleHandPoseLeft')) +
      ' / ' +
      btnName(b.getBinding('cycleHandPoseRight'))]: 'Cycle Hand Pose',
      [btnName(b.getBinding('cycleSimulatorMode'))]: 'Cycle Simulator Mode',
      [btnName(b.getBinding('toggleUI'))]: 'Toggle UI',
      [btnName(b.getBinding('toggleHand'))]: 'Swap Active Hand',
      [btnName(b.getBinding('openSettings'))]: 'Gamepad Settings',
    });
  }

  toggleGamepadSettings(gp: GamepadController) {
    if (!this._gamepadSettings) {
      this._gamepadSettings = document.createElement(
        'xrblocks-gamepad-settings'
      ) as GamepadSettingsElement;
      this._gamepadSettings.bindings = gp.bindings;
      this._gamepadSettings.gamepadController = gp;
      this._gamepadSettings.hidden = true;
      document.body.appendChild(this._gamepadSettings);
    }
    if (this._gamepadSettings.hidden) {
      this._gamepadSettings.show();
    } else {
      this._gamepadSettings.hide();
    }
  }
}
