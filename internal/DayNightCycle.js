/**
* Copyright 2025 Google LLC
*
* Licensed under the Apache License, Version 2.0 (the "License");
* you may not use this file except in compliance with the License.
* You may obtain a copy of the License at
*
*     http://www.apache.org/licenses/LICENSE-2.0
*
* Unless required by applicable law or agreed to in writing, software
* distributed under the License is distributed on an "AS IS" BASIS,
* WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
* See the License for the specific language governing permissions and
* limitations under the License.
*
* @file xrblocks.js
* @version v0.21.1
* @commitid ea6d5f3
* @builddate 2026-10-08T03:45:22.596Z
* @description XR Blocks SDK, built from source with the above commit ID.
* @agent When using with Gemini to create XR apps, use **Gemini Canvas** mode,
* and follow rules below:
* 1. Include the following importmap for maximum compatibility:
"three": "https://cdn.jsdelivr.net/npm/three@0.186.0/build/three.module.js",
"three/addons/": "https://cdn.jsdelivr.net/npm/three@0.186.0/examples/jsm/",
"@pmndrs/uikit": "https://cdn.jsdelivr.net/npm/@pmndrs/uikit@1.0.64/dist/index.min.js",
"@pmndrs/uikit-pub-sub": "https://cdn.jsdelivr.net/npm/@pmndrs/uikit-pub-sub@1.0.64/dist/index.min.js",
"@pmndrs/msdfonts": "https://cdn.jsdelivr.net/npm/@pmndrs/msdfonts@1.0.64/dist/index.min.js",
"@preact/signals-core": "https://cdn.jsdelivr.net/npm/@preact/signals-core@1.14.0/dist/signals-core.mjs",
"yoga-layout/load": "https://cdn.jsdelivr.net/npm/yoga-layout@3.2.1/dist/src/load.js",
"lit": "https://esm.sh/lit@3.3.1",
"lit/": "https://esm.sh/lit@3.3.1/",
"three-pathfinding": "https://cdn.jsdelivr.net/npm/three-pathfinding@1.3.0/dist/three-pathfinding.module.js",
2. If the app focus on standalone objects, spawn it in front of the user in
WebXR and rescale to reasonable physical size. Wrap them with xb.ModelViewer
and make sure users can drag the platform to move it around in XR.
3. When rendering a large scene, remember users may navigate the scene in a
physical world space, also add locomotion methods like pinch to teleport.
4. Do not halluciate mode files --- use either public high-quality assets,
or generate from primitive shapes of use vox formats for voxels or
lego-styles.
*/
import { i as disposeObjectTree } from "./ThreeDisposal.js";
import * as THREE from "three";
//#region src/simulator/lighting/bakePairing.ts
/**
* Pure THREE geometry helpers for pairing the day and night bakes of an
* environment and extracting the geometry that differs between them (window
* shades). Ported from the validated day/night spike.
*/
/**
* Quantized world-position key (~5 mm grid): vertices at the same key are the
* same point across the two bakes.
*/
function quantizeKey(v) {
	return [
		v.x,
		v.y,
		v.z
	].map((x) => Math.round(x * 200)).join(",");
}
/**
* GLB meshes are non-indexed triangle soup with no normals, so
* computeVertexNormals gives flat per-face normals and curved cloth visibly
* facets under the real-time sun. Average the face normals at each shared
* position - but only across faces within ~50 degrees of each other
* (crease-aware): averaging across hard edges tilted flat walls' corner
* vertices and painted a smooth gradient wash over the whole wall panel. The
* unlit bake base never reads normals, so the endpoints stay pixel-faithful.
*/
function smoothNormalsByPosition(geo, creaseDeg = 50) {
	const pos = geo.getAttribute("position");
	const index = geo.index;
	const triCount = index ? index.count / 3 : pos.count / 3;
	const vertAt = (t, k) => index ? index.getX(t * 3 + k) : t * 3 + k;
	const key = (i) => Math.round(pos.getX(i) * 2e3) + "," + Math.round(pos.getY(i) * 2e3) + "," + Math.round(pos.getZ(i) * 2e3);
	const face = new Array(triCount);
	const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3(), ab = new THREE.Vector3(), ac = new THREE.Vector3();
	for (let t = 0; t < triCount; t++) {
		a.fromBufferAttribute(pos, vertAt(t, 0));
		b.fromBufferAttribute(pos, vertAt(t, 1));
		c.fromBufferAttribute(pos, vertAt(t, 2));
		ab.subVectors(b, a);
		ac.subVectors(c, a);
		const n = new THREE.Vector3().crossVectors(ab, ac);
		const l = n.length();
		face[t] = l > 1e-12 ? n.divideScalar(l) : new THREE.Vector3(0, 1, 0);
	}
	const groups = /* @__PURE__ */ new Map();
	for (let t = 0; t < triCount; t++) for (let k = 0; k < 3; k++) {
		const kk = key(vertAt(t, k));
		let g = groups.get(kk);
		if (!g) groups.set(kk, g = []);
		g.push(t);
	}
	const cosCrease = Math.cos(THREE.MathUtils.degToRad(creaseDeg));
	const cosFlat = Math.cos(THREE.MathUtils.degToRad(5));
	const nor = new Float32Array(pos.count * 3);
	const acc = new THREE.Vector3();
	for (let t = 0; t < triCount; t++) {
		const fn = face[t];
		for (let k = 0; k < 3; k++) {
			const i = vertAt(t, k);
			const g = groups.get(key(i));
			acc.set(0, 0, 0);
			let count = 0;
			let flat = true;
			for (const tt of g) {
				const fo = face[tt];
				if (fo.dot(fn) < cosCrease) continue;
				if (fo.dot(fn) < cosFlat) flat = false;
				acc.add(fo);
				count++;
			}
			if (!count) {
				acc.copy(fn);
				count = 1;
			}
			if (flat) {
				nor[i * 3] = fn.x;
				nor[i * 3 + 1] = fn.y;
				nor[i * 3 + 2] = fn.z;
				continue;
			}
			const l = acc.length() || 1;
			nor[i * 3] = acc.x / l;
			nor[i * 3 + 1] = acc.y / l;
			nor[i * 3 + 2] = acc.z / l;
		}
	}
	geo.setAttribute("normal", new THREE.BufferAttribute(nor, 3));
}
/**
* Collects per-mesh bounding data and bake-space vertices for mesh pairing.
* Positions are computed relative to `root`, so two scenes rooted at their own
* group (one of which may sit inside a transformed environment root) compare
* in their shared authored space.
*/
function collectMeshEntries(root) {
	root.updateMatrixWorld(true);
	const toRoot = new THREE.Matrix4().copy(root.matrixWorld).invert();
	const out = [];
	root.traverse((o) => {
		const mesh = o;
		if (!mesh.isMesh) return;
		const matrix = new THREE.Matrix4().multiplyMatrices(toRoot, mesh.matrixWorld);
		const pos = mesh.geometry.getAttribute("position");
		const world = new THREE.Vector3();
		const verts = /* @__PURE__ */ new Set();
		const worldPositions = [];
		const box = new THREE.Box3();
		for (let i = 0; i < pos.count; i++) {
			const p = world.fromBufferAttribute(pos, i).applyMatrix4(matrix).clone();
			worldPositions.push(p);
			verts.add(quantizeKey(p));
			box.expandByPoint(p);
		}
		out.push({
			mesh,
			center: box.getCenter(new THREE.Vector3()),
			size: box.getSize(new THREE.Vector3()),
			verts,
			worldPositions
		});
	});
	return out;
}
/**
* Pairs each night mesh with the nearest unused day mesh whose world bounds
* match (the two bakes share vertex-identical geometry for most primitives).
*/
function pairMeshesByBounds(night, day) {
	const used = /* @__PURE__ */ new Set();
	const pairs = [];
	for (const n of night) {
		let best = -1;
		let bestDistance = Infinity;
		day.forEach((d, i) => {
			if (used.has(i)) return;
			const centerDistance = n.center.distanceTo(d.center);
			const sizeDistance = n.size.distanceTo(d.size);
			if (centerDistance < .05 && sizeDistance < .05) {
				if (centerDistance < bestDistance) {
					bestDistance = centerDistance;
					best = i;
				}
			}
		});
		if (best >= 0) {
			used.add(best);
			pairs.push({
				night: n,
				day: day[best]
			});
		}
	}
	return pairs;
}
/**
* Splits the night-only triangles (the state geometry: window shades merged
* into the room shells) out of a night mesh into their own geometry, baked to
* bake space. The day body keeps the day geometry.
*/
function splitNightStateMesh(entry, extraKeys) {
	const geo = entry.mesh.geometry;
	const pos = geo.getAttribute("position");
	const uv = geo.getAttribute("uv");
	const index = geo.index;
	const triCount = index ? index.count / 3 : pos.count / 3;
	const isExtra = entry.worldPositions.map((p) => extraKeys.has(quantizeKey(p)));
	const shade = {
		pos: [],
		uv: []
	};
	for (let t = 0; t < triCount; t++) {
		const i0 = index ? index.getX(t * 3) : t * 3;
		const i1 = index ? index.getX(t * 3 + 1) : t * 3 + 1;
		const i2 = index ? index.getX(t * 3 + 2) : t * 3 + 2;
		if ((isExtra[i0] ? 1 : 0) + (isExtra[i1] ? 1 : 0) + (isExtra[i2] ? 1 : 0) < 1) continue;
		for (const i of [
			i0,
			i1,
			i2
		]) {
			const world = entry.worldPositions[i];
			shade.pos.push(world.x, world.y, world.z);
			if (uv) shade.uv.push(uv.getX(i), uv.getY(i));
		}
	}
	const g = new THREE.BufferGeometry();
	g.setAttribute("position", new THREE.Float32BufferAttribute(shade.pos, 3));
	if (shade.uv.length) g.setAttribute("uv", new THREE.Float32BufferAttribute(shade.uv, 2));
	smoothNormalsByPosition(g);
	return g;
}
/**
* Splits a shade geometry into per-window blind groups (clustered in the x/z
* plane) so each blind rolls about its OWN housing top, not one shared edge
* (windows sit at different heights on different walls).
*/
function clusterBlinds(shadeGeo) {
	const pos = shadeGeo.getAttribute("position");
	const uv = shadeGeo.getAttribute("uv");
	const triCount = pos.count / 3;
	const cents = [];
	for (let i = 0; i < triCount; i++) cents.push([
		(pos.getX(i * 3) + pos.getX(i * 3 + 1) + pos.getX(i * 3 + 2)) / 3,
		(pos.getY(i * 3) + pos.getY(i * 3 + 1) + pos.getY(i * 3 + 2)) / 3,
		(pos.getZ(i * 3) + pos.getZ(i * 3 + 1) + pos.getZ(i * 3 + 2)) / 3
	]);
	const parent = [...Array(triCount).keys()];
	const find = (a) => parent[a] === a ? a : parent[a] = find(parent[a]);
	const R = .6;
	for (let i = 0; i < triCount; i++) for (let j = i + 1; j < triCount; j++) {
		const dx = cents[i][0] - cents[j][0];
		const dz = cents[i][2] - cents[j][2];
		if (dx * dx + dz * dz < R * R) parent[find(i)] = find(j);
	}
	const groups = /* @__PURE__ */ new Map();
	for (let i = 0; i < triCount; i++) {
		const r = find(i);
		if (!groups.has(r)) groups.set(r, []);
		groups.get(r).push(i);
	}
	const out = [];
	for (const tris of groups.values()) {
		const bucket = {
			pos: [],
			uv: []
		};
		let topY = -1e9;
		for (const t of tris) for (let k = 0; k < 3; k++) {
			const i = t * 3 + k;
			bucket.pos.push(pos.getX(i), pos.getY(i), pos.getZ(i));
			if (uv) bucket.uv.push(uv.getX(i), uv.getY(i));
			topY = Math.max(topY, pos.getY(i));
		}
		const g = new THREE.BufferGeometry();
		g.setAttribute("position", new THREE.Float32BufferAttribute(bucket.pos, 3));
		if (bucket.uv.length) g.setAttribute("uv", new THREE.Float32BufferAttribute(bucket.uv, 2));
		smoothNormalsByPosition(g);
		out.push({
			geo: g,
			topY
		});
	}
	return out;
}
//#endregion
//#region src/simulator/lighting/dayNightSchedule.ts
function smoothstep(a, b, x) {
	const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
	return t * t * (3 - 2 * t);
}
/**
* Time-of-day controller curves, ported verbatim from the validated day/night
* spike. The base is the day/night bake crossfade (mixU); the moving sun lives
* in an additive layer on top whose strength is ZERO at both endpoints, so t=0
* and t=1 render the raw bakes exactly. Every additive term also dies at
* sunset so nothing paints washes over the night bake's baked lamp gradients.
*/
function dayNightSchedule(tRaw) {
	const t = Math.min(1, Math.max(0, tRaw));
	const mixU = smoothstep(.38, .62, t);
	const dayness = 1 - smoothstep(.45, .62, t);
	const elevation = THREE.MathUtils.degToRad(50 - 48 * smoothstep(0, .8, t));
	const azimuth = THREE.MathUtils.degToRad(-50 + 95 * t);
	const r = 30;
	const sunPosition = [
		Math.cos(elevation) * Math.cos(azimuth) * r,
		Math.sin(elevation) * r,
		Math.cos(elevation) * Math.sin(azimuth) * r
	];
	const sunIntensity = .35 * mixU * dayness;
	const warmth = smoothstep(.35, .8, t);
	const sunColor = [
		1,
		1 - .35 * warmth,
		1 - .72 * warmth
	];
	const bElev = THREE.MathUtils.degToRad(20);
	return {
		t,
		mixU,
		dayness,
		elevation,
		azimuth,
		sunPosition,
		sunIntensity,
		warmth,
		sunColor,
		bouncePosition: [
			Math.cos(bElev) * Math.cos(azimuth) * r,
			Math.sin(bElev) * r,
			Math.cos(bElev) * Math.sin(azimuth) * r
		],
		bounceIntensity: .25 * mixU * (1 - smoothstep(.45, .62, t)),
		bounceColor: [
			1,
			.97 - .12 * warmth,
			.9 - .3 * warmth
		],
		skyFillIntensity: .05 * mixU * (1 - smoothstep(.5, .68, t)),
		skyFillColor: [
			.55 - .4 * warmth,
			.66 - .5 * warmth,
			.88 - .56 * warmth
		],
		blindsHardware: smoothstep(.47, .56, t),
		blindsRoll: smoothstep(.5, .82, t),
		rugOpacity: 1 - smoothstep(.3, .65, t)
	};
}
//#endregion
//#region src/simulator/lighting/DayNightCycle.ts
let warnedNonWebGL = false;
/**
* Removes the hemisphere-light accumulation from three's `lights_fragment_begin`
* chunk so only directional lights (the rig's sun and window bounce) shade the
* additive overlay - scene lights are gathered per scene, so without this the
* simulator's own hemisphere fill washes over the additive layer. Returns null
* when the chunk does not have the expected shape (fail safe: the overlay then
* keeps the stock shader).
*/
function stripHemisphereIrradiance(chunk) {
	const start = chunk.indexOf("#if ( NUM_HEMI_LIGHTS > 0 )");
	if (start === -1) return null;
	const end = chunk.indexOf("#endif", start);
	if (end === -1) return null;
	return chunk.slice(0, start) + chunk.slice(end + 6);
}
const LIGHTS_BEGIN_WITHOUT_HEMISPHERE = stripHemisphereIrradiance(THREE.ShaderChunk.lights_fragment_begin);
/**
* Lazily-loaded day/night lighting for environments whose manifest declares a
* paired night bake. The base is the day/night bake crossfade (per-mesh
* texture blend, endpoint-exact) and the moving sun lives in an additive
* overlay layer on top whose intensity is ZERO at both endpoints, so t=0 and
* t=1 render the raw bakes pixel-identically.
*
* Nothing is loaded or allocated until {@link DayNightCycle.preload} (or the
* first {@link DayNightCycle.setTimeOfDay}) runs.
*/
var DayNightCycle = class DayNightCycle {
	constructor(options) {
		this.options = options;
		this.timeOfDayValue = 0;
		this.built = false;
		this.disposed = false;
		this.generation = 0;
		this.restores = [];
		this.pairedDayMeshes = /* @__PURE__ */ new Set();
		this.ownedGeometries = /* @__PURE__ */ new Set();
		this.replacedMaterials = [];
		this.blendMaterials = [];
		this.overlays = [];
		this.shadeGroups = [];
		this.dayOnlyMeshes = [];
		this.createdMeshes = [];
		this.createdMaterials = [];
		this.skyMix = { value: 0 };
	}
	/**
	* Creates a cycle for a WebGL renderer. Returns null (day-only, no overhead)
	* on WebGPU: the blend shader uses onBeforeCompile, which the WebGPU
	* backend does not support.
	*/
	static async create(options) {
		if (!options.renderer?.isWebGLRenderer) {
			if (!warnedNonWebGL) {
				warnedNonWebGL = true;
				console.warn("DayNightCycle: day/night lighting requires a WebGL renderer; this environment stays day-only.");
			}
			return null;
		}
		return new DayNightCycle(options);
	}
	/** Current time of day (0 = day endpoint, 1 = night endpoint). */
	get timeOfDay() {
		return this.timeOfDayValue;
	}
	/** True once the night bake has been fetched and built. */
	get preloaded() {
		return this.built;
	}
	/**
	* Fetches the night bake once and builds the blend/overlay rig. Idempotent;
	* concurrent callers share one load.
	*/
	preload() {
		if (this.built) return Promise.resolve();
		if (!this.preloadPromise) this.preloadPromise = this.build().catch((error) => {
			console.warn("DayNightCycle: failed to preload the night bake.", error);
		});
		return this.preloadPromise;
	}
	/**
	* Sets the time of day. Fires the preload on first use and applies the
	* stored value as soon as the rig is built.
	*/
	setTimeOfDay(t) {
		this.timeOfDayValue = Math.min(1, Math.max(0, t));
		if (!this.built) {
			this.preload();
			return;
		}
		this.apply();
	}
	/**
	* Restores every replaced day material/geometry, removes the shade/overlay
	* meshes and lights, restores the renderer shadow-map settings, and disposes
	* the night resources. Idempotent.
	*/
	dispose() {
		if (this.disposed) return;
		this.disposed = true;
		this.generation++;
		for (const mesh of this.createdMeshes) mesh.removeFromParent();
		for (const overlay of this.overlays) {
			overlay.removeFromParent();
			overlay.material.dispose();
		}
		for (const material of this.createdMaterials) material.dispose();
		this.sunTarget?.removeFromParent();
		this.sun?.removeFromParent();
		this.bounceTarget?.removeFromParent();
		this.bounce?.removeFromParent();
		this.skyFill?.removeFromParent();
		for (const state of this.restores) {
			state.mesh.geometry = state.geometry;
			state.mesh.material = state.material;
			state.mesh.position.copy(state.position);
			state.mesh.quaternion.copy(state.quaternion);
			state.mesh.scale.copy(state.scale);
		}
		for (const material of this.replacedMaterials) material.dispose();
		for (const geometry of this.ownedGeometries) geometry.dispose();
		if (this.nightScene) {
			disposeObjectTree(this.nightScene);
			this.nightScene = void 0;
		}
		const shadowMap = this.options.renderer.shadowMap;
		if (this.savedShadowMap) {
			shadowMap.enabled = this.savedShadowMap.enabled;
			shadowMap.type = this.savedShadowMap.type;
			this.savedShadowMap = void 0;
		}
	}
	async build() {
		const generation = this.generation;
		const gltf = await this.options.loader.loadGLTF({
			url: this.options.lighting.nightScenePath,
			renderer: this.options.renderer
		});
		if (this.disposed || generation !== this.generation) return;
		const { root, dayScene } = this.options;
		const nightScene = gltf.scene;
		this.nightScene = nightScene;
		this.bakeWorldTransforms(dayScene);
		this.bakeWorldTransforms(nightScene);
		const dayEntries = collectMeshEntries(dayScene);
		const nightEntries = collectMeshEntries(nightScene);
		const pairs = pairMeshesByBounds(nightEntries, dayEntries);
		for (const { night, day } of pairs) {
			const dayMaterial = day.mesh.material;
			const isOutdoor = /outside|sky/i.test(dayMaterial.name);
			smoothNormalsByPosition(day.mesh.geometry);
			if (!isOutdoor) {
				day.mesh.castShadow = true;
				day.mesh.receiveShadow = true;
			}
			const mapDay = dayMaterial.map;
			const mapNight = night.mesh.material.map;
			if (mapDay && mapNight) {
				const mat = this.buildBlendMaterial(dayMaterial, mapDay, mapNight);
				mat.name = dayMaterial.name;
				day.mesh.material = mat;
				this.blendMaterials.push(mat);
				this.replacedMaterials.push(mat);
				this.pairedDayMeshes.add(day.mesh);
				if (isOutdoor) continue;
				this.addOverlay(day.mesh.geometry);
			}
			const extra = /Bake home office|Bake living room bottom/.test(night.mesh.material.name) ? new Set([...night.verts].filter((v) => !day.verts.has(v))) : /* @__PURE__ */ new Set();
			if (extra.size < 12) continue;
			const shadeGeo = splitNightStateMesh(night, extra);
			if (shadeGeo.getAttribute("position").count === 0) {
				shadeGeo.dispose();
				continue;
			}
			for (const blind of clusterBlinds(shadeGeo)) {
				this.ownedGeometries.add(blind.geo);
				if (blind.topY < .5) continue;
				this.addShade(night, blind);
			}
			this.ownedGeometries.add(shadeGeo);
		}
		for (const day of dayEntries) {
			if (pairs.some((pair) => pair.day === day)) continue;
			const dayMaterial = day.mesh.material;
			smoothNormalsByPosition(day.mesh.geometry);
			day.mesh.castShadow = true;
			day.mesh.receiveShadow = true;
			const mat = dayMaterial.clone();
			mat.transparent = true;
			mat.polygonOffset = true;
			mat.polygonOffsetFactor = -2;
			mat.polygonOffsetUnits = -2;
			day.mesh.material = mat;
			this.replacedMaterials.push(mat);
			this.dayOnlyMeshes.push(day.mesh);
		}
		let skyN;
		let skyD;
		for (const e of nightEntries) if (!skyN || e.size.length() > skyN.size.length()) skyN = e;
		for (const e of dayEntries) if (!skyD || e.size.length() > skyD.size.length()) skyD = e;
		const skyMapDay = skyD ? skyD.mesh.material.map : null;
		const skyMapNight = skyN ? skyN.mesh.material.map : null;
		if (skyN && skyD && skyMapDay && skyMapNight && !this.pairedDayMeshes.has(skyD.mesh)) {
			const sky = skyN.mesh.clone();
			const mat = skyN.mesh.material.clone();
			const skyMix = this.skyMix;
			mat.onBeforeCompile = (shader) => {
				shader.uniforms.mapDay = { value: skyMapDay };
				shader.uniforms.uMix = skyMix;
				shader.fragmentShader = "uniform sampler2D mapDay;\nuniform float uMix;\n" + shader.fragmentShader.replace("#include <map_fragment>", `
            vec4 texelDay = texture2D( mapDay, vMapUv );
            vec4 texelNight = texture2D( map, vMapUv );
            diffuseColor *= mix( texelDay, texelNight, uMix );
            `);
			};
			mat.customProgramCacheKey = () => "daynight-sky";
			sky.material = mat;
			sky.castShadow = false;
			sky.receiveShadow = false;
			root.add(sky);
			this.createdMeshes.push(sky);
			this.createdMaterials.push(mat);
		}
		const sun = new THREE.DirectionalLight(16777215, 3);
		sun.castShadow = true;
		sun.shadow.mapSize.set(4096, 4096);
		sun.shadow.camera.near = 20;
		sun.shadow.camera.far = 60;
		sun.shadow.camera.left = -11;
		sun.shadow.camera.right = 11;
		sun.shadow.camera.top = 11;
		sun.shadow.camera.bottom = -11;
		sun.shadow.bias = -5e-4;
		sun.shadow.normalBias = .08;
		sun.shadow.radius = 30;
		const sunTarget = new THREE.Object3D();
		sunTarget.position.set(0, 1.5, .5);
		root.add(sunTarget);
		sun.target = sunTarget;
		root.add(sun);
		this.sun = sun;
		this.sunTarget = sunTarget;
		const bounce = new THREE.DirectionalLight(16774112, 0);
		const bounceTarget = new THREE.Object3D();
		bounceTarget.position.set(0, 1, 0);
		root.add(bounceTarget);
		bounce.target = bounceTarget;
		root.add(bounce);
		this.bounce = bounce;
		this.bounceTarget = bounceTarget;
		const skyFill = new THREE.HemisphereLight(8893951, 3813160, .6);
		root.add(skyFill);
		this.skyFill = skyFill;
		const shadowMap = this.options.renderer.shadowMap;
		this.savedShadowMap = {
			enabled: shadowMap.enabled,
			type: shadowMap.type
		};
		shadowMap.enabled = true;
		shadowMap.type = THREE.PCFShadowMap;
		sun.shadow.autoUpdate = false;
		this.built = true;
		this.apply();
	}
	/**
	* Bake each mesh's world transform (relative to the scene root, so a night
	* and day scene stay in their shared authored space even under a
	* transformed environment root) into cloned geometry and reset node TRS.
	*/
	bakeWorldTransforms(sceneRoot) {
		sceneRoot.updateMatrixWorld(true);
		const toRoot = new THREE.Matrix4().copy(sceneRoot.matrixWorld).invert();
		sceneRoot.traverse((o) => {
			const mesh = o;
			if (!mesh.isMesh) return;
			const matrix = new THREE.Matrix4().multiplyMatrices(toRoot, mesh.matrixWorld);
			const baked = mesh.geometry.clone().applyMatrix4(matrix);
			this.ownedGeometries.add(baked);
			this.restores.push({
				mesh,
				geometry: mesh.geometry,
				material: mesh.material,
				position: mesh.position.clone(),
				quaternion: mesh.quaternion.clone(),
				scale: mesh.scale.clone()
			});
			mesh.geometry = baked;
			mesh.position.set(0, 0, 0);
			mesh.rotation.set(0, 0, 0);
			mesh.scale.set(1, 1, 1);
		});
	}
	/**
	* Day/night bake crossfade on one unlit base material. The additive sun
	* layer on top is what moves; the base only crossfades the two bakes so the
	* endpoints stay pixel-faithful to the reference GLBs.
	*/
	buildBlendMaterial(base, mapDay, mapNight) {
		const material = base.clone();
		material.map = mapDay;
		material.userData.pendingMixU = 0;
		material.onBeforeCompile = (shader) => {
			shader.uniforms.mapNight = { value: mapNight };
			shader.uniforms.mixU = { value: material.userData.pendingMixU ?? 0 };
			shader.fragmentShader = shader.fragmentShader.replace("#include <common>", "#include <common>\nuniform sampler2D mapNight;\nuniform float mixU;").replace("#include <map_fragment>", `{
          vec4 texDay = texture2D( map, vMapUv );
          vec4 texNight = texture2D( mapNight, vMapUv );
          vec4 sampledDiffuseColor = mix( texDay, texNight, mixU );
          diffuseColor *= sampledDiffuseColor;
        }`);
			material.userData.shader = shader;
		};
		material.customProgramCacheKey = () => "daynight-blend";
		return material;
	}
	/**
	* Additive sun/sky-fill overlay sharing the body geometry. Phong (not
	* Lambert): Lambert shades per-vertex, so the GLBs' large triangles showed
	* triangle-shaped gradients on cloth; Phong with no specular is the same
	* flat diffuse but per-fragment. Hidden at both endpoints so the scene
	* renders exactly the raw bake.
	*/
	addOverlay(geometry, parent = this.options.root) {
		const material = new THREE.MeshPhongMaterial({
			color: 16777215,
			specular: 0,
			shininess: 0,
			blending: THREE.AdditiveBlending,
			transparent: true,
			depthWrite: false
		});
		if (LIGHTS_BEGIN_WITHOUT_HEMISPHERE) {
			material.onBeforeCompile = (shader) => {
				shader.fragmentShader = shader.fragmentShader.replace("#include <lights_fragment_begin>", LIGHTS_BEGIN_WITHOUT_HEMISPHERE);
			};
			material.customProgramCacheKey = () => "daynight-overlay";
		}
		const overlay = new THREE.Mesh(geometry, material);
		overlay.castShadow = false;
		overlay.receiveShadow = true;
		parent.add(overlay);
		this.overlays.push(overlay);
		this.createdMaterials.push(material);
	}
	/** A roller-shade blind rolling about its own housing top edge. */
	addShade(night, blind) {
		const shade = night.mesh.clone();
		shade.geometry = blind.geo;
		const material = night.mesh.material.clone();
		material.transparent = true;
		shade.material = material;
		blind.geo.translate(0, -blind.topY, 0);
		shade.position.y = blind.topY;
		shade.castShadow = true;
		shade.receiveShadow = true;
		this.options.root.add(shade);
		this.createdMeshes.push(shade);
		this.createdMaterials.push(material);
		this.shadeGroups.push({
			mesh: shade,
			topY: blind.topY
		});
		this.addOverlay(blind.geo, shade);
	}
	apply() {
		const values = dayNightSchedule(this.timeOfDayValue);
		for (const material of this.blendMaterials) {
			const shader = material.userData.shader;
			if (shader) shader.uniforms.mixU.value = values.mixU;
			material.userData.pendingMixU = values.mixU;
		}
		this.skyMix.value = values.mixU;
		this.sun?.position.set(...values.sunPosition);
		if (this.sun) {
			this.sun.intensity = values.sunIntensity;
			this.sun.color.setRGB(...values.sunColor);
		}
		this.bounce?.position.set(...values.bouncePosition);
		if (this.bounce) {
			this.bounce.intensity = values.bounceIntensity;
			this.bounce.color.setRGB(...values.bounceColor);
		}
		if (this.skyFill) {
			this.skyFill.intensity = values.skyFillIntensity;
			this.skyFill.color.setRGB(...values.skyFillColor);
		}
		const overlayActive = Math.max(values.sunIntensity, values.bounceIntensity, values.skyFillIntensity) > .001;
		for (const overlay of this.overlays) {
			overlay.visible = overlayActive;
			overlay.material.emissive.setRGB(values.skyFillColor[0] * values.skyFillIntensity / Math.PI, values.skyFillColor[1] * values.skyFillIntensity / Math.PI, values.skyFillColor[2] * values.skyFillIntensity / Math.PI);
		}
		for (const s of this.shadeGroups) {
			s.mesh.visible = values.blindsHardware > .01;
			s.mesh.material.opacity = values.blindsHardware;
			s.mesh.scale.y = .04 + .96 * values.blindsRoll;
		}
		for (const mesh of this.dayOnlyMeshes) {
			const material = mesh.material;
			material.opacity = values.rugOpacity;
			mesh.visible = values.rugOpacity > .01;
		}
		if (this.sun) this.sun.shadow.needsUpdate = true;
	}
};
//#endregion
export { DayNightCycle };

//# sourceMappingURL=DayNightCycle.js.map