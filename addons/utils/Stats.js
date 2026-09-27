import * as THREE from "three";
import * as xb from "xrblocks";
import ThreeStats from "three/addons/libs/stats.module.js";
//#region src/addons/utils/Stats.ts
var Stats = class extends xb.Script {
	constructor() {
		super();
		this.stats = new ThreeStats();
		this.softHeadLock = true;
		this.softHeadLockOffsetPosition = new THREE.Vector3(-.2, .2, -.75);
		this.softHeadLockOffsetRotation = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, .1 * Math.PI, 0));
		this.targetPosition = new THREE.Vector3();
		this.targetRotation = new THREE.Quaternion();
		this.stats.showPanel(0);
		const statsCanvas = this.stats.dom.children[0];
		const geometry = new THREE.PlaneGeometry(.15, .09);
		this.texture = new THREE.CanvasTexture(statsCanvas);
		this.mesh = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({ map: this.texture }));
		this.add(this.mesh);
	}
	showPanel(panel) {
		this.stats.showPanel(panel);
		const statsCanvas = this.stats.dom.children[panel];
		this.texture.dispose();
		this.texture = new THREE.CanvasTexture(statsCanvas);
		this.mesh.material.map = this.texture;
	}
	updateSoftHeadlockTargetPose() {
		const camera = xb.core.camera;
		this.targetPosition.copy(this.softHeadLockOffsetPosition).applyQuaternion(camera.quaternion).add(camera.position);
		this.targetRotation.copy(camera.quaternion).multiply(this.softHeadLockOffsetRotation);
	}
	updateSoftHeadlock() {
		this.updateSoftHeadlockTargetPose();
		const lerpFactor = 10 * xb.getDeltaTime();
		this.position.lerp(this.targetPosition, lerpFactor);
		this.quaternion.slerp(this.targetRotation, lerpFactor);
	}
	enableSoftHeadLock() {
		this.softHeadLock = true;
		this.updateSoftHeadlockTargetPose();
		this.position.copy(this.targetPosition);
		this.quaternion.copy(this.targetRotation);
	}
	disableSoftHeadLock() {
		this.softHeadLock = false;
	}
	update() {
		this.texture.needsUpdate = true;
		this.stats.update();
		if (this.softHeadLock) this.updateSoftHeadlock();
	}
};
//#endregion
export { Stats };
