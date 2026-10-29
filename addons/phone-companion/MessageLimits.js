//#region src/addons/phone-companion/MessageLimits.ts
/** Fixed-size token buckets; callers use a bounded vocabulary, never peer IDs. */
var MessageLimits = class {
	constructor() {
		this.buckets = /* @__PURE__ */ new Map();
	}
	allow(type, perSecond, burst = perSecond) {
		const now = performance.now();
		const bucket = this.buckets.get(type) ?? {
			tokens: burst,
			time: now
		};
		bucket.tokens = Math.min(burst, bucket.tokens + (now - bucket.time) * perSecond / 1e3);
		bucket.time = now;
		this.buckets.set(type, bucket);
		if (bucket.tokens < 1) return false;
		bucket.tokens--;
		return true;
	}
};
//#endregion
export { MessageLimits };
