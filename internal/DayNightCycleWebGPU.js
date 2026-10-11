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
* @version v0.22.0
* @commitid cb6ce16
* @builddate 2026-10-11T05:19:49.302Z
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
import * as THREE from "three";
import { color, lights, mix, texture, uniform, vec4 } from "three/tsl";
import { MeshBasicNodeMaterial, MeshPhongNodeMaterial } from "three/webgpu";
//#region src/simulator/lighting/DayNightCycleWebGPU.ts
/**
* Node-material rig that replaces the `onBeforeCompile` day/night blend
* shaders when {@link DayNightCycle} runs on `THREE.WebGPURenderer` (whose
* backend cannot patch built-in GLSL). One shared {@link mix} uniform drives
* every blend material, mirroring how the WebGL path pushes one `mixU` value
* into each patched program.
*/
var DayNightWebGPURig = class {
	constructor() {
		this.mixU = uniform(0);
	}
	/**
	* Day/night bake crossfade on one unlit base material: the output is the
	* authored base color multiplied by `mix(day, night, mixU)`, with the base
	* material's opacity folded in afterwards exactly like `MeshBasicMaterial`
	* (`diffuseColor *= sampled` then `a *= opacity`).
	*/
	buildBlendMaterial(base, mapDay, mapNight) {
		const material = new MeshBasicNodeMaterial();
		material.name = base.name;
		material.color.copy(base.color);
		material.opacity = base.opacity;
		material.transparent = base.transparent;
		material.alphaTest = base.alphaTest;
		material.side = base.side;
		material.toneMapped = base.toneMapped;
		material.fog = base.fog;
		material.depthTest = base.depthTest;
		material.depthWrite = base.depthWrite;
		material.blending = base.blending;
		material.map = mapDay;
		const texMix = mix(texture(mapDay), texture(mapNight), this.mixU);
		const tint = color(base.color);
		material.colorNode = vec4(tint.x.mul(texMix.x), tint.y.mul(texMix.y), tint.z.mul(texMix.z), texMix.w);
		return material;
	}
	/**
	* Additive sun/sky-fill overlay material. The equivalent of the WebGL
	* `stripHemisphereIrradiance` patch is
	* {@link DayNightWebGPURig.restrictOverlayLights}, which pins the material
	* to the rig's directional lights (node materials cannot edit built-in GLSL
	* chunks).
	*/
	buildOverlayMaterial() {
		return new MeshPhongNodeMaterial({
			color: 16777215,
			specular: 0,
			shininess: 0,
			blending: THREE.AdditiveBlending,
			transparent: true,
			depthWrite: false
		});
	}
	/**
	* Restricts overlay materials to the given lights (the rig's sun and window
	* bounce) so hemisphere fill lights — the simulator's own and the rig's
	* skyFill — cannot wash over the additive layer.
	*/
	restrictOverlayLights(materials, rigLights) {
		const lightsNode = lights(rigLights);
		for (const material of materials) material.lightsNode = lightsNode;
	}
};
//#endregion
export { DayNightWebGPURig };

//# sourceMappingURL=DayNightCycleWebGPU.js.map