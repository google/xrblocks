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
import { MeshBasicNodeMaterial, QuadMesh } from 'three/webgpu';
import { B as BaseSimulatorCompositor } from './Simulator.js';
import { createWebGPUBackgroundVideoQuad } from './WebGPUDirectCompositor.js';
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
import 'three/tsl';

/**
 * Compositor that renders the main scene to an offscreen THREE.RenderTarget
 * and composites it onto the simulator scene via a fullscreen QuadMesh using
 * MeshBasicNodeMaterial. Compatible with both native WebGPU and WebGL2 fallback backends.
 */
class WebGPURenderTargetCompositor extends BaseSimulatorCompositor {
    constructor(deps) {
        super(deps);
        this.stencilBuffer = deps.stencil;
        this.virtualSceneRenderTarget = new THREE.RenderTarget(deps.renderer.domElement.width, deps.renderer.domElement.height, { stencilBuffer: this.stencilBuffer });
        const virtualSceneMaterial = new MeshBasicNodeMaterial({
            map: this.virtualSceneRenderTarget.texture,
            transparent: true,
        });
        virtualSceneMaterial.lights = false;
        if (deps.blendingMode === 'screen') {
            virtualSceneMaterial.blending = THREE.CustomBlending;
            virtualSceneMaterial.blendSrc = THREE.OneFactor;
            virtualSceneMaterial.blendDst = THREE.OneMinusSrcColorFactor;
            virtualSceneMaterial.blendEquation = THREE.AddEquation;
        }
        this.virtualSceneFullScreenQuad = new QuadMesh(virtualSceneMaterial);
    }
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
    renderFrame(renderCamera, mainCamera) {
        if (this.virtualSceneRenderTarget.width !==
            this.deps.renderer.domElement.width ||
            this.virtualSceneRenderTarget.height !==
                this.deps.renderer.domElement.height) {
            this.virtualSceneRenderTarget.dispose();
            this.virtualSceneRenderTarget = new THREE.RenderTarget(this.deps.renderer.domElement.width, this.deps.renderer.domElement.height, { stencilBuffer: this.stencilBuffer });
            this.virtualSceneFullScreenQuad.material.map =
                this.virtualSceneRenderTarget.texture;
        }
        const renderer = this.deps.renderer;
        this.setSparkEncodeLinear(true);
        renderer.setRenderTarget(this.virtualSceneRenderTarget);
        renderer.clear();
        this.deps.renderMainScene(renderCamera);
        this.renderSimulatorScenePass(renderCamera, mainCamera);
        this.virtualSceneFullScreenQuad.render(renderer);
    }
    dispose() {
        this.virtualSceneFullScreenQuad.material.dispose();
        this.virtualSceneRenderTarget.dispose();
        super.dispose();
    }
}

export { WebGPURenderTargetCompositor };
//# sourceMappingURL=WebGPURenderTargetCompositor.js.map
