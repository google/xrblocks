import * as THREE from 'three';

import {Handedness} from '../input/Hands';
import {Input} from '../input/Input';
import {Interaction} from '../interaction/Interaction';
import {Keycodes} from '../utils/Keycodes';

import {SimulatorControllerMode} from './controlModes/SimulatorControllerMode';
import {SimulatorControlMode} from './controlModes/SimulatorControlMode';
import {SimulatorEditorMode} from './controlModes/SimulatorEditorMode';
import {SimulatorPoseMode} from './controlModes/SimulatorPoseMode';
import {SimulatorPointerLockMode} from './controlModes/SimulatorPointerLockMode';
import {SimulatorUserMode} from './controlModes/SimulatorUserMode';
import {SetSimulatorModeEvent} from './events/SimulatorModeEvents';
import {SimulatorRenderMode} from './SimulatorConstants';
import {SimulatorControllerState} from './SimulatorControllerState';
import {SimulatorHands} from './SimulatorHands';
import {SimulatorInterface} from './SimulatorInterface';
import {SimulatorMode, SimulatorOptions} from './SimulatorOptions';
import {SimulatorNavMesh} from './scene/SimulatorNavMesh';
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
  renderer?: THREE.WebGLRenderer;
  private simulatorOptions?: SimulatorOptions;
  private activePointerId?: number;
  private connected = false;
  private initialized = false;
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
    public navMesh: SimulatorNavMesh,
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
        navMesh,
        setStereoRenderMode,
        toggleUserInterface,
        cycleSimulatorMode
      ),
      [SimulatorMode.POSE]: new SimulatorPoseMode(
        this.simulatorControllerState,
        this.downKeys,
        hands,
        navMesh,
        setStereoRenderMode,
        toggleUserInterface,
        cycleSimulatorMode
      ),
      [SimulatorMode.CONTROLLER]: new SimulatorControllerMode(
        this.simulatorControllerState,
        this.downKeys,
        hands,
        navMesh,
        setStereoRenderMode,
        toggleUserInterface,
        cycleSimulatorMode
      ),
      [SimulatorMode.POINTER_LOCK]: new SimulatorPointerLockMode(
        this.simulatorControllerState,
        this.downKeys,
        hands,
        navMesh,
        setStereoRenderMode,
        toggleUserInterface,
        cycleSimulatorMode
      ),
      [SimulatorMode.EDITOR]: new SimulatorEditorMode(
        this.simulatorControllerState,
        this.downKeys,
        hands,
        navMesh,
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
    interaction,
    timer,
    renderer,
    simulatorOptions,
  }: {
    camera: THREE.Camera;
    input: Input;
    interaction: Interaction;
    timer: THREE.Timer;
    renderer: THREE.WebGLRenderer;
    simulatorOptions: SimulatorOptions;
  }) {
    for (const mode in this.simulatorModes) {
      this.simulatorModes[mode].init({
        camera,
        input,
        interaction,
        timer,
        domElement: renderer.domElement,
        simulatorOptions,
      });
    }
    this.renderer = renderer;
    this.setSimulatorMode(simulatorOptions.defaultMode);
    this.simulatorControllerState.currentControllerIndex =
      simulatorOptions.defaultHand === Handedness.LEFT ? 0 : 1;
    this.simulatorOptions = simulatorOptions;
    this.initialized = true;
    this.connect();
  }

  connect() {
    if (this.connected) return;
    const domElement = this.renderer?.domElement;
    if (!domElement) throw new Error('SimulatorControls is not initialized.');
    document.addEventListener('keyup', this.onKeyUp);
    document.addEventListener('keydown', this.onKeyDown);
    domElement.addEventListener('pointermove', this.onPointerMove);
    domElement.addEventListener('pointerdown', this.onPointerDown);
    domElement.addEventListener('pointerup', this.onPointerUp);
    domElement.addEventListener('pointercancel', this.onPointerCancel);
    domElement.addEventListener(
      'lostpointercapture',
      this.onLostPointerCapture
    );
    domElement.addEventListener('wheel', this.onWheel, {passive: false});
    domElement.addEventListener('contextmenu', preventDefault);
    window.addEventListener('blur', this.onBlur);
    document.addEventListener('visibilitychange', this.onBlur);
    this.connected = true;
  }

  disconnect() {
    if (!this.connected) return;
    const domElement = this.renderer?.domElement;
    if (!domElement) {
      this.connected = false;
      return;
    }
    document.removeEventListener('keyup', this.onKeyUp);
    document.removeEventListener('keydown', this.onKeyDown);
    domElement.removeEventListener('pointermove', this.onPointerMove);
    domElement.removeEventListener('pointerdown', this.onPointerDown);
    domElement.removeEventListener('pointerup', this.onPointerUp);
    domElement.removeEventListener('pointercancel', this.onPointerCancel);
    domElement.removeEventListener(
      'lostpointercapture',
      this.onLostPointerCapture
    );
    domElement.removeEventListener('wheel', this.onWheel);
    domElement.removeEventListener('contextmenu', preventDefault);
    window.removeEventListener('blur', this.onBlur);
    document.removeEventListener('visibilitychange', this.onBlur);
    this.connected = false;
    this.onBlur();
  }

  update() {
    this.simulatorModeControls.update();
  }

  onPointerMove = (event: MouseEvent) => {
    if (!this.enabled) return;
    this.simulatorModeControls.onPointerMove(event);
  };

  onPointerDown = (event: PointerEvent) => {
    if (!this.enabled) return;
    this.simulatorModeControls.onPointerDown(event);
    this.pointerDown = true;
    this.activePointerId = event.pointerId;
    this.renderer?.domElement.setPointerCapture?.(event.pointerId);
  };

  onPointerUp = (event: PointerEvent) => {
    if (!this.enabled) return;
    this.endPointerInteraction(event);
    this.releasePointerCapture(event.pointerId);
  };

  onPointerCancel = (event: PointerEvent) => {
    this.endPointerInteraction(event);
    this.releasePointerCapture(event.pointerId);
  };

  onLostPointerCapture = (event: PointerEvent) => {
    if (event.pointerId !== this.activePointerId) return;
    this.activePointerId = undefined;
    this.endPointerInteraction(event);
  };

  onWheel = (event: WheelEvent) => {
    if (!this.enabled) return;
    if (this.simulatorModeControls.onWheel(event)) {
      event.preventDefault();
    }
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
    this.cancelPointerInteraction();
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
    this.simulatorSettingsPanelElement?.removeEventListener(
      'setSimulatorMode',
      this.onSetSimulatorMode
    );
    element.simulatorMode = this.simulatorMode;
    element.addEventListener('setSimulatorMode', this.onSetSimulatorMode);
    this.simulatorSettingsPanelElement = element;
  }

  private onSetSimulatorMode = (event: Event) => {
    if (event instanceof SetSimulatorModeEvent) {
      this.setSimulatorMode(event.simulatorMode);
    }
  };

  dispose() {
    this.disconnect();
    if (this.initialized) {
      this.simulatorModeControls.onModeDeactivated();
      this.initialized = false;
    }
    this.simulatorSettingsPanelElement?.removeEventListener(
      'setSimulatorMode',
      this.onSetSimulatorMode
    );
    this.simulatorSettingsPanelElement = undefined;
    this.simulatorOptions = undefined;
    this.setEnabled(false);
    this.renderer = undefined;
  }

  setEnabled(value: boolean) {
    if (value == this.#enabled) {
      return;
    }
    this.#enabled = value;
    if (!value) {
      this.downKeys.clear();
      this.cancelPointerInteraction();
    }
  }

  private cancelPointerInteraction() {
    if (!this.pointerDown && this.activePointerId === undefined) return;
    this.endPointerInteraction(new MouseEvent('mouseup'));
    this.releasePointerCapture();
  }

  private endPointerInteraction(event: MouseEvent) {
    this.simulatorModeControls.onPointerUp(event);
    this.pointerDown = false;
  }

  private releasePointerCapture(pointerId = this.activePointerId) {
    if (pointerId === undefined) return;
    const domElement = this.renderer?.domElement;
    if (!domElement) return;
    if (pointerId === this.activePointerId) {
      this.activePointerId = undefined;
    }
    if (domElement.hasPointerCapture?.(pointerId)) {
      domElement.releasePointerCapture(pointerId);
    }
  }
}
