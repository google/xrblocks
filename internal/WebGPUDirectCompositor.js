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
 * @commitid f9b2aca
 * @builddate 2026-09-25T23:39:04.639Z
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
import { texture, uv } from 'three/tsl';
import { NodeMaterial, QuadMesh } from 'three/webgpu';
import { W as WebGLDirectCompositor } from './Simulator.js';
import 'three';
import './entry.js';
import 'three/addons/postprocessing/Pass.js';
import 'three/addons/webxr/XRControllerModelFactory.js';
import 'three/addons/webxr/XRHandModelFactory.js';
import 'three/addons/webxr/XREstimatedLight.js';
import 'three/addons/loaders/FontLoader.js';
import 'three/addons/geometries/TextGeometry.js';
import 'three/addons/loaders/DRACOLoader.js';
import 'three/addons/loaders/GLTFLoader.js';
import 'three/addons/loaders/KTX2Loader.js';
import 'three/addons/utils/BufferGeometryUtils.js';

/**
 * Creates a fullscreen QuadMesh with a NodeMaterial configured to sample a
 * video texture right-side-up in both WebGPU and WebGL2 fallback modes.
 */
function createWebGPUBackgroundVideoQuad(videoTexture) {
    const material = new NodeMaterial();
    material.fragmentNode = texture(videoTexture, uv().flipY());
    material.depthTest = false;
    material.depthWrite = false;
    material.lights = false;
    return new QuadMesh(material);
}
/**
 * Compositor that renders the simulator scene directly to the canvas
 * followed by the main scene without an intermediate offscreen render target,
 * configured specifically for WebGPURenderer.
 */
class WebGPUDirectCompositor extends WebGLDirectCompositor {
    createBackgroundVideoQuad(videoTexture) {
        return createWebGPUBackgroundVideoQuad(videoTexture);
    }
    clearBeforeSimulatorScene() {
        if (this.backgroundVideoQuad) {
            this.deps.renderer.clearDepth();
        }
        else {
            this.deps.renderer.clear();
        }
    }
}

export { WebGPUDirectCompositor, createWebGPUBackgroundVideoQuad };
//# sourceMappingURL=WebGPUDirectCompositor.js.map
