//#region src/addons/phone-companion/SessionCrypto.ts
const encoder = new TextEncoder();
const decoder = new TextDecoder();
function encodeBytes(bytes) {
	return btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
function decodeBytes(value) {
	if (!/^[A-Za-z0-9_-]+$/.test(value)) throw new Error("Invalid encoding.");
	return Uint8Array.from(atob(value.replace(/-/g, "+").replace(/_/g, "/")), (c) => c.charCodeAt(0));
}
function randomSecret() {
	return encodeBytes(crypto.getRandomValues(/* @__PURE__ */ new Uint8Array(32)));
}
/** Commit before seeing the other side's key; no adaptive SAS key grinding. */
async function keyCommitment(publicKey) {
	const bytes = decodeBytes(publicKey);
	if (encodeBytes(bytes) !== publicKey) throw new Error("Non-canonical public key.");
	return encodeBytes(new Uint8Array(await crypto.subtle.digest("SHA-256", bytes)));
}
async function createEphemeralKey() {
	const pair = await crypto.subtle.generateKey({
		name: "ECDH",
		namedCurve: "P-256"
	}, false, ["deriveBits"]);
	return {
		privateKey: pair.privateKey,
		publicKey: encodeBytes(new Uint8Array(await crypto.subtle.exportKey("raw", pair.publicKey)))
	};
}
async function credentialProof(secret, transcript) {
	const key = await crypto.subtle.importKey("raw", encoder.encode(secret), {
		name: "HMAC",
		hash: "SHA-256"
	}, false, ["sign"]);
	return encodeBytes(new Uint8Array(await crypto.subtle.sign("HMAC", key, encoder.encode(transcript))));
}
async function verifyCredential(secret, transcript, proof) {
	const key = await crypto.subtle.importKey("raw", encoder.encode(secret), {
		name: "HMAC",
		hash: "SHA-256"
	}, false, ["verify"]);
	return crypto.subtle.verify("HMAC", key, decodeBytes(proof), encoder.encode(transcript));
}
/** Direction-separated, non-extractable keys derived from an ephemeral ECDH exchange. */
var SessionCrypto = class SessionCrypto {
	constructor(id, comparison, auth, hostToPhone, phoneToHost, root) {
		this.id = id;
		this.comparison = comparison;
		this.auth = auth;
		this.hostToPhone = hostToPhone;
		this.phoneToHost = phoneToHost;
		this.root = root;
	}
	static async derive(privateKey, publicKey, transcript) {
		const remoteBytes = decodeBytes(publicKey);
		if (encodeBytes(remoteBytes) !== publicKey) throw new Error("Non-canonical public key.");
		const remote = await crypto.subtle.importKey("raw", remoteBytes, {
			name: "ECDH",
			namedCurve: "P-256"
		}, false, []);
		const shared = await crypto.subtle.deriveBits({
			name: "ECDH",
			public: remote
		}, privateKey, 256);
		const salt = await crypto.subtle.digest("SHA-256", encoder.encode(transcript));
		const key = await crypto.subtle.importKey("raw", shared, "HKDF", false, ["deriveKey", "deriveBits"]);
		const params = (label) => ({
			name: "HKDF",
			hash: "SHA-256",
			salt,
			info: encoder.encode(`xrblocks-phone-v2/${label}`)
		});
		const [auth, hostToPhone, phoneToHost, check] = await Promise.all([
			crypto.subtle.deriveKey(params("resume"), key, {
				name: "HMAC",
				hash: "SHA-256",
				length: 256
			}, false, ["sign", "verify"]),
			crypto.subtle.deriveKey(params("host-to-phone"), key, {
				name: "AES-GCM",
				length: 256
			}, false, ["encrypt", "decrypt"]),
			crypto.subtle.deriveKey(params("phone-to-host"), key, {
				name: "AES-GCM",
				length: 256
			}, false, ["encrypt", "decrypt"]),
			crypto.subtle.deriveBits(params("comparison"), key, 32)
		]);
		const comparison = String(new DataView(check).getUint32(0) % 1e6).padStart(6, "0");
		return new SessionCrypto(encodeBytes(new Uint8Array(salt).slice(0, 16)), comparison, auth, hostToPhone, phoneToHost, key);
	}
	/** Active session keys are domain-separated only after the host accepts. */
	async establish(approval) {
		const salt = await crypto.subtle.digest("SHA-256", encoder.encode(JSON.stringify([
			"approved",
			this.id,
			approval
		])));
		const params = (label) => ({
			name: "HKDF",
			hash: "SHA-256",
			salt,
			info: encoder.encode(`xrblocks-phone-v2/${label}`)
		});
		const [auth, hostToPhone, phoneToHost] = await Promise.all([
			crypto.subtle.deriveKey(params("resume"), this.root, {
				name: "HMAC",
				hash: "SHA-256",
				length: 256
			}, false, ["sign", "verify"]),
			crypto.subtle.deriveKey(params("host-to-phone"), this.root, {
				name: "AES-GCM",
				length: 256
			}, false, ["encrypt", "decrypt"]),
			crypto.subtle.deriveKey(params("phone-to-host"), this.root, {
				name: "AES-GCM",
				length: 256
			}, false, ["encrypt", "decrypt"])
		]);
		return new SessionCrypto(encodeBytes(new Uint8Array(salt).slice(0, 16)), this.comparison, auth, hostToPhone, phoneToHost, this.root);
	}
	async prove(value) {
		return encodeBytes(new Uint8Array(await crypto.subtle.sign("HMAC", this.auth, encoder.encode(value))));
	}
	async verify(value, proof) {
		return crypto.subtle.verify("HMAC", this.auth, decodeBytes(proof), encoder.encode(value));
	}
	async encrypt(role, header, message) {
		const iv = crypto.getRandomValues(/* @__PURE__ */ new Uint8Array(12));
		const body = await crypto.subtle.encrypt({
			name: "AES-GCM",
			iv,
			additionalData: encoder.encode(header)
		}, role === "host" ? this.hostToPhone : this.phoneToHost, encoder.encode(JSON.stringify(message)));
		return {
			iv: encodeBytes(iv),
			body: encodeBytes(new Uint8Array(body))
		};
	}
	async decrypt(sender, header, iv, body) {
		const plain = await crypto.subtle.decrypt({
			name: "AES-GCM",
			iv: decodeBytes(iv),
			additionalData: encoder.encode(header)
		}, sender === "host" ? this.hostToPhone : this.phoneToHost, decodeBytes(body));
		return JSON.parse(decoder.decode(plain));
	}
};
//#endregion
export { SessionCrypto, createEphemeralKey, credentialProof, decodeBytes, encodeBytes, keyCommitment, randomSecret, verifyCredential };
