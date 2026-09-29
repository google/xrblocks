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
* @commitid 7451068
* @builddate 2026-09-29T21:57:03.512Z
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
//#region src/constants.ts
/**
* The number of hands tracked in a typical XR session (left and right).
*/
const NUM_HANDS = 2;
/**
* The number of joints per hand tracked in a typical XR session.
*/
const HAND_JOINT_COUNT = 25;
/**
* The pairs of joints as an adjcent list.
*/
const HAND_JOINT_IDX_CONNECTION_MAP = [
	[1, 2],
	[2, 3],
	[3, 4],
	[5, 6],
	[6, 7],
	[7, 8],
	[8, 9],
	[10, 11],
	[11, 12],
	[12, 13],
	[13, 14],
	[15, 16],
	[16, 17],
	[17, 18],
	[18, 19],
	[20, 21],
	[21, 22],
	[22, 23],
	[23, 24]
];
/**
* The pairs of bones' ids per angle as an adjcent list.
*/
const HAND_BONE_IDX_CONNECTION_MAP = [
	[0, 1],
	[1, 2],
	[3, 4],
	[4, 5],
	[5, 6],
	[7, 8],
	[8, 9],
	[9, 10],
	[11, 12],
	[12, 13],
	[13, 14],
	[15, 16],
	[16, 17],
	[17, 18]
];
/**
* A small depth offset (in meters) applied between layered UI elements to
* prevent Z-fighting, which is a visual artifact where surfaces at similar
* depths appear to flicker.
*/
const VIEW_DEPTH_GAP = .002;
/**
* The THREE.js rendering layer used exclusively for objects that should only be
* visible to the left eye's camera in stereoscopic rendering.
*/
const LEFT_VIEW_ONLY_LAYER = 1;
/**
* The THREE.js rendering layer used exclusively for objects that should only be
* visible to the right eye's camera in stereoscopic rendering.
*/
const RIGHT_VIEW_ONLY_LAYER = 2;
/**
* The THREE.js rendering layer for virtual objects that should be realistically
* occluded by real-world objects when depth sensing is active.
*/
const OCCLUDABLE_ITEMS_LAYER = 3;
/**
* The default ideal width in pixels for requesting the device camera stream.
* Corresponds to a 720p resolution.
*/
const DEFAULT_DEVICE_CAMERA_WIDTH = 1280;
/**
* The default ideal height in pixels for requesting the device camera stream.
* Corresponds to a 720p resolution.
*/
const DEFAULT_DEVICE_CAMERA_HEIGHT = 720;
const XR_BLOCKS_ASSETS_PATH = "https://cdn.jsdelivr.net/gh/xrblocks/assets@5582bd1b2d1a4e19f7ee7093b63a5ee328e974ac/";
//#endregion
export { HAND_JOINT_IDX_CONNECTION_MAP as a, OCCLUDABLE_ITEMS_LAYER as c, XR_BLOCKS_ASSETS_PATH as d, HAND_JOINT_COUNT as i, RIGHT_VIEW_ONLY_LAYER as l, DEFAULT_DEVICE_CAMERA_WIDTH as n, LEFT_VIEW_ONLY_LAYER as o, HAND_BONE_IDX_CONNECTION_MAP as r, NUM_HANDS as s, DEFAULT_DEVICE_CAMERA_HEIGHT as t, VIEW_DEPTH_GAP as u };

//# sourceMappingURL=constants.js.map