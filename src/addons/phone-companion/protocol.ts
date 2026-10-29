export const MAX_TEXT_LENGTH = 16000;

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

export type PhoneMessage =
  | {type: 'ping'}
  | {type: 'bye'}
  | {type: 'move'; x: number; y: number}
  | {type: 'scroll'; delta: number}
  | {type: 'zoom'; factor: number}
  | {type: 'motion'; state: MotionState}
  | {type: 'button'; down: boolean; motion?: MotionState}
  | {type: 'cancel'; motion?: MotionState}
  | {type: 'center'; motion?: MotionState}
  | {type: 'pointer-config'; sensitivity: number}
  | {type: 'field'; field: {id: number; revision: number; label: string} | null}
  | {type: 'open-keyboard'; fieldId: number}
  | {type: 'text'; state: PhoneTextState | null}
  | {type: 'edit'; revision: number; value: string; start: number; end: number}
  | {type: 'submit'; revision: number}
  | {type: 'done'; revision: number}
  | {type: 'haptic'; duration: number};

function bounded(value: unknown, max: number): value is number {
  return (
    typeof value === 'number' &&
    Number.isFinite(value) &&
    Math.abs(value) <= max
  );
}

function offset(value: unknown): value is number {
  return (
    bounded(value, MAX_TEXT_LENGTH) && Number.isInteger(value) && value >= 0
  );
}

function revision(value: unknown): value is number {
  return Number.isSafeInteger(value) && (value as number) >= 0;
}

export function validMotion(value: unknown): value is MotionState {
  if (!value || typeof value !== 'object') return false;
  const m = value as Record<string, unknown>;
  return (
    revision(m.sample) &&
    bounded(m.x, 1.2) &&
    bounded(m.y, 1.2) &&
    bounded(m.scroll, 1e7) &&
    bounded(m.zoom, 1e6)
  );
}

export function validMessage(value: unknown): value is PhoneMessage {
  if (!value || typeof value !== 'object') return false;
  const m = value as Record<string, unknown>;
  switch (m.type) {
    case 'ping':
    case 'bye':
      return true;
    case 'cancel':
    case 'center':
      return m.motion === undefined || validMotion(m.motion);
    case 'button':
      return (
        typeof m.down === 'boolean' &&
        (m.motion === undefined || validMotion(m.motion))
      );
    case 'move':
      return bounded(m.x, 1) && bounded(m.y, 1);
    case 'scroll':
      return bounded(m.delta, 1000);
    case 'zoom':
      return bounded(m.factor, 4) && m.factor >= 0.25;
    case 'motion':
      return validMotion(m.state);
    case 'pointer-config':
      return (
        typeof m.sensitivity === 'number' &&
        Number.isFinite(m.sensitivity) &&
        m.sensitivity > 0
      );
    case 'haptic':
      return bounded(m.duration, 200) && m.duration >= 0;
    case 'submit':
    case 'done':
      return revision(m.revision);
    case 'open-keyboard':
      return revision(m.fieldId);
    case 'field': {
      if (m.field === null) return true;
      if (!m.field || typeof m.field !== 'object') return false;
      const f = m.field as Record<string, unknown>;
      return (
        revision(f.id) &&
        revision(f.revision) &&
        typeof f.label === 'string' &&
        f.label.length <= 1000
      );
    }
    case 'edit':
      return (
        revision(m.revision) &&
        typeof m.value === 'string' &&
        m.value.length <= MAX_TEXT_LENGTH &&
        offset(m.start) &&
        offset(m.end) &&
        m.start <= m.end &&
        m.end <= m.value.length
      );
    case 'text': {
      if (m.state === null) return true;
      if (!m.state || typeof m.state !== 'object') return false;
      const s = m.state as Record<string, unknown>;
      return (
        validMessage({...s, type: 'edit'}) &&
        typeof s.label === 'string' &&
        s.label.length <= 1000 &&
        typeof s.multiline === 'boolean' &&
        offset(s.maxLength)
      );
    }
    default:
      return false;
  }
}

/** Allowed inbound direction and per-second budget for each application message. */
export const HOST_MESSAGES: Partial<Record<PhoneMessage['type'], number>> = {
  ping: 4,
  bye: 2,
  button: 30,
  cancel: 20,
  center: 8,
  motion: 120,
  'open-keyboard': 8,
  edit: 60,
  submit: 8,
  done: 8,
};
export const PHONE_MESSAGES: Partial<Record<PhoneMessage['type'], number>> = {
  ping: 4,
  bye: 2,
  'pointer-config': 4,
  field: 60,
  text: 60,
  haptic: 30,
};
