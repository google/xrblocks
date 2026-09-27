import * as THREE from "three";
import * as xb from "xrblocks";
//#region src/addons/camera/PlanarVST.ts
var PlanarVST = class extends xb.Script {
	constructor(..._args) {
		super(..._args);
		this.disposables = [];
		this.targetDevice = "galaxyxr";
	}
	init() {
		const texture = xb.core.deviceCamera?.texture;
		const material = new THREE.MeshBasicMaterial({
			map: texture,
			side: THREE.DoubleSide,
			transparent: true,
			opacity: .8
		});
		this.disposables.push(material);
		const geometry = new THREE.PlaneGeometry(1, 1);
		this.disposables.push(geometry);
		this.mesh = new THREE.Mesh(geometry, material);
		this.add(this.mesh);
	}
	update() {
		if (!this.mesh) return;
		const haveSimulatorCamera = !!xb.core.deviceCamera?.simulatorCamera;
		const haveXRRenderCamera = xb.core.renderer.xr.getCamera().cameras.length > 0;
		if (!haveSimulatorCamera && !haveXRRenderCamera) return;
		const projectionMatrix = xb.getDeviceCameraClipFromView(xb.core.camera, xb.core.deviceCamera, this.targetDevice);
		xb.getDeviceCameraWorldFromView(xb.core.camera, xb.core.renderer.xr.getCamera(), xb.core.deviceCamera, this.targetDevice).decompose(this.position, this.quaternion, this.scale);
		const raycaster = new THREE.Raycaster();
		const direction = new THREE.Vector3(0, 0, -1).applyQuaternion(this.quaternion);
		raycaster.set(this.position, direction);
		const depthMesh = xb.core.depth?.depthMesh;
		let depthInMeters = 2;
		if (depthMesh) {
			depthMesh.updateWorldMatrix(true, false);
			const intersections = raycaster.intersectObject(depthMesh, false);
			if (intersections.length > 0) depthInMeters = intersections[0].distance;
		}
		const elements = projectionMatrix.elements;
		const P00 = elements[0];
		const P11 = elements[5];
		const frustumWidth = 2 * depthInMeters / P00;
		const frustumHeight = 2 * depthInMeters / P11;
		this.mesh.scale.set(frustumWidth, frustumHeight, 1);
		this.mesh.position.set(0, 0, -depthInMeters);
	}
	dispose() {
		for (const disposable of this.disposables) disposable.dispose();
		this.disposables = [];
		this.clear();
	}
};
//#endregion
export { PlanarVST };
