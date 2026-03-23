import * as uikit from '@pmndrs/uikit';
import { abortableEffect } from '@pmndrs/uikit';
import * as THREE from 'three';
import * as xb from 'xrblocks';
import { UICard } from '../UICard.js';
import '../../constants/ManipulationPanelConstants.js';
import '../../constants/UICardConstants.js';
import '../../mixins/XRUI.js';
import '../../primitives/ManipulationPanel.js';
import '@preact/signals-core';
import '../../primitives/ShaderPanel.js';
import '../../primitives/layers/ManipulationLayer.js';
import '../../shaders/ManipulationPanel.frag.js';
import '../../shaders/CommonFunctions.glsl.js';
import '../../utils/ManipulationPanelUtils.js';
import '../../utils/ColorUtils.js';
import '../../utils/ShaderUtils.js';
import '../../primitives/layers/PanelLayer.js';
import '../../shaders/Panel.vert.js';

const ADDITIVE_LAYER = 5;
/**
 * AdditiveUICard
 * An experimental wrapper facilitating correct Transparency Overlays (Screen/Additive blending).
 * Ideal for optical see-through AR form factors.
 * It renders all nested child contents inside a secondary offscreen RenderTarget layer, and projects the resulting texture inside its own Quad utilizing CustomBlending.
 */
class AdditiveUICard extends UICard {
    /**
     * Constructs a new AdditiveUICard.
     * Spawns an offscreen standard camera mapping `ADDITIVE_LAYER` and renders dynamic composition graphs recursively inside an interval buffer.
     */
    constructor(config) {
        super(config);
        this.blendMode = config.blendMode || 'screen';
        xb.core.input.raycaster.layers.enable(ADDITIVE_LAYER);
        this.renderTarget = new THREE.WebGLRenderTarget(512, 512);
        this.renderTarget.texture.colorSpace = THREE.LinearSRGBColorSpace;
        this.renderCamera = new THREE.OrthographicCamera(-0.5, 0.5, 0.5, -0.5);
        this.renderCamera.position.set(0, 0, 1);
        this.renderCamera.lookAt(0, 0, -1);
        this.renderCamera.updateMatrixWorld();
        this.renderCamera.layers.disableAll();
        this.renderCamera.layers.enable(ADDITIVE_LAYER);
        const material = new THREE.MeshBasicMaterial({
            map: this.renderTarget.texture,
            transparent: true,
        });
        if (this.blendMode === 'screen') {
            material.blending = THREE.CustomBlending;
            material.blendSrc = THREE.OneFactor;
            material.blendDst = THREE.OneMinusSrcColorFactor;
            material.blendEquation = THREE.AddEquation;
        }
        else if (this.blendMode === 'additive') {
            material.blending = THREE.AdditiveBlending;
        }
        this.targetContainer = new uikit.Custom({
            width: '100%',
            height: '100%',
            positionType: 'absolute',
            positionLeft: 0,
            positionTop: 0,
        }, undefined, {
            material: material,
        });
        this.targetContainer.raycast = () => { };
        this.add(this.targetContainer);
        this.targetContainer.onBeforeRender = (renderer) => {
            this.renderInternal(renderer);
        };
        abortableEffect(() => {
            const onFrame = () => {
                // pmndrs/uikit consolidates geometries into an `InstancedPanelMesh` at the Root context.
                // Since AdditiveUICard acts as its own Root context, all nested children are rendered here.
                // We force the Root's active geometries onto ADDITIVE_LAYER so the internal camera can see them.
                this.root.value.component.traverse((obj) => {
                    if (obj instanceof THREE.Mesh) {
                        obj.layers.disableAll();
                        obj.layers.enable(ADDITIVE_LAYER);
                    }
                });
                // Restore targetContainer (and its own descendants like the custom Quad) strictly to main layer 0.
                // This prevents an infinite mirror loop where the texture draws itself.
                this.targetContainer.traverse((obj) => {
                    obj.layers.disableAll();
                    obj.layers.enable(0);
                });
            };
            this.root.value.onFrameSet.add(onFrame);
            return () => {
                this.root.value.onFrameSet.delete(onFrame);
            };
        }, this.abortSignal);
    }
    /** Releases internal RenderTarget, materials, and attached textures safely. */
    dispose() {
        super.dispose();
        this.renderTarget?.dispose();
        this.targetContainer?.geometry?.dispose();
        if (this.targetContainer?.material instanceof THREE.Material) {
            this.targetContainer.material.dispose();
        }
    }
    /**
     * Rescales RenderTarget dynamically against viewport sizes to maintain edge sharpness.
     */
    updateTextureResolution() {
        const size = this.size.value;
        if (!size)
            return;
        // Adjust target resolution to keep it crisp based directly on pixel units (e.g. 500px).
        const dpr = window.devicePixelRatio || 1;
        const targetW = Math.max(1, Math.floor(size[0] * dpr));
        const targetH = Math.max(1, Math.floor(size[1] * dpr));
        if (this.renderTarget.width !== targetW ||
            this.renderTarget.height !== targetH) {
            this.renderTarget.setSize(targetW, targetH);
        }
    }
    /**
     * Internal render loop callback overriding Standard container traversals.
     * Binds context onto an offscreen RenderTarget directly to compound translucency passes accurately without infinite loops.
     */
    renderInternal(renderer) {
        if (!this.renderTarget || !this.targetContainer)
            return;
        this.updateTextureResolution();
        const presentingToXr = renderer.xr.isPresenting;
        const originalRenderTarget = renderer.getRenderTarget();
        renderer.xr.isPresenting = false;
        renderer.setRenderTarget(this.renderTarget);
        const oldClearColor = new THREE.Color();
        renderer.getClearColor(oldClearColor);
        const oldClearAlpha = renderer.getClearAlpha();
        renderer.setClearColor(0x000000, 0);
        renderer.clear();
        // Render the entire UI hierarchy exclusively using the additive camera!
        // The camera only has ADDITIVE_LAYER enabled, so it ignores our targetContainer (Layer 0).
        // Because AdditiveUICard is structurally a Root context in pmndrs/uikit, rendering `this`
        // captures the consolidated internal InstancedPanelMesh displaying all children.
        // Align the orthographic camera's world bounds and scale identically to the AdditiveUICard's layout bounding space.
        this.updateWorldMatrix(true, true);
        this.renderCamera.matrixWorld.copy(this.matrixWorld);
        this.renderCamera.matrixWorld.decompose(this.renderCamera.position, this.renderCamera.quaternion, this.renderCamera.scale);
        this.renderCamera.near = -1;
        this.renderCamera.updateProjectionMatrix();
        renderer.render(this, this.renderCamera);
        renderer.setClearColor(oldClearColor, oldClearAlpha);
        renderer.setRenderTarget(originalRenderTarget);
        renderer.xr.isPresenting = presentingToXr;
    }
}

export { AdditiveUICard };
