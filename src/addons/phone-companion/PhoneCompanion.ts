import * as THREE from 'three';
import * as xb from 'xrblocks';
import {
  createPhonePairing,
  PhoneLink,
  phonePairingURL,
  type PhoneConnectionOptions,
  type PhonePairing,
} from './PhoneLink.js';
import {
  MAX_TEXT_LENGTH,
  type PhoneMessage,
  type PhoneTextState,
} from './protocol.js';

export interface PhoneCompanionOptions extends PhoneConnectionOptions {
  pairing?: PhonePairing;
  /** Radians per touchpad width/height. Default 1.5. */
  sensitivity?: number;
}

interface Dependencies {
  input: xb.Input;
  interaction: xb.Interaction;
  camera: THREE.Camera;
}

/** Mount this Script to pair a phone with the ordinary XR interaction pipeline. */
export class PhoneCompanion extends xb.Script {
  static dependencies = {
    input: xb.Input,
    interaction: xb.Interaction,
    camera: THREE.Camera,
  };
  readonly pairing: PhonePairing;
  readonly controller: xb.Controller =
    new THREE.Object3D<xb.ControllerEventMap>();
  private readonly link: PhoneLink;
  private readonly sensitivity: number;
  private dependencies?: Dependencies;
  private buttons: boolean[] = [];
  private yaw = 0;
  private pitch = 0;
  private pointerMoved = false;
  private readonly offset = new THREE.Quaternion();
  private readonly parentRotation = new THREE.Quaternion();
  private readonly euler = new THREE.Euler(0, 0, 0, 'YXZ');
  private field?: xb.UITextInput;
  private releaseKeyboard?: () => void;
  private revision = 0;
  private textSnapshot = '';
  private textState: PhoneTextState | null = null;
  private disposed = false;

  constructor(private readonly options: PhoneCompanionOptions = {}) {
    super();
    this.name = 'Phone Companion';
    this.sensitivity = options.sensitivity ?? 1.5;
    if (!Number.isFinite(this.sensitivity) || this.sensitivity <= 0) {
      throw new Error('Phone sensitivity must be positive and finite.');
    }
    this.pairing = options.pairing ?? createPhonePairing();
    this.controller.name = 'Phone pointer';
    this.controller.userData = {connected: false, selected: false};
    this.controller.updatePose = () => this.samplePointer();
    this.link = new PhoneLink(
      'host',
      this.pairing,
      options,
      (message) => this.receive(message),
      (connected) => {
        if (!connected) this.cancelPointer();
        this.controller.userData.connected = connected;
        this.textSnapshot = '';
        this.syncText();
      }
    );
  }

  /** Resolves once signaling is open; pairing itself is reported by connected. */
  async init(dependencies: Dependencies): Promise<void> {
    this.dependencies = dependencies;
    dependencies.input.enableController(this.controller);
    try {
      await this.link.connect();
    } catch (error) {
      dependencies.input.removeController(this.controller);
      this.options.onError?.(
        error instanceof Error ? error : new Error(String(error))
      );
      throw error;
    }
  }

  get connected(): boolean {
    return this.link.connected;
  }

  /** Encode this URL as a QR locally, or present it as a clickable link. */
  pairingURL(phonePage: string | URL): string {
    return phonePairingURL(phonePage, this.pairing);
  }

  /** Assign from a UITextInput's onFocus; only a focused, editable field is sent. */
  get input(): xb.UITextInput | undefined {
    return this.field;
  }
  set input(field: xb.UITextInput | undefined) {
    if (field === this.field) return;
    this.releaseKeyboard?.();
    this.releaseKeyboard = undefined;
    this.field = field;
    this.textSnapshot = '';
    this.syncText();
  }

  update(): void {
    this.syncText();
  }

  /** Best-effort phone vibration, clamped to 200 ms. */
  pulse(duration = 20): void {
    if (Number.isFinite(duration)) {
      this.link.send({
        type: 'haptic',
        duration: THREE.MathUtils.clamp(duration, 0, 200),
      });
    }
  }

  onSelectEnd(event: xb.SelectEndEvent): void {
    if (event.source.controller === this.controller && event.completed)
      this.pulse();
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.link.close();
    this.cancelPointer();
    this.releaseKeyboard?.();
    this.releaseKeyboard = undefined;
    this.dependencies?.input.removeController(this.controller);
    this.controller.updatePose = undefined;
    this.field = undefined;
  }

