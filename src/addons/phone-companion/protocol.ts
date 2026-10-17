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

export type PhoneMessage =
  | {type: 'hello'; role: 'host' | 'phone'}
  | {type: 'welcome'; role: 'host' | 'phone'}
  | {type: 'ping'}
  | {type: 'bye'}
  | {type: 'move'; x: number; y: number}
  | {type: 'button'; down: boolean}
  | {type: 'cancel'}
  | {type: 'center'}
  | {type: 'scroll'; delta: number}
  | {type: 'zoom'; factor: number}
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

/** Validate at the wire boundary before touching input or native DOM state. */
export function validMessage(value: unknown): value is PhoneMessage {
  if (!value || typeof value !== 'object') return false;
  const m = value as Record<string, unknown>;
  switch (m.type) {
    case 'hello':
    case 'welcome':
      return m.role === 'host' || m.role === 'phone';
    case 'ping':
    case 'bye':
    case 'cancel':
    case 'center':
      return true;
    case 'button':
      return typeof m.down === 'boolean';
    case 'move':
      return bounded(m.x, 1) && bounded(m.y, 1);
    case 'scroll':
      return bounded(m.delta, 1000);
    case 'zoom':
      return bounded(m.factor, 4) && m.factor >= 0.25;
    case 'haptic':
      return bounded(m.duration, 200) && m.duration >= 0;
    case 'submit':
    case 'done':
      return revision(m.revision);
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
