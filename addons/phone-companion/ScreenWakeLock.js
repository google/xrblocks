//#region src/addons/phone-companion/ScreenWakeLock.ts
/** Best-effort phone screen ownership, including cancellation of pending grants. */
var ScreenWakeLock = class {
	constructor(wakeLock = navigator.wakeLock) {
		this.wakeLock = wakeLock;
		this.pending = false;
		this.active = false;
		this.disposed = false;
		this.generation = 0;
	}
	setActive(active) {
		if (this.disposed) return;
		if (this.active !== active) this.generation++;
		this.active = active;
		if (!active) this.release();
		else this.acquire();
	}
	dispose() {
		if (this.disposed) return;
		this.disposed = true;
		this.active = false;
		this.generation++;
		this.release();
	}
	release() {
		const sentinel = this.sentinel;
		this.sentinel = void 0;
		sentinel?.release().catch(() => {});
	}
	async acquire() {
		if (!this.wakeLock || this.pending || this.sentinel || !this.active || this.disposed) return;
		const generation = this.generation;
		this.pending = true;
		try {
			const sentinel = await this.wakeLock.request("screen");
			if (!this.active || this.disposed || generation !== this.generation) await sentinel.release();
			else {
				this.sentinel = sentinel;
				sentinel.addEventListener("release", () => {
					if (this.sentinel === sentinel) this.sentinel = void 0;
				}, { once: true });
			}
		} catch {} finally {
			this.pending = false;
			if (generation !== this.generation && this.active && !this.disposed) this.acquire();
		}
	}
};
//#endregion
export { ScreenWakeLock };
