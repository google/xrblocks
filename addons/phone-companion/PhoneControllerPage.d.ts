import { PhonePairing } from "./Pairing.js";
import { PhoneConnectionOptions } from "./PhoneLink.js";
//#region src/addons/phone-companion/PhoneControllerPage.d.ts
export interface PhoneControllerPageOptions extends PhoneConnectionOptions {
  pairing?: PhonePairing;
  /** Opens the embedding page's disconnect confirmation from the recovery action. */
  onDisconnectRequest?: () => void;
}
/** A DOM-only phone controller. No XR session, renderer, or gamepad is required. */
export declare class PhoneControllerPage {
  private readonly container;
  private readonly shadow;
  private readonly abort;
  private readonly link;
  private readonly wakeLock;
  private readonly status;
  private readonly pad;
  private readonly editor;
  private readonly keyboard;
  private text;
  private field;
  private keyboardRequested;
  private applyingRemote;
  private lastEdit;
  private composing;
  private dragMode?;
  private holdTimer?;
  private state;
  private everConnected;
  private foreground;
  private reconnectTimer?;
  private noticeTimer?;
  private gestureFrame?;
  private multiTouch;
  private gesture?;
  private pointers;
  private tap?;
  private disposed;
  private readonly requestDisconnect?;
  constructor(root: HTMLElement, options?: PhoneControllerPageOptions);
  private updateForeground;
  get connected(): boolean;
  connect(): Promise<void>;
  dispose(): void;
  private find;
  private showState;
  private updateTypingLayout;
  private feedback;
  private beginDrag;
  private endDrag;
  private receive;
  private applyField;
  private applyText;
  private sendEdit;
  private submit;
  private padDown;
  private padMove;
  private padUp;
  private measureGesture;
  private resetGesture;
  private flushGesture;
  private cancel;
}
//#endregion