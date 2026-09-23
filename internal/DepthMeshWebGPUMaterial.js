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
 * @commitid 58daa2f
 * @builddate 2026-09-23T20:48:02.643Z
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
import { uniform, vec2, uv, float, texture, Fn, normalize, normalLocal, max, dot, positionView, reflect, pow, vec3, vec4, clamp, mix, step } from 'three/tsl';
import { NodeMaterial } from 'three/webgpu';

function turboColormap(x_immutable) {
    const x = float(x_immutable);
    const kRedVec4 = vec4(0.55305649, 3.00913185, -5.46192616, -11.11819092);
    const kGreenVec4 = vec4(0.16207513, 0.17712472, 15.240915, -36.5065796);
    const kBlueVec4 = vec4(-0.05195877, 5.18000081, -30.94853351, 81.96403246);
    const kRedVec2 = vec2(27.81927491, -14.87899417);
    const kGreenVec2 = vec2(25.95549545, -5.02738237);
    const kBlueVec2 = vec2(-86.5347657, 30.23299484);
    const v4 = vec4(1.0, x, x.mul(x), x.mul(x).mul(x));
    const v2 = vec2(v4.z.mul(v4.z), v4.w.mul(v4.z));
    return vec3(dot(v4, kRedVec4).add(dot(v2, kRedVec2)), dot(v4, kGreenVec4).add(dot(v2, kGreenVec2)), dot(v4, kBlueVec4).add(dot(v2, kBlueVec2)));
}
/**
 * Applies a WebGPU TSL NodeMaterial to a DepthMesh for debug/texture visualization.
 *
 * @param depthMesh - The DepthMesh instance to configure.
 */
function applyWebGPUDepthMeshMaterial(depthMesh) {
    const srcUniforms = depthMesh.depthTextureUniforms;
    if (!srcUniforms)
        return;
    const uColor = uniform(new THREE.Color().copy(srcUniforms.uColor.value));
    const uLightDirection = uniform(new THREE.Vector3().copy(srcUniforms.uLightDirection.value));
    const uOpacity = uniform(srcUniforms.uOpacity.value);
    const uDebug = uniform(srcUniforms.uDebug.value);
    const uMinDepth = uniform(srcUniforms.uMinDepth.value);
    const uMaxDepth = uniform(srcUniforms.uMaxDepth.value);
    const uRawValueToMeters = uniform(srcUniforms.uRawValueToMeters.value);
    const placeholderTexture = new THREE.DataTexture(new Float32Array([0]), 1, 1, THREE.RedFormat, THREE.FloatType);
    placeholderTexture.needsUpdate = true;
    const viewUv = vec2(uv().x, float(1.0).sub(uv().y));
    const depthTextureNode = texture(srcUniforms.uDepthTexture.value ?? placeholderTexture, viewUv);
    const fragmentNode = Fn(() => {
        const lightDir = normalize(uLightDirection);
        const n = normalize(normalLocal);
        const ambient = uColor.mul(0.1);
        const diff = max(dot(n, lightDir), float(0.0)).mul(uColor);
        const viewDir = normalize(positionView.negate());
        const reflectDir = reflect(lightDir.negate(), n);
        const spec = pow(max(dot(viewDir, reflectDir), float(0.0)), float(16.0)).mul(0.5);
        const finalColor = ambient.add(diff).add(vec3(spec));
        const debugOutput = vec4(finalColor, float(1.0)).mul(uOpacity);
        const sampledDepth = depthTextureNode
            .toVec4()
            .r.mul(uRawValueToMeters)
            .mul(8.0);
        const normalizedDepth = clamp(sampledDepth
            .sub(uMinDepth)
            .div(max(uMaxDepth.sub(uMinDepth), float(0.0001))), float(0.0), float(1.0));
        const depthOutput = vec4(turboColormap(normalizedDepth), float(1.0)).mul(uOpacity);
        return mix(depthOutput, debugOutput, step(float(0.5), uDebug));
    })();
    const material = new NodeMaterial();
    material.fragmentNode = fragmentNode;
    material.side = THREE.DoubleSide;
    material.transparent = true;
    material.forceSinglePass = true;
    depthMesh.setCustomMaterial(material, () => {
        uColor.value.copy(srcUniforms.uColor.value);
        uLightDirection.value.copy(srcUniforms.uLightDirection.value);
        uOpacity.value = srcUniforms.uOpacity.value;
        uDebug.value = srcUniforms.uDebug.value;
        uMinDepth.value = srcUniforms.uMinDepth.value;
        uMaxDepth.value = srcUniforms.uMaxDepth.value;
        uRawValueToMeters.value = srcUniforms.uRawValueToMeters.value;
        if (srcUniforms.uDepthTexture.value) {
            depthTextureNode.value = srcUniforms.uDepthTexture.value;
        }
    });
}

export { applyWebGPUDepthMeshMaterial };
//# sourceMappingURL=DepthMeshWebGPUMaterial.js.map
