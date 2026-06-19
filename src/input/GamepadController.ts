import * as THREE from 'three';

import {Script} from '../core/Script.js';

import {Controller} from './Controller.js';
import {GamepadBindings} from './GamepadBindings.js';

/** Defines the event map for the GamepadController's custom events. */
interface GamepadControllerEventMap extends THREE.Object3DEventMap {
  connected: {target: GamepadController};
  disconnected: {target: GamepadController};
  selectstart: {target: GamepadController};
  selectend: {target: GamepadController};
}

const DEADZONE = 0.15;

/**
 * Simulates an XR controller using a connected gamepad (Xbox/PS).
 * The controller ray always points forward from the camera center,
 * similar to GazeController but with button-driven selection.
 */
export class GamepadController
  extends Script<GamepadControllerEventMap>
  implements Controller
{
  static dependencies = {
    camera: THREE.Camera,
  };
  type = 'GamepadController';
  name = 'Gamepad Controller';

  userData = {id: 4, connected: false, selected: false};

  camera?: THREE.Camera;
  bindings = new GamepadBindings();

  /** The browser Gamepad object, refreshed each frame. */
  activeGamepad?: Gamepad | null;
  gamepad?: Gamepad;

  /** True if the toast has been shown this session. */
  hasShownToast = false;

  /** Callback set by SimulatorInterface for opening settings. */
  onOpenSettings?: () => void;

  /** When true, normal gamepad UI/select actions are suppressed (modal menu). */
  menuActive = false;

  private _prevButtons: boolean[] = [];
  private _risingEdges: boolean[] = [];
  private _captureCallback: ((buttonIndex: number) => void) | null = null;

  constructor() {
    super();
  }

  init({camera}: {camera: THREE.Camera}) {
    this.camera = camera;
  }

  /**
   * Enters capture mode — the next button press will invoke the callback
   * instead of triggering normal actions, then exit capture mode.
   */
  captureNextButtonPress(callback: (buttonIndex: number) => void) {
    this._captureCallback = callback;
  }

  cancelCapture() {
    this._captureCallback = null;
  }

  get captureActive(): boolean {
    return this._captureCallback !== null;
  }

  updatePose() {
    if (this.camera) {
      this.position.copy(this.camera.position);
      this.quaternion.copy(this.camera.quaternion);
      this.updateMatrixWorld();
    }
  }

  update() {
    super.update();

    const gp = this._pollGamepad();

    if (gp && !this.userData.connected) {
      this.activeGamepad = gp;
      this.gamepad = gp;
      this.dispatchEvent({type: 'connected', target: this});
    } else if (!gp && this.userData.connected) {
      this._onDisconnect();
      return;
    }

    if (!gp || !this.userData.connected) return;
    this.activeGamepad = gp;

    // Compute rising edges for this frame (before any consumption).
    for (let i = 0; i < gp.buttons.length; i++) {
      const down = gp.buttons[i]?.pressed ?? false;
      const wasDown = this._prevButtons[i] ?? false;
      this._risingEdges[i] = down && !wasDown;
    }

    this.updatePose();

    // Check for capture mode on any rising edge.
    if (this._captureCallback) {
      for (let i = 0; i < gp.buttons.length; i++) {
        if (this._risingEdges[i]) {
          const cb = this._captureCallback;
          this._captureCallback = null;
          cb(i);
          this._updatePrevButtons(gp);
          return; // Consume all input this frame.
        }
      }
    }

    // Normal select handling via bindings (suppressed when a modal menu is
    // active so A-button activates UI rather than firing scene selects).
    if (!this.menuActive) {
      const selectBtn = this.bindings.getBinding('select');
      const selectDown = gp.buttons[selectBtn]?.pressed ?? false;
      const selectWas = this._prevButtons[selectBtn] ?? false;
      if (selectDown && !selectWas) this.callSelectStart();
      if (!selectDown && selectWas) this.callSelectEnd();
    }

    this._updatePrevButtons(gp);
  }

  callSelectStart() {
    this.dispatchEvent({type: 'selectstart', target: this});
  }

  callSelectEnd() {
    this.dispatchEvent({type: 'selectend', target: this});
  }

  connect() {
    this.dispatchEvent({type: 'connected', target: this});
  }

  disconnect() {
    this.dispatchEvent({type: 'disconnected', target: this});
  }

  /**
   * Returns the axes of the active gamepad with deadzone applied.
   * [leftX, leftY, rightX, rightY]
   */
  getAxes(): [number, number, number, number] {
    const gp = this.activeGamepad;
    if (!gp) return [0, 0, 0, 0];
    return [
      GamepadController.applyDeadzone(gp.axes[0] ?? 0),
      GamepadController.applyDeadzone(gp.axes[1] ?? 0),
      GamepadController.applyDeadzone(gp.axes[2] ?? 0),
      GamepadController.applyDeadzone(gp.axes[3] ?? 0),
    ];
  }

  static applyDeadzone(value: number): number {
    if (!Number.isFinite(value)) return 0;
    if (Math.abs(value) < DEADZONE) return 0;
    const sign = Math.sign(value);
    return sign * ((Math.abs(value) - DEADZONE) / (1 - DEADZONE));
  }

  /**
   * Returns the analog value (0..1) of the given button index, or 0 if
   * unbound or no gamepad. Useful for triggers (which expose .value).
   */
  getButtonValue(index: number): number {
    if (index < 0) return 0;
    return this.activeGamepad?.buttons[index]?.value ?? 0;
  }

  /**
   * Returns the analog values of the left and right triggers (LT, RT) on a
   * standard-mapped gamepad, in [0, 1]. Returns [0, 0] when no gamepad.
   */
  getTriggers(): [number, number] {
    const gp = this.activeGamepad;
    if (!gp) return [0, 0];
    return [gp.buttons[6]?.value ?? 0, gp.buttons[7]?.value ?? 0];
  }

  /**
   * Returns true if the given button index had a rising edge this frame.
   * Safe to call from any update order — uses pre-computed edges.
   */
  isButtonJustPressed(buttonIndex: number): boolean {
    return this._risingEdges[buttonIndex] ?? false;
  }

  private _updatePrevButtons(gp: Gamepad) {
    for (let i = 0; i < gp.buttons.length; i++) {
      this._prevButtons[i] = gp.buttons[i]?.pressed ?? false;
    }
  }

  private _pollGamepad(): Gamepad | null {
    const gamepads = navigator.getGamepads?.();
    if (!gamepads) return null;
    for (const pad of gamepads) {
      if (pad && pad.connected && pad.mapping === 'standard') return pad;
    }
    return null;
  }

  private _onDisconnect() {
    if (this.userData.selected) {
      this.callSelectEnd();
    }
    this._prevButtons = [];
    this._captureCallback = null;
    this.activeGamepad = null;
    this.dispatchEvent({type: 'disconnected', target: this});
  }
}
