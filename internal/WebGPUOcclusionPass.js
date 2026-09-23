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
 * @commitid e2c6ae6
 * @builddate 2026-09-23T23:07:43.536Z
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
import { uniform, dot, vec2, select, vec4, positionWorld, max, float, texture, Fn, or, step, uv, perspectiveDepthToViewZ, viewZToOrthographicDepth, clamp } from 'three/tsl';
import { QuadMesh, NodeMaterial } from 'three/webgpu';
import { u as OCCLUDABLE_ITEMS_LAYER } from './entry.js';
import 'three/addons/postprocessing/Pass.js';
import 'three/addons/webxr/XRControllerModelFactory.js';
import 'three/addons/webxr/XRHandModelFactory.js';
import 'three/addons/webxr/XREstimatedLight.js';
import 'three/addons/loaders/FontLoader.js';
import 'three/addons/geometries/TextGeometry.js';
import 'three/addons/loaders/DRACOLoader.js';
import 'three/addons/loaders/GLTFLoader.js';
import 'three/addons/loaders/KTX2Loader.js';

var KawaseBlurMode;
(function (KawaseBlurMode) {
    KawaseBlurMode[KawaseBlurMode["DOWN"] = 1] = "DOWN";
    KawaseBlurMode[KawaseBlurMode["UP"] = 2] = "UP";
})(KawaseBlurMode || (KawaseBlurMode = {}));
/**
 * WebGPU backend for `OcclusionPass` using Three.js `NodeMaterial`, `QuadMesh`,
 * and TSL shader nodes (`three/webgpu` and `three/tsl`).
 */
