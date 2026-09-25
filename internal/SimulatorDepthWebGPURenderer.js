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
 * @commitid af6fdd5
 * @builddate 2026-09-25T15:43:06.242Z
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
import { vec4, positionView, float } from 'three/tsl';
import { NodeMaterial } from 'three/webgpu';

/**
 * Creates a WebGPU NodeMaterial for rendering linear view-space depth
 * (-positionView.z) into a float render target in the Simulator.
 *
 * @returns The configured NodeMaterial instance.
 */
function createSimulatorDepthNodeMaterial() {
    const material = new NodeMaterial();
    material.blending = THREE.NoBlending;
    material.forceSinglePass = true;
    material.fragmentNode = vec4(positionView.z.negate(), float(0.0), float(0.0), float(1.0));
    return material;
}
/**
 * WebGPU backend implementation for rendering and reading back Simulator depth buffers.
 */
class SimulatorDepthWebGPURenderer {
    constructor(renderer) {
        this.renderer = renderer;
        this.depthMaterial = createSimulatorDepthNodeMaterial();
    }
    readRenderTargetPixels(renderTarget, width, height) {
        return this.renderer.readRenderTargetPixelsAsync(renderTarget, 0, 0, width, height);
    }
    unpackDepthPixels(readbackResult, width, height, outputBuffer) {
        const readbackBuffer = readbackResult;
        const isWebGLFallback = 'isWebGLBackend' in this.renderer.backend &&
            this.renderer.backend.isWebGLBackend === true;
        const expectedLength = width * height;
        const rowStride = readbackBuffer.length > expectedLength
            ? (Math.ceil((width * 4) / 256) * 256) / 4
            : width;
        for (let y = 0; y < height; ++y) {
            const srcRow = isWebGLFallback ? height - 1 - y : y;
            const srcOffset = srcRow * rowStride;
            const dstOffset = y * width;
            outputBuffer.set(readbackBuffer.subarray(srcOffset, srcOffset + width), dstOffset);
        }
    }
    dispose() {
        this.depthMaterial.dispose();
    }
}

export { SimulatorDepthWebGPURenderer, createSimulatorDepthNodeMaterial };
//# sourceMappingURL=SimulatorDepthWebGPURenderer.js.map
