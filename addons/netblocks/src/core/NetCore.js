import { LocalUser, Peers } from "./Peers.js";
import { NetSession } from "./NetSession.js";
import { WebRTCTransport } from "./transport/WebRTCTransport.js";
//#region src/addons/netblocks/src/core/NetCore.ts
var NetCore = class {
	/**
	* @param root - The Object3D under which remote-user avatars are added.
	*   Usually your app's root xb.Script. When using `enableNet()`, this is
	*   the xrblocks scene.
	*/
	constructor(root) {
		this._root = root;
		this.peers = new Peers(this);
		this.user = new LocalUser(this);
	}
	/** Connect to a room. Defaults to a fresh WebRTCTransport when omitted. */
	async joinRoom(roomId, opts = {}) {
		if (this.session) this.leaveRoom();
		const { transport, ...sessionOpts } = opts;
		const t = transport ?? new WebRTCTransport();
		this.session = new NetSession(t, this._root, sessionOpts);
		this.peers._onSessionChanged();
		await this.session.open(roomId);
		return this.session;
	}
	/** Disconnect and clean up. */
	leaveRoom() {
		this.session?.close();
		this.session = void 0;
		this.peers._onSessionChanged();
	}
	/**
	* Broadcast `data` on `topic` to every connected peer. Shorthand for
	* `session.events.emit(topic, data)`. Throws if not joined.
	*/
	send(topic, data) {
		if (!this.session) throw new Error("[netblocks] net.send() called before joinRoom()");
		this.session.events.emit(topic, data);
	}
	/** Per-frame tick. Driven automatically when registered via `enableNet()`. */
	update(time, frame) {
		this.session?.update(time, frame);
	}
	dispose() {
		this.leaveRoom();
	}
};
//#endregion
export { NetCore };