class WebGPUOcclusionPass {
    constructor(scene, camera, useFloatDepth = true, renderToScreen = false, occludableItemsLayer = OCCLUDABLE_ITEMS_LAYER) {
        this.scene = scene;
        this.camera = camera;
        this.renderToScreen = renderToScreen;
        this.occludableItemsLayer = occludableItemsLayer;
        this.depthTextures = [];
        this.depthNear = [];
        this.depthViewMatrices = [];
        this.depthProjectionMatrices = [];
        this.uRawValueToMeters = uniform(8.0 / 65536.0);
        this.uFloatDepth = uniform(1.0);
        this.uCameraNear = uniform(0.1);
        this.uCameraFar = uniform(1000.0);
        this.uDepthViewMatrix = uniform(new THREE.Matrix4());
        this.uDepthProjectionMatrix = uniform(new THREE.Matrix4());
        this.lastOcclusionMapSize = new THREE.Vector2(0, 0);
        this.lastKawaseBlurSize = new THREE.Vector2(0, 0);
        this.renderDimensions = new THREE.Vector2();
        this.disposed = false;
        this.placeholderDepthTexture = new THREE.DataTexture(new Float32Array([0]), 1, 1, THREE.RedFormat, THREE.FloatType);
        this.placeholderDepthTexture.needsUpdate = true;
        this.placeholderColorTexture = new THREE.DataTexture(new Uint8Array([0, 0, 0, 0]), 1, 1, THREE.RGBAFormat);
        this.placeholderColorTexture.needsUpdate = true;
        this.uFloatDepth.value = useFloatDepth ? 1.0 : 0.0;
        this.uCameraNear.value = camera.near;
        this.uCameraFar.value = camera.far;
        this.uDepthViewMatrix.value.copy(camera.matrixWorldInverse);
        this.uDepthProjectionMatrix.value.copy(camera.projectionMatrix);
        this.occlusionMeshMaterial = this.createOcclusionMeshMaterial();
        this.occlusionMapQuad = new QuadMesh(this.createOcclusionMapQuadMaterial());
        this.occlusionMapTexture = new THREE.RenderTarget(1, 1);
        this.kawaseBlurTargets = [
            new THREE.RenderTarget(1, 1),
            new THREE.RenderTarget(1, 1),
            new THREE.RenderTarget(1, 1),
        ];
        this.kawaseBlurPasses = [
            this.createKawaseBlurPass(KawaseBlurMode.DOWN, this.occlusionMapTexture.texture),
            this.createKawaseBlurPass(KawaseBlurMode.DOWN, this.kawaseBlurTargets[0].texture),
            this.createKawaseBlurPass(KawaseBlurMode.DOWN, this.kawaseBlurTargets[1].texture),
            this.createKawaseBlurPass(KawaseBlurMode.UP, this.kawaseBlurTargets[2].texture),
            this.createKawaseBlurPass(KawaseBlurMode.UP, this.kawaseBlurTargets[1].texture),
            this.createKawaseBlurPass(KawaseBlurMode.UP, this.kawaseBlurTargets[0].texture),
        ];
        this.occlusionQuad = new QuadMesh(this.createOcclusionCompositeMaterial());
    }
    computeMetersFromSample(sampledDepthNode) {
        const packed = sampledDepthNode.toVec4().rg;
        const floatMeters = packed.r.mul(this.uRawValueToMeters);
        const uint16Meters = dot(packed, vec2(255.0, 256.0 * 255.0)).mul(this.uRawValueToMeters);
        return select(this.uFloatDepth.greaterThan(0.5), floatMeters, uint16Meters);
    }
    createOcclusionMeshMaterial() {
        const depthViewPosition = this.uDepthViewMatrix.mul(vec4(positionWorld, 1.0));
        const virtualDepth = depthViewPosition.z.negate();
        const depthClipPosition = this.uDepthProjectionMatrix.mul(depthViewPosition);
        const depthNdc = depthClipPosition.xy.div(max(float(0.00001), depthClipPosition.w));
        const texCoord = depthNdc.mul(0.5).add(0.5);
        const depthUv = vec2(texCoord.x, float(1.0).sub(texCoord.y));
        this.meshDepthTextureNode = texture(this.placeholderDepthTexture, depthUv);
        const material = new NodeMaterial();
        material.fragmentNode = Fn(() => {
            const realDepth = this.computeMetersFromSample(this.meshDepthTextureNode);
            const outOfBounds = or(depthUv.x.lessThan(0.0), depthUv.x.greaterThan(1.0), depthUv.y.lessThan(0.0), depthUv.y.greaterThan(1.0), virtualDepth.lessThanEqual(0.0));
            const isNotOccluded = select(outOfBounds, float(1.0), step(virtualDepth, realDepth));
            return vec4(isNotOccluded, float(1.0), float(0.0), float(1.0));
        })();
        material.blending = THREE.NoBlending;
        material.lights = false;
        return material;
    }
    createOcclusionMapQuadMaterial() {
        const texCoord = uv();
        const depthUv = vec2(texCoord.x, float(1.0).sub(texCoord.y));
        this.readBufferDiffuseNode = texture(this.placeholderColorTexture, texCoord);
        this.readBufferDepthTextureNode = texture(this.placeholderDepthTexture, depthUv);
        this.readBufferVirtualDepthNode = texture(this.placeholderDepthTexture, texCoord);
        const material = new NodeMaterial();
        material.fragmentNode = Fn(() => {
            const realDepth = float(this.computeMetersFromSample(this.readBufferDepthTextureNode));
            const fragCoordZ = float(this.readBufferVirtualDepthNode.toVec4().r);
            const viewZ = float(perspectiveDepthToViewZ(fragCoordZ, this.uCameraNear, this.uCameraFar));
            const orthoDepth = float(viewZToOrthographicDepth(viewZ, this.uCameraNear, this.uCameraFar));
            const virtualDepth = orthoDepth
                .mul(this.uCameraFar.sub(this.uCameraNear))
                .add(this.uCameraNear);
            return vec4(step(virtualDepth, realDepth), step(float(0.001), this.readBufferDiffuseNode.a), float(0.0), float(0.0));
        })();
        material.blending = THREE.NoBlending;
        material.lights = false;
        return material;
    }
    createKawaseBlurPass(mode, inputTexture) {
        const uBlurSize = uniform(7.0);
        const uTexelSize = uniform(new THREE.Vector2());
        const material = new NodeMaterial();
        material.fragmentNode = Fn(() => {
            const baseUv = uv();
            const halfPixel = uTexelSize.mul(0.5);
            const offset = vec2(uBlurSize, uBlurSize);
            if (mode === KawaseBlurMode.DOWN) {
                const uv1 = baseUv.sub(halfPixel.mul(offset));
                const uv2 = baseUv.add(halfPixel.mul(offset));
                const uv3 = baseUv.sub(vec2(halfPixel.x, halfPixel.y.negate()).mul(offset));
                const uv4 = baseUv.add(vec2(halfPixel.x, halfPixel.y.negate()).mul(offset));
                const sum = texture(inputTexture, baseUv)
                    .mul(4.0)
                    .add(texture(inputTexture, uv1))
                    .add(texture(inputTexture, uv2))
                    .add(texture(inputTexture, uv3))
                    .add(texture(inputTexture, uv4));
                return sum.mul(0.125);
            }
            const uv1 = baseUv.add(vec2(halfPixel.x.mul(-2), float(0.0)).mul(offset));
            const uv2 = baseUv.add(vec2(halfPixel.x.negate(), halfPixel.y).mul(offset));
            const uv3 = baseUv.add(vec2(float(0.0), halfPixel.y.mul(2.0)).mul(offset));
            const uv4 = baseUv.add(halfPixel.mul(offset));
            const uv5 = baseUv.add(vec2(halfPixel.x.mul(2.0), float(0.0)).mul(offset));
            const uv6 = baseUv.add(vec2(halfPixel.x, halfPixel.y.negate()).mul(offset));
            const uv7 = baseUv.add(vec2(float(0.0), halfPixel.y.mul(-2)).mul(offset));
            const uv8 = baseUv.sub(halfPixel.mul(offset));
            const sum = texture(inputTexture, uv1)
                .add(texture(inputTexture, uv2).mul(2.0))
                .add(texture(inputTexture, uv3))
                .add(texture(inputTexture, uv4).mul(2.0))
                .add(texture(inputTexture, uv5))
                .add(texture(inputTexture, uv6).mul(2.0))
                .add(texture(inputTexture, uv7))
                .add(texture(inputTexture, uv8).mul(2.0));
            return sum.mul(0.0833);
        })();
        material.blending = THREE.NoBlending;
        material.lights = false;
        return {
            quad: new QuadMesh(material),
            uTexelSize,
        };
    }
    createOcclusionCompositeMaterial() {
        const texCoord = uv();
        this.finalCompositeDiffuseNode = texture(this.placeholderColorTexture, texCoord);
        const occlusionTexNode = texture(this.occlusionMapTexture.texture, texCoord);
        const material = new NodeMaterial();
        material.fragmentNode = Fn(() => {
            const occlusionValue = clamp(occlusionTexNode.r.div(max(float(0.0001), occlusionTexNode.g)), float(0.0), float(1.0));
            return this.finalCompositeDiffuseNode.mul(occlusionValue);
        })();
        material.blending = THREE.NoBlending;
        material.lights = false;
        return material;
    }
    setDepthTexture(depthTexture, rawValueToMeters, viewId, depthNear, depthViewMatrix, depthProjectionMatrix) {
        this.depthTextures[viewId] = depthTexture;
        this.uRawValueToMeters.value = rawValueToMeters;
        this.depthNear[viewId] = depthNear;
        if (depthViewMatrix) {
            this.depthViewMatrices[viewId] = depthViewMatrix;
        }
        if (depthProjectionMatrix) {
            this.depthProjectionMatrices[viewId] = depthProjectionMatrix;
        }
        if (!(depthTexture instanceof THREE.ExternalTexture)) {
            depthTexture.needsUpdate = true;
        }
    }
    render(renderer, writeBuffer, readBuffer, viewId = 0) {
        const webgpuRenderer = renderer;
        const originalRenderTarget = webgpuRenderer.getRenderTarget();
        const dimensions = this.renderDimensions;
        if (readBuffer == null) {
            this.renderOcclusionMapFromScene(webgpuRenderer, dimensions, viewId);
        }
        else {
            this.renderOcclusionMapFromReadBuffer(webgpuRenderer, readBuffer, dimensions, viewId);
        }
        this.blurOcclusionMap(webgpuRenderer, dimensions);
        this.applyOcclusionMapToRenderedImage(webgpuRenderer, readBuffer, writeBuffer);
        webgpuRenderer.setRenderTarget(originalRenderTarget);
    }
    renderOcclusionMapFromScene(renderer, dimensions, viewId) {
        const texture = this.depthTextures[viewId] ?? this.placeholderDepthTexture;
        this.meshDepthTextureNode.value = texture;
        const camera = renderer.xr.getCamera()?.cameras?.[viewId] || this.camera;
        this.uDepthViewMatrix.value.copy(this.depthViewMatrices[viewId] || camera.matrixWorldInverse);
        this.uDepthProjectionMatrix.value.copy(this.depthProjectionMatrices[viewId] || camera.projectionMatrix);
        this.scene.overrideMaterial = this.occlusionMeshMaterial;
        renderer.getDrawingBufferSize(dimensions);
        this.resizeOcclusionMap(dimensions);
        renderer.setRenderTarget(this.occlusionMapTexture);
        renderer.clear();
        const originalCameraLayerMask = camera.layers.mask;
        camera.layers.set(this.occludableItemsLayer);
        renderer.render(this.scene, camera);
        camera.layers.mask = originalCameraLayerMask;
        this.scene.overrideMaterial = null;
    }
    renderOcclusionMapFromReadBuffer(renderer, readBuffer, dimensions, viewId) {
        this.readBufferDiffuseNode.value = readBuffer.texture;
        this.readBufferVirtualDepthNode.value =
            readBuffer.depthTexture ?? this.placeholderDepthTexture;
        this.readBufferDepthTextureNode.value =
            this.depthTextures[viewId] ?? this.placeholderDepthTexture;
        renderer.getDrawingBufferSize(dimensions);
        this.resizeOcclusionMap(dimensions);
        renderer.setRenderTarget(this.occlusionMapTexture);
        this.occlusionMapQuad.render(renderer);
    }
    blurOcclusionMap(renderer, dimensions) {
        this.resizeKawaseBlur(dimensions);
        for (let i = 0; i < 3; i++) {
            this.kawaseBlurPasses[i].uTexelSize.value.set(1 / (dimensions.x / 2 ** i), 1 / (dimensions.y / 2 ** i));
            this.kawaseBlurPasses[this.kawaseBlurPasses.length - 1 - i].uTexelSize.value.set(1 / (dimensions.x / 2 ** (i - 1)), 1 / (dimensions.y / 2 ** (i - 1)));
        }
        renderer.setRenderTarget(this.kawaseBlurTargets[0]);
        this.kawaseBlurPasses[0].quad.render(renderer);
        renderer.setRenderTarget(this.kawaseBlurTargets[1]);
        this.kawaseBlurPasses[1].quad.render(renderer);
        renderer.setRenderTarget(this.kawaseBlurTargets[2]);
        this.kawaseBlurPasses[2].quad.render(renderer);
        renderer.setRenderTarget(this.kawaseBlurTargets[1]);
        this.kawaseBlurPasses[3].quad.render(renderer);
        renderer.setRenderTarget(this.kawaseBlurTargets[0]);
        this.kawaseBlurPasses[4].quad.render(renderer);
        renderer.setRenderTarget(this.occlusionMapTexture);
        this.kawaseBlurPasses[5].quad.render(renderer);
    }
    resizeOcclusionMap(dimensions) {
        if (this.lastOcclusionMapSize.x === dimensions.x &&
            this.lastOcclusionMapSize.y === dimensions.y) {
            return;
        }
        this.lastOcclusionMapSize.copy(dimensions);
        this.occlusionMapTexture.setSize(dimensions.x, dimensions.y);
    }
    resizeKawaseBlur(dimensions) {
        if (this.lastKawaseBlurSize.x === dimensions.x &&
            this.lastKawaseBlurSize.y === dimensions.y) {
            return;
        }
        this.lastKawaseBlurSize.copy(dimensions);
        for (let i = 0; i < 3; i++) {
            this.kawaseBlurTargets[i].setSize(dimensions.x / 2 ** i, dimensions.y / 2 ** i);
        }
    }
    applyOcclusionMapToRenderedImage(renderer, readBuffer, writeBuffer) {
        if (readBuffer && (this.renderToScreen || writeBuffer)) {
            this.finalCompositeDiffuseNode.value = readBuffer.texture;
            renderer.setRenderTarget(writeBuffer && !this.renderToScreen ? writeBuffer : null);
            this.occlusionQuad.render(renderer);
        }
    }
    updateOcclusionMapUniforms(uniforms, renderer) {
        const camera = renderer.xr.getCamera()
            ?.cameras?.[0] || this.camera;
        uniforms.tOcclusionMap.value = this.occlusionMapTexture.texture;
        uniforms.uOcclusionClipFromWorld.value
            .copy(camera.projectionMatrix)
            .multiply(camera.matrixWorldInverse);
    }
    dispose() {
        if (this.disposed)
            return;
        this.disposed = true;
        const quads = [
            this.occlusionMapQuad,
            ...this.kawaseBlurPasses.map((pass) => pass.quad),
            this.occlusionQuad,
        ];
        const resources = [
            this.placeholderDepthTexture,
            this.placeholderColorTexture,
            this.occlusionMeshMaterial,
            this.occlusionMapTexture,
            ...this.kawaseBlurTargets,
            ...quads.flatMap((quad) => [
                quad.material,
                quad.geometry,
            ]),
        ];
        let firstError;
        for (const resource of resources) {
            try {
                resource.dispose();
            }
            catch (error) {
                firstError ??= error;
            }
        }
        this.kawaseBlurTargets.length = 0;
        this.kawaseBlurPasses.length = 0;
        this.depthTextures.length = 0;
        this.depthNear.length = 0;
        this.depthViewMatrices.length = 0;
        this.depthProjectionMatrices.length = 0;
        if (firstError !== undefined)
            throw firstError;
    }
}

export { WebGPUOcclusionPass };
//# sourceMappingURL=WebGPUOcclusionPass.js.map
