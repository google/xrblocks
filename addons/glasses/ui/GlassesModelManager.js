import * as THREE from 'three';
import * as xb from 'xrblocks';

const GLASSES_MODEL_FILE = 'https://cdn.jsdelivr.net/gh/xrblocks/proprietary-assets@main/glasses/glasses_without_lens.glb';
function disposeMaterial(material) {
    for (const key in material) {
        const value = material[key];
        if (value instanceof THREE.Texture) {
            value.dispose();
        }
    }
    material.dispose();
}
class GlassesModelManager extends xb.Script {
    constructor() {
        super(...arguments);
        this._modelUrl = GLASSES_MODEL_FILE;
        // Default/Simulator Transform Properties
        this.defaultPosition = new THREE.Vector3(-0.03, 0.001, -5e-3);
        this.defaultRotation = new THREE.Euler(0, Math.PI, 0);
        this.defaultScale = new THREE.Vector3(0.05, 0.05, 0.05);
        // WebXR Headset Transform Properties
        this.xrPosition = new THREE.Vector3(0.0, 0.0, -0.05);
        this.xrRotation = new THREE.Euler(0, Math.PI, 0);
        this.xrScale = new THREE.Vector3(0.05, 0.05, 0.05);
        this.runningInXrHeadset = false;
    }
    get modelUrl() {
        return this._modelUrl;
    }
    set modelUrl(url) {
        if (this._modelUrl !== url) {
            this._modelUrl = url;
            if (this.glassesModel) {
                this.removeAndDisposeModel(this.glassesModel);
                this.glassesModel = undefined;
                this.loadGlassesModel();
            }
        }
    }
    updateTransform() {
        this.positionGlassesModel();
    }
    async init() {
        await this.loadGlassesModel();
    }
    async loadGlassesModel() {
        const model = await new xb.ModelLoader().loadGLTF({
            url: this._modelUrl,
            renderer: xb.core.renderer,
        });
        this.glassesModel = model;
        this.positionGlassesModel();
        xb.core.camera.add(model.scene);
        xb.add(xb.core.camera);
    }
    positionGlassesModel() {
        const glassesModel = this.glassesModel;
        if (!glassesModel)
            return;
        if (this.runningInXrHeadset) {
            glassesModel.scene.position.copy(this.xrPosition);
            glassesModel.scene.rotation.copy(this.xrRotation);
            glassesModel.scene.scale.copy(this.xrScale);
        }
        else {
            glassesModel.scene.position.copy(this.defaultPosition);
            glassesModel.scene.rotation.copy(this.defaultRotation);
            glassesModel.scene.scale.copy(this.defaultScale);
        }
    }
    setXrHeadset(enabled) {
        if (this.runningInXrHeadset != enabled) {
            this.runningInXrHeadset = enabled;
            this.positionGlassesModel();
        }
    }
    update() {
        const xrCameras = xb.core.renderer.xr.getCamera()
            .cameras;
        this.setXrHeadset(xrCameras.length === 2);
    }
    dispose() {
        if (this.glassesModel) {
            this.removeAndDisposeModel(this.glassesModel);
        }
    }
    removeAndDisposeModel(model) {
        model.scene.removeFromParent();
        model.scene.traverse((child) => {
            if (child instanceof THREE.Mesh) {
                if (child.geometry) {
                    child.geometry.dispose();
                }
                if (child.material) {
                    if (Array.isArray(child.material)) {
                        child.material.forEach((mat) => disposeMaterial(mat));
                    }
                    else {
                        disposeMaterial(child.material);
                    }
                }
            }
        });
    }
    get model() {
        return this.glassesModel;
    }
}

export { GlassesModelManager };
