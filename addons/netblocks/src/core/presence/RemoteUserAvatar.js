import { hashStringToIndex } from "../utils/IdUtils.js";
import { InterpolatedPose } from "./InterpolatedPose.js";
import * as THREE from "three";
import * as xb from "xrblocks";
//#region src/addons/netblocks/src/core/presence/RemoteUserAvatar.ts
/**
* RemoteUserAvatar: a lightweight three.js Group that visualizes a remote
* peer using a head sphere and two hand "stick" meshes (wrist sphere +
* up-to-five fingertip dots). It renders nothing if no pose has arrived.
*
* The avatar is intentionally minimal — netblocks ships a baseline that
* works in every sample, and apps can opt into richer avatars by hiding
* the default mesh (`avatar.defaultMesh.visible = false`) and parenting
* their own meshes to `avatar.headPivot` / `avatar.handPivots[h]`.
*/
const FINGERTIP_INDICES = [
	4,
	9,
	14,
	19,
	24
];
/**
* Eight well-separated colors so two peers in the same room are easy to
* tell apart at a glance. Hashing into a continuous hue space ended up
* producing peers with near-identical hues too often (e.g., two adjacent
* blues) — a discrete palette makes "who is who" obvious. Exported so
* apps can match other UI (chat sender names, etc.) to the avatar color.
*/
const AVATAR_PALETTE = [
	16734553,
	16754253,
	16767053,
	5951866,
	5096447,
	6982911,
	11560703,
	16737988
];
var RemoteUserAvatar = class extends THREE.Group {
	get displayName() {
		return this._displayName;
	}
	set displayName(name) {
		this.setDisplayName(name);
	}
	/**
	* Whether this peer currently has their microphone enabled. Driven by
	* the `netblocks/voice-state` event NetSession listens for; when true,
	* the floating name label gets a 🎙️ suffix so observers know the peer
	* is in the voice chat without depending on the mouth animation.
	*/
	get voiceActive() {
		return this._voiceActive;
	}
	set voiceActive(on) {
		if (this._voiceActive === on) return;
		this._voiceActive = on;
		if (this._nameText) this._nameText.text = this._labelString();
	}
	constructor(opts) {
		super();
		this._voiceActive = false;
		this.pose = new InterpolatedPose();
		this.headPivot = new THREE.Group();
		this.handPivots = [new THREE.Group(), new THREE.Group()];
		this.defaultMesh = new THREE.Group();
		this.face = new xb.StylizedFace();
		this.name = `RemoteUserAvatar(${opts.peerId})`;
		this.peerId = opts.peerId;
		this._displayName = opts.displayName;
		const paletteIdx = hashStringToIndex(opts.peerId, AVATAR_PALETTE.length);
		this.color = new THREE.Color(AVATAR_PALETTE[paletteIdx]);
		this.add(this.headPivot, this.handPivots[0], this.handPivots[1]);
		const headMat = new THREE.MeshBasicMaterial({ color: this.color });
		this._headSphere = new THREE.Mesh(new THREE.SphereGeometry(.1, 24, 16), headMat);
		this._headSphere.castShadow = false;
		const handMatA = new THREE.MeshBasicMaterial({ color: this.color });
		const handMatB = new THREE.MeshBasicMaterial({ color: this.color });
		const dotMat = new THREE.MeshBasicMaterial({ color: this.color });
		this._wristSpheres = [new THREE.Mesh(new THREE.SphereGeometry(.022, 16, 12), handMatA), new THREE.Mesh(new THREE.SphereGeometry(.022, 16, 12), handMatB)];
		this._handGroups = [new THREE.Group(), new THREE.Group()];
		this._fingertipDots = [[], []];
		for (let h = 0; h < 2; h++) {
			this._handGroups[h].add(this._wristSpheres[h]);
			for (let f = 0; f < FINGERTIP_INDICES.length; f++) {
				const dot = new THREE.Mesh(new THREE.SphereGeometry(.01, 12, 8), dotMat);
				this._handGroups[h].add(dot);
				this._fingertipDots[h].push(dot);
			}
			this._handGroups[h].visible = false;
		}
		this.defaultMesh.add(this._headSphere, this._handGroups[0], this._handGroups[1]);
		this._headSphere.add(this.face);
		this.add(this.defaultMesh);
		this._headSphere.visible = false;
		this._initNameLabel();
	}
	_initNameLabel() {
		const text = new xb.UIText({
			text: this._labelString(),
			style: {
				fontSize: 32,
				color: "#ffffff",
				textAlign: "center",
				whiteSpace: "nowrap"
			}
		});
		const card = new xb.UICard({
			size: {
				width: .35,
				height: .08
			},
			pixelSize: .001,
			appearance: "surface",
			style: {
				justifyContent: "center",
				alignItems: "center",
				backgroundColor: "rgba(0, 0, 0, 0.6)",
				borderRadius: 16,
				paddingLeft: 16,
				paddingRight: 16,
				paddingTop: 6,
				paddingBottom: 6
			},
			children: [text]
		});
		card.position.set(0, 0, 0);
		this._nameText = text;
		this._nameLabel = card;
		this.add(card);
	}
	/** Sample the smoothed pose at `now` and update the local meshes. */
	applyPose(nowMs) {
		if (!this.pose.hasData) return;
		const snap = this.pose.sample(nowMs);
		this.headPivot.position.copy(snap.head.position);
		this.headPivot.quaternion.copy(snap.head.quaternion);
		this._headSphere.position.copy(snap.head.position);
		this._headSphere.quaternion.copy(snap.head.quaternion);
		this._headSphere.visible = true;
		for (let h = 0; h < 2; h++) {
			const hand = snap.hands[h];
			const pivot = this.handPivots[h];
			const grp = this._handGroups[h];
			if (!hand.present) {
				grp.visible = false;
				continue;
			}
			pivot.position.copy(hand.position);
			pivot.quaternion.copy(hand.quaternion);
			this._wristSpheres[h].position.copy(hand.position);
			this._wristSpheres[h].quaternion.copy(hand.quaternion);
			grp.visible = true;
			const joints = hand.joints;
			if (joints) for (let f = 0; f < FINGERTIP_INDICES.length; f++) {
				const j = joints[FINGERTIP_INDICES[f]];
				if (j) this._fingertipDots[h][f].position.copy(j);
			}
		}
		if (this._nameLabel) {
			this._nameLabel.position.copy(snap.head.position);
			this._nameLabel.position.y += .13;
			const cam = xb.core?.camera;
			if (cam) this._nameLabel.lookAt(cam.position);
		}
	}
	/** Update the displayed name. */
	setDisplayName(name) {
		this._displayName = name;
		if (this._nameText) this._nameText.text = this._labelString();
	}
	_labelString() {
		const base = this._displayName || this.peerId.slice(0, 6);
		return this._voiceActive ? `${base} 🎙️` : base;
	}
	dispose() {
		this._disposed = true;
		this._headSphere.geometry.dispose();
		this._headSphere.material.dispose();
		for (let h = 0; h < 2; h++) {
			this._wristSpheres[h].geometry.dispose();
			this._wristSpheres[h].material.dispose();
			for (const dot of this._fingertipDots[h]) {
				dot.geometry.dispose();
				dot.material.dispose();
			}
		}
		this.face.dispose();
		if (this._nameLabel) {
			this.remove(this._nameLabel);
			this._nameLabel.dispose();
			this._nameLabel = void 0;
			this._nameText = void 0;
		}
		super.dispose();
	}
};
//#endregion
export { AVATAR_PALETTE, RemoteUserAvatar };
