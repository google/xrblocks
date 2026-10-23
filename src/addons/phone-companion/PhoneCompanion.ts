import * as THREE from 'three';
import * as xb from 'xrblocks';
import {
  createPhonePairing,
  PhoneLink,
  phonePairingURL,
  type PhoneConnectionOptions,
  type PhonePairing,
  type PhonePairingRequest,
} from './PhoneLink.js';
import {
  MAX_TEXT_LENGTH,
  type PhoneMessage,
  type PhoneTextState,
  type MotionState,
} from './protocol.js';

export interface PhoneCompanionOptions
  extends Omit<PhoneConnectionOptions, 'transport'> {
  /** Initial rendezvous override. Each host still generates its own fresh QR token. */
  pairing?: PhonePairing;
  /** Radians per touchpad width/height. Default 1.5. */
  sensitivity?: number;
  /** Return false for passwords or other fields that must never leave the host. */
  allowTextInput?: (field: xb.UITextInput) => boolean;
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
  readonly controller: xb.Controller =
    new THREE.Object3D<xb.ControllerEventMap>();
  private link: PhoneLink;
  private readonly sensitivity: number;
  private dependencies?: Dependencies;
  private buttons: Array<{
    down: boolean;
    pose?: MotionState;
    sampled?: boolean;
  }> = [];
  private motion: MotionState = {sample: 0, x: 0, y: 0, scroll: 0, zoom: 0};
  private yaw = 0;
  private pitch = 0;
  private readonly offset = new THREE.Quaternion();
  private readonly parentRotation = new THREE.Quaternion();
  private readonly euler = new THREE.Euler(0, 0, 0, 'YXZ');
  private field?: xb.UITextInput;
  private fieldId = 0;
  private releaseKeyboard?: () => void;
  private revision = 0;
  private textSnapshot = '';
  private textState: PhoneTextState | null = null;
  private textRequested = false;
  private disposed = false;
  private collisionRetries = 0;

  constructor(private readonly options: PhoneCompanionOptions = {}) {
    super();
    this.name = 'Phone Companion';
    this.sensitivity = options.sensitivity ?? 1.5;
    if (!Number.isFinite(this.sensitivity) || this.sensitivity <= 0) {
      throw new Error('Phone sensitivity must be positive and finite.');
    }
    this.controller.name = 'Phone pointer';
    this.controller.userData = {connected: false, selected: false};
    this.controller.updatePose = () => this.samplePointer();
    const initial = createPhonePairing();
    this.link = this.createLink(
      options.pairing ? {...options.pairing, token: initial.token} : initial
    );
  }

  private createLink(pairing: PhonePairing): PhoneLink {
    const link = new PhoneLink(
      'host',
      pairing,
      {
        transportFactory: this.options.transportFactory,
        onConnectionChange: this.options.onConnectionChange,
        onStateChange: this.options.onStateChange,
        onPairingRequest: this.options.onPairingRequest,
        onPairingChange: this.options.onPairingChange,
        onError: this.options.onError,
        onRoomCollision: () => {
          if (this.disposed || this.link !== link) return;
          if (++this.collisionRetries > 5) {
            link.close();
            this.options.onError?.(
              new Error(
                'Pairing room repeatedly occupied. Choose Pair a different phone to retry.'
              )
            );
            return;
          }
          void this.replacePairing().catch((error) =>
            this.options.onError?.(error)
          );
        },
      },
      (message) => this.receive(message),
      (connected) => {
        if (!connected) this.cancelPointer();
        this.textRequested = false;
        this.motion = {sample: 0, x: 0, y: 0, scroll: 0, zoom: 0};
        this.yaw = this.pitch = 0;
        this.controller.userData.connected = connected;
        if (connected)
          this.link.send({
            type: 'pointer-config',
            sensitivity: this.sensitivity,
          });
        this.textSnapshot = '';
        this.syncText();
      }
    );
    return link;
  }

  /** Resolves once signaling is open; pairing itself is reported by connected. */
  async init(dependencies: Dependencies): Promise<void> {
    this.dependencies = dependencies;
    dependencies.input.enableController(this.controller);
    const startingLink = this.link;
    try {
      await startingLink.connect();
    } catch (error) {
      if (this.disposed || this.link !== startingLink) return;
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

  get pairing(): PhonePairing {
    return this.link.pairing;
  }
  get pairingOpen(): boolean {
    return this.link.pairingOpen;
  }
  get pendingPhone(): PhonePairingRequest | undefined {
    return this.link.pendingPhone;
  }
  acceptPhone(id: string): Promise<boolean> {
    return this.link.accept(id);
  }
  rejectPhone(id: string): void {
    this.link.reject(id);
  }

  /** Revokes the old session and opens a fresh invitation, including after phone reload. */
  async replacePhone(): Promise<void> {
    this.collisionRetries = 0;
    await this.replacePairing();
  }

  private async replacePairing(): Promise<void> {
    if (this.disposed || !this.dependencies)
      throw new Error('Mount the companion before replacing its phone.');
    this.link.close();
    this.link = this.createLink(createPhonePairing());
    await this.link.connect();
  }

  /** Encode this URL as a QR locally, or present it as a clickable link. */
  pairingURL(phonePage: string | URL): string {
    if (!this.link.canSharePairing)
      throw new Error('Use Replace Phone to create a new invitation.');
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
    this.fieldId++;
    this.textRequested = false;
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
    const edge = this.buttons[0];
    const deferRelease =
      edge?.down === false &&
      this.controller.userData.selected &&
      !edge.sampled;
    if (deferRelease) edge.sampled = true;
    else if (edge) this.buttons.shift();
    if (edge && !deferRelease) this.controller.userData.selected = edge.down;
    camera.getWorldPosition(this.controller.position);
    camera.getWorldQuaternion(this.controller.quaternion);
    this.offset.setFromEuler(
      this.euler.set(edge?.pose?.y ?? this.pitch, edge?.pose?.x ?? this.yaw, 0)
    );
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
    this.controller.userData.selected = false;
    this.dependencies?.interaction.removeSource(
      this.controller,
      'pointer-cancel'
    );
  }

  private receive(message: PhoneMessage): void {
    switch (message.type) {
      case 'motion':
        this.applyMotion(message.state);
        break;
      case 'button': {
        if (message.motion) this.applyMotion(message.motion);
        const previous =
          this.buttons.at(-1)?.down ?? this.controller.userData.selected;
        if (previous !== message.down) {
          if (this.buttons.length >= 32) this.cancelPointer();
          else this.buttons.push({down: message.down, pose: message.motion});
        }
        break;
      }
      case 'cancel':
        if (message.motion && message.motion.sample > this.motion.sample) {
          this.motion = message.motion;
          this.yaw = message.motion.x;
          this.pitch = message.motion.y;
        }
        this.cancelPointer();
        break;
      case 'center':
        if (message.motion) this.applyMotion(message.motion);
        this.yaw = this.pitch = 0;
        break;
      case 'open-keyboard':
        this.syncText();
        if (this.textState && message.fieldId === this.fieldId) {
          this.textRequested = true;
          this.syncText();
          this.link.send({type: 'text', state: this.textState});
        }
        break;
      case 'edit':
      case 'submit':
      case 'done':
        this.edit(message);
        break;
    }
  }

  private applyMotion(state: MotionState): void {
    if (state.sample <= this.motion.sample) return;
    const scroll = THREE.MathUtils.clamp(
      state.scroll - this.motion.scroll,
      -1000,
      1000
    );
    const zoom = THREE.MathUtils.clamp(
      state.zoom - this.motion.zoom,
      -Math.log(4),
      Math.log(4)
    );
    this.motion = state;
    this.yaw = state.x;
    this.pitch = state.y;
    if (scroll)
      this.dependencies?.interaction.queueWheelIntent(this.controller, scroll);
    if (zoom)
      this.dependencies?.interaction.queueScaleIntent(
        this.controller,
        Math.exp(zoom)
      );
  }

  private fieldState(): Omit<PhoneTextState, 'revision'> | null {
    const field = this.field;
    if (
      !this.connected ||
      !field?.ready ||
      !field.focused ||
      field.disabled ||
      field.readOnly ||
      this.options.allowTextInput?.(field) === false ||
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
    if (state && this.textRequested && !this.releaseKeyboard)
      this.releaseKeyboard = this.field!.suppressNativeKeyboard();
    if (!state || !this.textRequested) {
      if (!state) this.textRequested = false;
      this.releaseKeyboard?.();
      this.releaseKeyboard = undefined;
    }
    const snapshot = JSON.stringify(state);
    if (snapshot === this.textSnapshot) return;
    this.textSnapshot = snapshot;
    this.revision++;
    this.textState = state ? {...state, revision: this.revision} : null;
    this.link.send({
      type: 'field',
      field: state
        ? {id: this.fieldId, revision: this.revision, label: state.label}
        : null,
    });
    if (this.textRequested || !state)
      this.link.send({type: 'text', state: this.textState});
  }

  private edit(
    message: Extract<PhoneMessage, {type: 'edit' | 'submit' | 'done'}>
  ): void {
    // Catch external edits/focus changes even between engine frames.
    this.syncText();
    const field = this.field;
    if (
      !field ||
      !this.textState ||
      !this.textRequested ||
      message.revision !== this.revision
    )
      return;
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
      // Preserve untouched text, including a pre-existing value above maxLength.
      // A deletion from such a value must not turn into a truncated full replace.
      const previous = field.value;
      let start = 0;
      while (
        start < previous.length &&
        start < message.value.length &&
        previous[start] === message.value[start]
      )
        start++;
      let suffix = 0;
      while (
        suffix < previous.length - start &&
        suffix < message.value.length - start &&
        previous[previous.length - suffix - 1] ===
          message.value[message.value.length - suffix - 1]
      )
        suffix++;
      field.setSelectionRange(start, previous.length - suffix);
      field.insertText(
        message.value.slice(start, message.value.length - suffix)
      );
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
