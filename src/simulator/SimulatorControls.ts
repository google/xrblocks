import * as THREE from 'three';

import {Handedness} from '../input/Hands';
import {Input} from '../input/Input';
import {Keycodes} from '../utils/Keycodes';

import {SimulatorControllerMode} from './controlModes/SimulatorControllerMode'
import {SimulatorControlMode} from './controlModes/SimulatorControlMode';
import {SimulatorPoseMode} from './controlModes/SimulatorPoseMode';
import {SimulatorUserMode} from './controlModes/SimulatorUserMode';
import {SetSimulatorModeEvent} from './events/SimulatorModeEvents';
import {SimulatorRenderMode} from './SimulatorConstants';
import {SimulatorControllerState} from './SimulatorControllerState';
import {SimulatorHands} from './SimulatorHands';
import {SimulatorInterface} from './SimulatorInterface';
import {NEXT_SIMULATOR_MODE, SimulatorMode, SimulatorOptions} from './SimulatorOptions';

function preventDefault(event: Event) {
  event.preventDefault();
}

export type SimulatorModeIndicatorElement = HTMLElement&{
  simulatorMode: SimulatorMode;
}

export class SimulatorControls {
  pointerDown = false;
  downKeys = new Set<Keycodes>();

  // Custom HTML element indicating the simulator control mode.
  modeIndicatorElement?: SimulatorModeIndicatorElement;

  simulatorMode = SimulatorMode.USER;

  simulatorModeControls: SimulatorControlMode;
  simulatorModes: {[key: string]: SimulatorControlMode};
  renderer!: THREE.WebGLRenderer;

  private _onPointerDown = this.onPointerDown.bind(this);
  private _onPointerUp = this.onPointerUp.bind(this);
  private _onKeyDown = this.onKeyDown.bind(this);
  private _onKeyUp = this.onKeyUp.bind(this);
  private _onPointerMove = this.onPointerMove.bind(this);

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
      private userInterface: SimulatorInterface) {
    const toggleUserInterface = () => {
      this.userInterface.toggleInterfaceVisible();
    };
    this.simulatorModes = {
      [SimulatorMode.USER]: new SimulatorUserMode(
          this.simulatorControllerState, this.downKeys, hands,
          setStereoRenderMode, toggleUserInterface),
      [SimulatorMode.POSE]: new SimulatorPoseMode(
          this.simulatorControllerState, this.downKeys, hands,
          setStereoRenderMode, toggleUserInterface),
      [SimulatorMode.CONTROLLER]: new SimulatorControllerMode(
          this.simulatorControllerState, this.downKeys, hands,
          setStereoRenderMode, toggleUserInterface),
    };

    this.simulatorModeControls = this.simulatorModes[this.simulatorMode];
  }

  /**
   * Initialize the simulator controls.
   */
  init({camera, input, timer, renderer, simulatorOptions}: {
    camera: THREE.Camera,
    input: Input,
    timer: THREE.Timer,
    renderer: THREE.WebGLRenderer,
    simulatorOptions: SimulatorOptions
  }) {
    for (const mode in this.simulatorModes) {
      this.simulatorModes[mode].init({camera, input, timer});
    }
    this.renderer = renderer;
    this.setSimulatorMode(simulatorOptions.defaultMode);
    this.simulatorControllerState.currentControllerIndex =
        simulatorOptions.defaultHand === Handedness.LEFT ? 0 : 1;
    this.connect();
  }

  connect() {
    const domElement = this.renderer.domElement;
    document.addEventListener('keyup', this._onKeyUp);
    document.addEventListener('keydown', this._onKeyDown);
    domElement.addEventListener('pointermove', this._onPointerMove);
    domElement.addEventListener('pointerdown', this._onPointerDown);
    domElement.addEventListener('pointerup', this._onPointerUp);
    domElement.addEventListener('contextmenu', preventDefault);
  }

  update() {
    this.simulatorModeControls.update();
  }


  onPointerMove(event: MouseEvent) {
    this.simulatorModeControls.onPointerMove(event);
  }

  onPointerDown(event: MouseEvent) {
    this.simulatorModeControls.onPointerDown(event);
    this.pointerDown = true;
  }

  onPointerUp(event: MouseEvent) {
    this.simulatorModeControls.onPointerUp(event);
    this.pointerDown = false;
  }

  onKeyDown(event: KeyboardEvent) {
    this.downKeys.add(event.code as Keycodes);
    if (event.code == Keycodes.LEFT_SHIFT_CODE) {
      this.setSimulatorMode(NEXT_SIMULATOR_MODE[this.simulatorMode]);
    }
    this.simulatorModeControls.onKeyDown(event);
  }

  onKeyUp(event: KeyboardEvent) {
    this.downKeys.delete(event.code as Keycodes);
  }

  setSimulatorMode(mode: SimulatorMode) {
    this.simulatorMode = mode;
    this.simulatorModeControls.onModeDeactivated();
    this.simulatorModeControls = this.simulatorModes[this.simulatorMode];
    this.simulatorModeControls.onModeActivated();
    if (this.modeIndicatorElement) {
      this.modeIndicatorElement.simulatorMode = mode;
    }
  }

  setModeIndicatorElement(element: SimulatorModeIndicatorElement) {
    element.simulatorMode = this.simulatorMode;
    element.addEventListener('setSimulatorMode', (event) => {
      if (event instanceof SetSimulatorModeEvent) {
        this.setSimulatorMode(event.simulatorMode);
      }
    });
    this.modeIndicatorElement = element;
  }
}
