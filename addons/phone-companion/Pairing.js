import { randomSecret } from "./SessionCrypto.js";
//#region src/addons/phone-companion/Pairing.ts
const PAIRING_WINDOW_MS = 9e4;
const PAIRING_ATTEMPTS = 5;
const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
function phonePairingFromCode(input) {
	const code = input.toUpperCase().replace(/[\s-]/g, "");
	if (!/^[A-HJ-NP-Z2-9]{4}$/.test(code)) throw new Error("Enter the 4-character pairing code shown in the headset.");
	return {
		roomId: `phone-${code}`,
		code
	};
}
function createPhonePairing() {
	return {
		...phonePairingFromCode(Array.from(crypto.getRandomValues(/* @__PURE__ */ new Uint8Array(4)), (byte) => CODE_ALPHABET[byte & 31]).join("")),
		token: randomSecret(),
		expiresAt: Date.now() + PAIRING_WINDOW_MS
	};
}
/** QR links contain the long invitation token, never the manual code. */
function phonePairingURL(page, pairing) {
	if (!pairing.token || !/^[A-Za-z0-9_-]{32,128}$/.test(pairing.token)) throw new Error("QR pairing requires a long random token.");
	const url = new URL(page, globalThis.location?.href);
	url.hash = new URLSearchParams({
		room: pairing.roomId,
		token: pairing.token
	}).toString();
	return url.href;
}
/** Consuming the current page's invitation also removes it from browser history. */
function readPhonePairing(value) {
	const url = new URL(value);
	const params = new URLSearchParams(url.hash.slice(1));
	if (globalThis.location?.href === url.href && (params.has("code") || params.has("token"))) {
		url.hash = "";
		history.replaceState(history.state, "", url.href);
	}
	if (params.has("code")) return phonePairingFromCode(params.get("code"));
	const roomId = params.get("room");
	const token = params.get("token");
	if (!roomId || roomId.length > 200 || !token || !/^[A-Za-z0-9_-]{32,128}$/.test(token)) throw new Error("Open a fresh pairing link or enter the headset code.");
	return {
		roomId,
		token
	};
}
//#endregion
export { PAIRING_ATTEMPTS, PAIRING_WINDOW_MS, createPhonePairing, phonePairingFromCode, phonePairingURL, readPhonePairing };
