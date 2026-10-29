import {randomSecret} from './SessionCrypto.js';

export const PAIRING_WINDOW_MS = 90000;
export const PAIRING_ATTEMPTS = 5;

export interface PhonePairing {
  roomId: string;
  /** QR-only, 256-bit invitation credential. Never sent as a wire value. */
  token?: string;
  /** Short-lived manual entry credential. Not included in the QR. */
  code?: string;
  expiresAt?: number;
}

const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

export function phonePairingFromCode(
  input: string
): PhonePairing & {code: string} {
  const code = input.toUpperCase().replace(/[\s-]/g, '');
  if (!/^[A-HJ-NP-Z2-9]{4}$/.test(code))
    throw new Error('Enter the 4-character pairing code shown in the headset.');
  return {roomId: `phone-${code}`, code};
}

export function createPhonePairing(): PhonePairing & {
  code: string;
  token: string;
} {
  const code = Array.from(
    crypto.getRandomValues(new Uint8Array(4)),
    (byte) => CODE_ALPHABET[byte & 31]
  ).join('');
  return {
    ...phonePairingFromCode(code),
    token: randomSecret(),
    expiresAt: Date.now() + PAIRING_WINDOW_MS,
  };
}

/** QR links contain the long invitation token, never the manual code. */
export function phonePairingURL(
  page: string | URL,
  pairing: PhonePairing
): string {
  if (!pairing.token || !/^[A-Za-z0-9_-]{32,128}$/.test(pairing.token))
    throw new Error('QR pairing requires a long random token.');
  const url = new URL(page, globalThis.location?.href);
  url.hash = new URLSearchParams({
    room: pairing.roomId,
    token: pairing.token,
  }).toString();
  return url.href;
}

/** Consuming the current page's invitation also removes it from browser history. */
export function readPhonePairing(value: string | URL): PhonePairing {
  const url = new URL(value);
  const params = new URLSearchParams(url.hash.slice(1));
  if (
    globalThis.location?.href === url.href &&
    (params.has('code') || params.has('token'))
  ) {
    url.hash = '';
    history.replaceState(history.state, '', url.href);
  }
  if (params.has('code')) return phonePairingFromCode(params.get('code')!);
  const roomId = params.get('room');
  const token = params.get('token');
  if (
    !roomId ||
    roomId.length > 200 ||
    !token ||
    !/^[A-Za-z0-9_-]{32,128}$/.test(token)
  )
    throw new Error('Open a fresh pairing link or enter the headset code.');
  return {roomId, token};
}
