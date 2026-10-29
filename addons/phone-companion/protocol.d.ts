//#region src/addons/phone-companion/protocol.d.ts
export declare const MAX_TEXT_LENGTH = 16000;
export interface PhoneTextState {
  revision: number;
  value: string;
  start: number;
  end: number;
  label: string;
  multiline: boolean;
  maxLength: number;
}
export interface MotionState {
  sample: number;
  /** Absolute yaw/pitch in radians, including at reliable button edges. */
  x: number;
  y: number;
  /** Cumulative scroll and log-scale recover a lost motion packet. */
  scroll: number;
  zoom: number;
}
export type PhoneMessage = {
  type: 'ping';
} | {
  type: 'bye';
} | {
  type: 'move';
  x: number;
  y: number;
} | {
  type: 'scroll';
  delta: number;
} | {
  type: 'zoom';
  factor: number;
} | {
  type: 'motion';
  state: MotionState;
} | {
  type: 'button';
  down: boolean;
  motion?: MotionState;
} | {
  type: 'cancel';
  motion?: MotionState;
} | {
  type: 'center';
  motion?: MotionState;
} | {
  type: 'pointer-config';
  sensitivity: number;
} | {
  type: 'field';
  field: {
    id: number;
    revision: number;
    label: string;
  } | null;
} | {
  type: 'open-keyboard';
  fieldId: number;
} | {
  type: 'text';
  state: PhoneTextState | null;
} | {
  type: 'edit';
  revision: number;
  value: string;
  start: number;
  end: number;
} | {
  type: 'submit';
  revision: number;
} | {
  type: 'done';
  revision: number;
} | {
  type: 'haptic';
  duration: number;
};
export declare function validMotion(value: unknown): value is MotionState;
export declare function validMessage(value: unknown): value is PhoneMessage;
/** Allowed inbound direction and per-second budget for each application message. */
export declare const HOST_MESSAGES: Partial<Record<PhoneMessage['type'], number>>;
export declare const PHONE_MESSAGES: Partial<Record<PhoneMessage['type'], number>>;
//#endregion