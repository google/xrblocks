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
 * @commitid 317761c
 * @builddate 2026-09-18T15:30:14.569Z
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
import { uniform, Fn, distance, uv, vec2, Discard, max, length, dFdx, dFdy, float, sub, clamp, vec4, mix, smoothstep, step } from 'three/tsl';
import { NodeMaterial } from 'three/webgpu';

/**
 * Applies a WebGPU NodeMaterial to a reticle and synchronizes uniform changes.
 *
 * @param reticle - The reticle to configure with a WebGPU material.
 */
function applyWebGPUReticleMaterial(reticle) {
    const uColor = uniform(new THREE.Color().copy(reticle.uniforms.uColor.value));
    const uPressed = uniform(reticle.uniforms.uPressed.value);
    const fragmentNode = Fn(() => {
        const dist = distance(uv(), vec2(0.5, 0.5));
        Discard(dist.greaterThan(0.45));
        const antialiasDist = max(length(vec2(dFdx(dist), dFdy(dist))), float(0.001));
        const outerRadius = sub(float(0.5), antialiasDist);
        const clampedOuterDelta = clamp(sub(dist, outerRadius), float(0.0), antialiasDist);
        const outerAlpha = sub(float(1.0), clampedOuterDelta.div(antialiasDist));
        const innerBaseColor = vec4(uColor.mul(0.5), 0.5);
        const pressedInnerColor = vec4(uColor, 1.0);
        const innerGradientColor = vec4(0.054, 0.054, 0.054, 1.0);
        const outerRingColor = vec4(0.077, 0.077, 0.077, 1.0);
        const gradientEnd = float(0.46);
        const gradientStart = float(0.33);
        const pressedInnerRadius = float(0.41);
        const unpressedInnerColor = mix(innerBaseColor, innerGradientColor, smoothstep(gradientStart, gradientEnd, dist));
        const unpressedColor = mix(unpressedInnerColor, outerRingColor, step(gradientEnd, dist));
        const smoothDistance = antialiasDist.mul(4.0);
        const percentToInnerRad = max(sub(pressedInnerRadius, dist), float(0.0)).div(pressedInnerRadius);
        const pressedColorT = clamp(sub(sub(float(1.0), percentToInnerRad), sub(float(1.0), smoothDistance)).div(smoothDistance), float(0.0), float(1.0));
        const pressedColor = mix(pressedInnerColor, outerRingColor, pressedColorT);
        const finalColor = mix(unpressedColor, pressedColor, uPressed);
        const premultiplied = finalColor.mul(outerAlpha);
        const alpha = premultiplied.w;
        return vec4(premultiplied.xyz.div(max(alpha, float(0.001))), alpha);
    })();
    const material = new NodeMaterial();
    material.fragmentNode = fragmentNode;
    material.transparent = true;
    material.depthTest = reticle.depthTestEnabled;
    material.depthWrite = false;
    reticle.setCustomMaterial(material, () => {
        uColor.value.copy(reticle.uniforms.uColor.value);
        uPressed.value = reticle.uniforms.uPressed.value;
    });
}

export { applyWebGPUReticleMaterial };
//# sourceMappingURL=ReticleWebGPUMaterial.js.map
