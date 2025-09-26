import * as xb from 'xrblocks';

class ModelManager extends xb.Script {
    constructor(modelsData, enableOcclusion = false) {
        super();
        this.modelsData = modelsData;
        this.enableOcclusion = enableOcclusion;
        this.models = [];
        this.occludableShaders = [];
        this.currentModelIndex = 0;
        this.modelsData = modelsData;
        this.enableOcclusion = enableOcclusion;
    }
    init() {
        const modelsData = this.modelsData;
        for (let i = 0; i < modelsData.length; i++) {
            const data = modelsData[i];
            const model = new xb.ModelViewer({});
            model.loadGLTFModel({
                data,
                renderer: xb.core.renderer,
                addOcclusionToShader: this.enableOcclusion,
            });
            model.visible = false;
            model.castShadow = true;
            model.receiveShadow = true;
            this.models.push(model);
        }
        this.currentModelIndex = 0;
    }
    getCurrentModel() {
        return this.models[this.currentModelIndex];
    }
    positionModelAtIntersection(intersection, camera) {
        const model = this.getCurrentModel();
        model.position.copy(intersection.point);
        xb.extractYaw(camera.quaternion, model.quaternion);
        model.visible = true;
        if (!model.parent) {
            this.add(model);
        }
    }
    getOcclusionEnabled() {
        for (const model of this.models) {
            return model.getOcclusionEnabled();
        }
        return false;
    }
    setOcclusionEnabled(enabled) {
        for (const model of this.models) {
            model.setOcclusionEnabled(enabled);
        }
    }
}

export { ModelManager };
