import * as THREE from "three";
//#region src/addons/agenthands/AgentHead.ts
const CORE_COLOR = 9419007;
const HALO_COLOR = 6988031;
const POINT_COLOR = 14674687;
const POINT_COUNT = 90;
const scratchTarget = new THREE.Vector3();
const scratchDir = new THREE.Vector3();
const scratchQuat = new THREE.Quaternion();
const UP = new THREE.Vector3(0, 1, 0);
/**
* An abstract, glowing orb that stands in for the agent's head/presence. It is
* deliberately not a literal face: a luminous core, a translucent halo, and a
* field of drifting points. It breathes while idle, pulses while the agent
* speaks, and can gently gaze toward whatever the agent points at.
*/
var AgentHead = class {
	/**
	* @param radius - Core radius in metres.
	*/
	constructor(radius = .09) {
		this.radius = radius;
		this.root = new THREE.Group();
		this.gaze = new THREE.Group();
		this.speaking = 0;
		this.speakingTarget = 0;
		this.clock = 0;
		this.gazeTarget = null;
		this.build_();
	}
	build_() {
		this.root.add(this.gaze);
		this.core = new THREE.Mesh(new THREE.SphereGeometry(this.radius, 32, 32), new THREE.MeshBasicMaterial({
			color: CORE_COLOR,
			transparent: true,
			opacity: .9
		}));
		this.gaze.add(this.core);
		this.halo = new THREE.Mesh(new THREE.SphereGeometry(this.radius * 1.7, 32, 32), new THREE.MeshBasicMaterial({
			color: HALO_COLOR,
			transparent: true,
			opacity: .18,
			side: THREE.BackSide,
			depthWrite: false
		}));
		this.gaze.add(this.halo);
		const positions = /* @__PURE__ */ new Float32Array(270);
		for (let i = 0; i < POINT_COUNT; i++) new THREE.Vector3().randomDirection().multiplyScalar(this.radius * (1.3 + Math.random() * .6)).toArray(positions, i * 3);
		const geom = new THREE.BufferGeometry();
		geom.setAttribute("position", new THREE.BufferAttribute(positions, 3));
		this.points = new THREE.Points(geom, new THREE.PointsMaterial({
			color: POINT_COLOR,
			size: .006,
			transparent: true,
			opacity: .85,
			depthWrite: false
		}));
		this.gaze.add(this.points);
		this.core.raycast = () => {};
		this.halo.raycast = () => {};
		this.points.raycast = () => {};
	}
	/**
	* Sets how strongly the orb should pulse, e.g. `1` while speaking and `0`
	* when quiet. The value is smoothed internally.
	* @param level - Target speaking energy in [0, 1].
	*/
	setSpeaking(level) {
		this.speakingTarget = THREE.MathUtils.clamp(level, 0, 1);
	}
	/**
	* Makes the orb gaze toward a world-space point (e.g. the object the agent is
	* pointing at). Pass `null` to look forward again.
	* @param worldTarget - The point to look at, or `null` to reset.
	*/
	lookAt(worldTarget) {
		this.gazeTarget = worldTarget ? worldTarget.clone() : null;
	}
	/**
	* Advances the orb's idle breathing, speaking pulse, point drift, and gaze.
	* @param dt - Delta time in seconds.
	*/
	update(dt) {
		this.clock += dt;
		this.speaking += (this.speakingTarget - this.speaking) * Math.min(1, dt * 8);
		const breathe = 1 + Math.sin(this.clock * 1.6) * .03;
		const talk = this.speaking * (.12 + Math.sin(this.clock * 18) * .06);
		this.core.scale.setScalar(breathe + talk);
		this.halo.scale.setScalar(breathe + talk * 1.4);
		const mat = this.halo.material;
		mat.opacity = .18 + this.speaking * .25;
		this.points.rotation.y += dt * .4;
		this.points.rotation.x += dt * .15;
		if (this.gazeTarget) {
			this.root.getWorldPosition(scratchTarget);
			scratchDir.copy(this.gazeTarget).sub(scratchTarget);
			if (scratchDir.lengthSq() > 1e-6) {
				scratchDir.normalize();
				scratchQuat.setFromUnitVectors(UP, scratchDir);
				this.gaze.quaternion.slerp(scratchQuat, Math.min(1, dt * 4));
				return;
			}
		}
		this.gaze.quaternion.slerp(scratchQuat.identity(), Math.min(1, dt * 4));
	}
};
//#endregion
export { AgentHead };
