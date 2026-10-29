import { PhonePairing } from "./Pairing.js";
import { PhoneConnectionOptions, PhonePairingRequest } from "./PhoneLink.js";
import * as THREE from "three";
import * as xb from "xrblocks";
//#region src/addons/phone-companion/PhoneCompanion.d.ts
export interface PhoneCompanionOptions extends Omit<PhoneConnectionOptions, 'transport'> {
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
export declare class PhoneCompanion extends xb.Script {
  private readonly options;
  static dependencies: {
    input: typeof xb.Input;
    interaction: typeof xb.Interaction;
    camera: typeof THREE.Camera;
  };
  readonly controller: xb.Controller;
  private link;
  private readonly sensitivity;
  private dependencies?;
  private buttons;
  private motion;
  private yaw;
  private pitch;
  private readonly offset;
  private readonly parentRotation;
  private readonly euler;
  private field?;
  private fieldId;
  private releaseKeyboard?;
  private revision;
  private textSnapshot;
  private textState;
  private textRequested;
  private disposed;
  private collisionRetries;
  constructor(options?: PhoneCompanionOptions);
  private createLink;
  /** Resolves once signaling is open; pairing itself is reported by connected. */
  init(dependencies: Dependencies): Promise<void>;
  get connected(): boolean;
  get pairing(): PhonePairing;
  get pairingOpen(): boolean;
  get pendingPhone(): PhonePairingRequest | undefined;
  acceptPhone(id: string): Promise<boolean>;
  rejectPhone(id: string): void;
  /** Revokes the old session and opens a fresh invitation, including after phone reload. */
  replacePhone(): Promise<void>;
  private replacePairing;
  /** Encode this URL as a QR locally, or present it as a clickable link. */
  pairingURL(phonePage: string | URL): string;
  /** Assign from a UITextInput's onFocus; only a focused, editable field is sent. */
  get input(): xb.UITextInput | undefined;
  set input(field: xb.UITextInput | undefined);
  update(): void;
  /** Best-effort phone vibration, clamped to 200 ms. */
  pulse(duration?: number): void;
  private onSelectionEnd;
  dispose(): void;
  private samplePointer;
  private cancelPointer;
  private receive;
  private applyMotion;
  private fieldState;
  private syncText;
  private edit;
}
//#endregion