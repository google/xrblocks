import { RemoteUserAvatar } from "./presence/RemoteUserAvatar.js";
//#region src/addons/netblocks/src/core/NetUser.ts
var NetUser = class {
	constructor(peerId, capabilities, displayName, role = "user") {
		this.peerId = peerId;
		this.displayName = displayName;
		this.role = role;
		this.capabilities = capabilities;
		this.lastSeenMs = performance.now();
		this.avatar = new RemoteUserAvatar({
			peerId,
			displayName
		});
	}
	dispose() {
		this.avatar.dispose();
		this.avatar.parent?.remove(this.avatar);
	}
};
//#endregion
export { NetUser };
