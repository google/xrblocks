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
* @commitid 051fd94
* @builddate 2026-10-06T18:24:07.459Z
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
//#region src/utils/ThreeDisposal.ts
function disposeMaterial(material, except = /* @__PURE__ */ new Set()) {
	if (!material) return;
	const materials = Array.isArray(material) ? material : [material];
	for (const item of materials) if (!except.has(item)) item.dispose();
}
function disposeMeshResources(mesh) {
	disposeRenderableResources(mesh);
}
function disposeRenderableResources(object) {
	const renderable = object;
	renderable.geometry?.dispose?.();
	disposeMaterial(renderable.material);
}
function hasRenderableResources(object) {
	const renderable = object;
	return !!(renderable.geometry || renderable.material);
}
function disposeObjectTree(object) {
	for (const child of [...object.children]) {
		disposeObjectTree(child);
		object.remove(child);
	}
	if (hasRenderableResources(object)) disposeRenderableResources(object);
	object.dispose?.();
}
function disposeObjectChildren(object) {
	for (const child of [...object.children]) {
		disposeObjectTree(child);
		object.remove(child);
	}
}
//#endregion
export { disposeRenderableResources as a, disposeObjectTree as i, disposeMeshResources as n, disposeObjectChildren as r, disposeMaterial as t };

//# sourceMappingURL=ThreeDisposal.js.map