  private samplePointer(): void {
    const camera = this.dependencies?.camera;
    if (!camera) return;
    // Preserve short taps even when down and up arrive between XR frames.
    // Deliver the last held pose before releasing. Motion and button-up can
    // arrive together between XR frames on a network connection.
    const deferRelease =
      this.buttons[0] === false &&
      this.controller.userData.selected &&
      this.pointerMoved;
    const down = deferRelease ? undefined : this.buttons.shift();
    this.pointerMoved = false;
    if (down !== undefined) this.controller.userData.selected = down;
    camera.getWorldPosition(this.controller.position);
    camera.getWorldQuaternion(this.controller.quaternion);
    this.offset.setFromEuler(this.euler.set(this.pitch, this.yaw, 0));
    this.controller.quaternion.multiply(this.offset);
    const parent = this.controller.parent;
    if (parent) {
      parent.worldToLocal(this.controller.position);
      parent.getWorldQuaternion(this.parentRotation).invert();
      this.controller.quaternion.premultiply(this.parentRotation);
    }
    this.controller.updateMatrixWorld();
  }

  private cancelPointer(): void {
    this.buttons.length = 0;
    this.pointerMoved = false;
    this.controller.userData.selected = false;
    this.dependencies?.interaction.removeSource(
      this.controller,
      'pointer-cancel'
    );
  }

  private receive(message: PhoneMessage): void {
    switch (message.type) {
      case 'hello':
        // The phone may have timed out while this side still considered it paired.
        this.textSnapshot = '';
        this.syncText();
        break;
      case 'move':
        this.pointerMoved = true;
        this.yaw = THREE.MathUtils.clamp(
          this.yaw - message.x * this.sensitivity,
          -1.2,
          1.2
        );
        this.pitch = THREE.MathUtils.clamp(
          this.pitch - message.y * this.sensitivity,
          -1.2,
          1.2
        );
        break;
      case 'button': {
        const previous =
          this.buttons.at(-1) ?? this.controller.userData.selected;
        if (previous !== message.down) {
          if (this.buttons.length >= 32) this.cancelPointer();
          else this.buttons.push(message.down);
        }
        break;
      }
      case 'cancel':
        this.cancelPointer();
        break;
      case 'center':
        this.pointerMoved = true;
        this.yaw = this.pitch = 0;
        break;
      case 'scroll':
        this.dependencies?.interaction.queueWheelIntent(
          this.controller,
          message.delta
        );
        break;
      case 'zoom':
        this.dependencies?.interaction.queueScaleIntent(
          this.controller,
          message.factor
        );
        break;
      case 'edit':
      case 'submit':
      case 'done':
        this.edit(message);
        break;
    }
  }

  private fieldState(): Omit<PhoneTextState, 'revision'> | null {
    const field = this.field;
    if (
      !this.connected ||
      !field?.ready ||
      !field.focused ||
      field.disabled ||
      field.readOnly ||
      field.value.length > MAX_TEXT_LENGTH
    )
      return null;
    return {
      value: field.value,
      start: field.selectionStart ?? field.value.length,
      end: field.selectionEnd ?? field.value.length,
      label: field.ariaLabel.slice(0, 1000),
      multiline: field.multiline,
      maxLength: Math.min(field.maxLength ?? MAX_TEXT_LENGTH, MAX_TEXT_LENGTH),
    };
  }

  private syncText(): void {
    const state = this.fieldState();
    if (state && !this.releaseKeyboard)
      this.releaseKeyboard = this.field!.suppressNativeKeyboard();
    if (!state) {
      this.releaseKeyboard?.();
      this.releaseKeyboard = undefined;
    }
    const snapshot = JSON.stringify(state);
    if (snapshot === this.textSnapshot) return;
    this.textSnapshot = snapshot;
    this.revision++;
    this.textState = state ? {...state, revision: this.revision} : null;
    this.link.send({type: 'text', state: this.textState});
  }

  private edit(
    message: Extract<PhoneMessage, {type: 'edit' | 'submit' | 'done'}>
  ): void {
    // Catch external edits/focus changes even between engine frames.
    this.syncText();
    const field = this.field;
    if (!field || !this.textState || message.revision !== this.revision) return;
    if (message.type === 'done') {
      field.blur();
      this.syncText();
      return;
    }
    if (message.type === 'submit') {
      field.pressKey('Enter', {ctrlKey: field.multiline});
      return;
    }
    if (message.value !== field.value) {
      field.setSelectionRange(0, field.value.length);
      field.insertText(message.value);
    }
    // An onInput callback may switch the active field.
    if (this.field !== field) return;
    field.setSelectionRange(message.start, message.end);
    if (field.value !== message.value) {
      this.textSnapshot = '';
      this.syncText();
    } else {
      // Keep the revision for consecutive phone edits; no echo can reset IME.
      const state = this.fieldState();
      this.textSnapshot = JSON.stringify(state);
      this.textState = state ? {...state, revision: this.revision} : null;
    }
  }
}
