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
 * @commitid 4d7c04d
 * @builddate 2026-09-26T01:40:17.499Z
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
import * as THREE from 'three';
import { uniform, vec4, positionWorld, max, float, vec2, texture, Fn, clamp, select, materialOpacity } from 'three/tsl';

/**
 * Configures a `THREE.Material` for depth occlusion under `THREE.WebGPURenderer`
 * by attaching a TSL `opacityNode` and returning a `Shader`-compatible uniform
 * handle that can be registered in `Depth.occludableShaders`.
 *
 * @param material - The material to make occludable.
 * @returns A `Shader` object whose `uniforms` stay synchronized with the TSL nodes.
 */
function addWebGPUOcclusionToMaterial(material) {
    material.transparent = true;
    const placeholderTexture = new THREE.DataTexture(new Uint8Array([255, 255, 0, 255]), 1, 1, THREE.RGBAFormat);
    placeholderTexture.needsUpdate = true;
    const uOcclusionEnabled = uniform(1.0);
    const clipFromWorldMatrix = new THREE.Matrix4();
    const uOcclusionClipFromWorld = uniform(clipFromWorldMatrix);
    const clipCoord = uOcclusionClipFromWorld.mul(vec4(positionWorld, 1.0));
    const ndc = clipCoord.xy.div(max(float(0.0001), clipCoord.w));
    const occlusionCoords = vec2(ndc.x.mul(0.5).add(0.5), float(0.5).sub(ndc.y.mul(0.5)));
    const occlusionMapNode = texture(placeholderTexture, occlusionCoords);
    const opacityNode = Fn(() => {
        const sampleRg = occlusionMapNode;
        const normalizedSample = sampleRg.r.div(max(float(0.0001), sampleRg.g));
        const occlusionValue = clamp(normalizedSample, float(0.0), float(1.0));
        const occlusionFactor = select(uOcclusionEnabled.greaterThan(0.5), occlusionValue, float(1.0));
        return materialOpacity.mul(occlusionFactor);
    })();
    material.opacityNode = opacityNode;
    material.needsUpdate = true;
    let currentOcclusionEnabled = true;
    let currentOcclusionMap = placeholderTexture;
    const uniforms = {
        occlusionEnabled: {
            get value() {
                return currentOcclusionEnabled;
            },
            set value(enabled) {
                currentOcclusionEnabled = Boolean(enabled);
                uOcclusionEnabled.value = currentOcclusionEnabled ? 1.0 : 0.0;
            },
        },
        tOcclusionMap: {
            get value() {
                return currentOcclusionMap;
            },
            set value(tex) {
                currentOcclusionMap = tex;
                occlusionMapNode.value = tex ?? placeholderTexture;
            },
        },
        uOcclusionClipFromWorld: {
            value: clipFromWorldMatrix,
        },
    };
    return {
        uniforms,
        vertexShader: '',
        fragmentShader: '',
    };
}

export { addWebGPUOcclusionToMaterial };
//# sourceMappingURL=WebGPUOcclusionUtils.js.map
