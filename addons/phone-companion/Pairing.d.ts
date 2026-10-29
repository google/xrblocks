//#region src/addons/phone-companion/Pairing.d.ts
export declare const PAIRING_WINDOW_MS = 90000;
export declare const PAIRING_ATTEMPTS = 5;
export interface PhonePairing {
  roomId: string;
  /** QR-only, 256-bit invitation credential. Never sent as a wire value. */
  token?: string;
  /** Short-lived manual entry credential. Not included in the QR. */
  code?: string;
  expiresAt?: number;
}
export declare function phonePairingFromCode(input: string): PhonePairing & {
  code: string;
};
export declare function createPhonePairing(): PhonePairing & {
  code: string;
  token: string;
};
/** QR links contain the long invitation token, never the manual code. */
export declare function phonePairingURL(page: string | URL, pairing: PhonePairing): string;
/** Consuming the current page's invitation also removes it from browser history. */
export declare function readPhonePairing(value: string | URL): PhonePairing;
//#endregion