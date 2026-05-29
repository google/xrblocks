import * as THREE from 'three';

import {Handedness} from '../input/Hands';
import {Input} from '../input/Input';
import {Keycodes} from '../utils/Keycodes';

import {SimulatorControllerMode} from './controlModes/SimulatorControllerMode';
import {SimulatorControlMode} from './controlModes/SimulatorControlMode';
import {SimulatorPoseMode} from './controlModes/SimulatorPoseMode';
import {SimulatorUserMode} from './controlModes/SimulatorUserMode';
import {SetSimulatorModeEvent} from './events/SimulatorModeEvents';
import {SimulatorRenderMode} from './SimulatorConstants';
import {SimulatorControllerState} from './SimulatorControllerState';
import {SimulatorHands} from './SimulatorHands';
import {SimulatorInterface} from './SimulatorInterface';
import {SimulatorMode, SimulatorOptions} from './SimulatorOptions';
import {ISimulatorSettingsPanelElement} from './interfaces/ISimulatorSettingsPanelElement';

function preventDefault(event: Event) {
  event.preventDefault();
}

export class SimulatorControls {
  pointerDown = false;
  downKeys = new Set<Keycodes>();

  // Custom HTML element for simulator settings.
  simulatorSettingsPanelElement?: ISimulatorSettingsPanelElement;

  simulatorMode = SimulatorMode.USER;

  simulatorModeControls: SimulatorControlMode;
  simulatorModes: {[key: string]: SimulatorControlMode};
  renderer!: THREE.WebGLRenderer;
  private simulatorOptions?: SimulatorOptions;
  #enabled = true;
  get enabled() {
    return this.#enabled;
  }
  set enabled(value) {
    this.setEnabled(value);
  }

  /**
   * Create the simulator controls.
   * @param hands - The simulator hands manager.
   * @param setStereoRenderMode - A function to set the stereo mode.
   * @param userInterface - The simulator user interface manager.
   */
  constructor(
    public simulatorControllerState: SimulatorControllerState,
    public hands: SimulatorHands,
    setStereoRenderMode: (_: SimulatorRenderMode) => void,
    private userInterface: SimulatorInterface
  ) {
    const toggleUserInterface = () => {
      this.userInterface.toggleInterfaceVisible();
    };
    const cycleSimulatorMode = () => {
      if (!this.simulatorOptions) return;
      this.setSimulatorMode(
        this.simulatorOptions.modeToggle.toggleOrder[this.simulatorMode]
      );
    };
    this.simulatorModes = {
      [SimulatorMode.USER]: new SimulatorUserMode(
        this.simulatorControllerState,
        this.downKeys,
        hands,
        setStereoRenderMode,
        toggleUserInterface,
        cycleSimulatorMode
      ),
      [SimulatorMode.POSE]: new SimulatorPoseMode(
        this.simulatorControllerState,
        this.downKeys,
        hands,
        setStereoRenderMode,
        toggleUserInterface,
        cycleSimulatorMode
      ),
      [SimulatorMode.CONTROLLER]: new SimulatorControllerMode(
        this.simulatorControllerState,
        this.downKeys,
        hands,
        setStereoRenderMode,
        toggleUserInterface,
        cycleSimulatorMode
      ),
    };

    this.simulatorModeControls = this.simulatorModes[this.simulatorMode];
  }

  /**
   * Initialize the simulator controls.
   */
  init({
    camera,
    input,
    timer,
    renderer,
    simulatorOptions,
  }: {
    camera: THREE.Camera;
    input: Input;
    timer: THREE.Timer;
    renderer: THREE.WebGLRenderer;
    simulatorOptions: SimulatorOptions;
  }) {
    for (const mode in this.simulatorModes) {
      this.simulatorModes[mode].init({camera, input, timer});
    }
    this.renderer = renderer;
    this.setSimulatorMode(simulatorOptions.defaultMode);
    this.simulatorControllerState.currentControllerIndex =
      simulatorOptions.defaultHand === Handedness.LEFT ? 0 : 1;
    this.simulatorOptions = simulatorOptions;
    this.connect();
  }

  connect() {
    const domElement = this.renderer.domElement;
    document.addEventListener('keyup', this.onKeyUp);
    document.addEventListener('keydown', this.onKeyDown);
    domElement.addEventListener('pointermove', this.onPointerMove);
    domElement.addEventListener('pointerdown', this.onPointerDown);
    domElement.addEventListener('pointerup', this.onPointerUp);
    domElement.addEventListener('contextmenu', preventDefault);
    window.addEventListener('blur', this.onBlur);
    document.addEventListener('visibilitychange', this.onBlur);
  }

  update() {
    this.simulatorModeControls.update();
  }

  onPointerMove = (event: MouseEvent) => {
    if (!this.enabled) return;
    this.simulatorModeControls.onPointerMove(event);
  };

  onPointerDown = (event: MouseEvent) => {
    if (!this.enabled) return;
    this.simulatorModeControls.onPointerDown(event);
    this.pointerDown = true;
  };

  onPointerUp = (event: MouseEvent) => {
    if (!this.enabled) return;
    this.simulatorModeControls.onPointerUp(event);
    this.pointerDown = false;
  };

  onKeyDown = (event: KeyboardEvent) => {
    if (!this.enabled) return;
    // On macOS, keyup events are not fired for keys held when Command (Meta)
    // is pressed. Clear all keys to prevent stuck movement.
    if (
      event.metaKey ||
      event.code === 'MetaLeft' ||
      event.code === 'MetaRight'
    ) {
      this.downKeys.clear();
      return;
    }
    this.downKeys.add(event.code as Keycodes);
    if (
      this.simulatorOptions?.modeToggle.enabled &&
      event.code === this.simulatorOptions.modeToggle.toggleKey
    ) {
      this.setSimulatorMode(
        this.simulatorOptions.modeToggle.toggleOrder[this.simulatorMode]
      );
    }
    this.simulatorModeControls.onKeyDown(event);
  };

  onKeyUp = (event: KeyboardEvent) => {
    if (!this.enabled) return;
    this.downKeys.delete(event.code as Keycodes);
  };

  onBlur = () => {
    this.downKeys.clear();
  };

  setSimulatorMode(mode: SimulatorMode) {
    this.simulatorMode = mode;
    this.simulatorModeControls.onModeDeactivated();
    this.simulatorModeControls = this.simulatorModes[this.simulatorMode];
    this.simulatorModeControls.onModeActivated();
    if (this.simulatorSettingsPanelElement) {
      this.simulatorSettingsPanelElement.simulatorMode = mode;
    }
  }

  setSimulatorSettingsPanelElement(element: ISimulatorSettingsPanelElement) {
    element.simulatorMode = this.simulatorMode;
    element.addEventListener('setSimulatorMode', (event) => {
      if (event instanceof SetSimulatorModeEvent) {
        this.setSimulatorMode(event.simulatorMode);
      }
    });
    this.simulatorSettingsPanelElement = element;
  }

  setEnabled(value: boolean) {
    if (value == this.#enabled) {
      return;
    }
    this.#enabled = value;
    if (!value) {
      this.downKeys.clear();
    }
  }
}
