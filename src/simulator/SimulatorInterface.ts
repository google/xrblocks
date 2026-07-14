import * as THREE from 'three';
import {GamepadController} from '../input/GamepadController.js';
import {Input} from '../input/Input.js';
import {SimulatorControls} from './SimulatorControls.js';
import {ISimulatorSettingsPanelElement} from './interfaces/ISimulatorSettingsPanelElement.js';
import {SimulatorHands} from './SimulatorHands.js';
import {SimulatorNavMesh} from './SimulatorNavMesh.js';
import {
  SimulatorCustomInstruction,
  SimulatorOptions,
} from './SimulatorOptions.js';
import {SimulatorScene} from './SimulatorScene.js';
import {SetSimulatorEnvironmentEvent} from './events/SimulatorEnvironmentEvents.js';
import {ShowSimulatorInstructionsEvent} from './events/SimulatorInstructionsEvents.js';

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
};

export class SimulatorInterface {
  private elements: HTMLElement[] = [];
  private interfaceVisible = true;
  private _gamepadToast?: GamepadToastElement;
  private _gamepadSettings?: GamepadSettingsElement;

  /**
   * Initialize the simulator interface.
   */
  init(
    simulatorOptions: SimulatorOptions,
    simulatorControls: SimulatorControls,
    simulatorHands: SimulatorHands,
    input?: Input,
    simulatorScene?: SimulatorScene,
    simulatorNavMesh?: SimulatorNavMesh
  ) {
    if (simulatorScene) {
      this.createSimulatorSettingsPanel(
        simulatorOptions,
        simulatorControls,
        simulatorScene,
        simulatorNavMesh
      );
    }
    this.showGeminiLivePanel(simulatorOptions);
    this.createHandPosePanel(simulatorOptions, simulatorHands);
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

  createSimulatorSettingsPanel(
    simulatorOptions: SimulatorOptions,
    simulatorControls: SimulatorControls,
    simulatorScene: SimulatorScene,
    simulatorNavMesh?: SimulatorNavMesh
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
      document.body.appendChild(settingsElement);
      simulatorControls.setSimulatorSettingsPanelElement(settingsElement);
      settingsElement.addEventListener(
        SetSimulatorEnvironmentEvent.type,
        (event: Event) => {
          if (event instanceof SetSimulatorEnvironmentEvent) {
            simulatorOptions.activeEnvironmentIndex = event.environmentIndex;
            const activeEnv =
              simulatorOptions.environments[event.environmentIndex];
            simulatorScene.setEnvironment(
              activeEnv?.scenePath ?? null,
              new THREE.Vector3(
                simulatorOptions.initialScenePosition.x,
                simulatorOptions.initialScenePosition.y,
                simulatorOptions.initialScenePosition.z
              )
            );
            void simulatorNavMesh?.setEnvironment(
              activeEnv ?? null,
              simulatorOptions
            );
          }
        }
      );
      settingsElement.addEventListener(
        ShowSimulatorInstructionsEvent.type,
        () => {
          this.showInstructions(simulatorOptions);
        }
      );
      this.elements.push(settingsElement);
    }
  }

  showInstructions(simulatorOptions: SimulatorOptions) {
    if (simulatorOptions.instructions.enabled) {
      if (document.querySelector(simulatorOptions.instructions.element)) {
        return; // Already showing
      }
      const element = document.createElement(
        simulatorOptions.instructions.element
      ) as SimulatorInstructionsHTMLElement;
      element.customInstructions =
        simulatorOptions.instructions.customInstructions;
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
    gp.addEventListener('connected', () => {
      if (!gp.hasShownToast) {
        gp.hasShownToast = true;
        this.showGamepadToast(gp);
      }
    });
    gp.onOpenSettings = () => this.toggleGamepadSettings(gp);
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
