import * as THREE from 'three';

class GlassesRenderer extends THREE.Mesh {
    constructor(glassesUi, useScreenBlending = true) {
        const renderTarget = new THREE.WebGLRenderTarget(1024, 1024);
        renderTarget.texture.colorSpace = THREE.LinearSRGBColorSpace;
        const geometry = new THREE.PlaneGeometry(1, 1);
        const material = new THREE.MeshBasicMaterial({
            map: renderTarget.texture,
            transparent: true,
        });
        if (useScreenBlending) {
            material.blending = THREE.CustomBlending;
            material.blendSrc = THREE.OneFactor;
            material.blendDst = THREE.OneMinusSrcColorFactor;
            material.blendEquation = THREE.AddEquation;
        }
        super(geometry, material);
        this.glassesUi = glassesUi;
        this.renderCamera = new THREE.OrthographicCamera(-0.5, 0.5, 0.5, -0.5);
        this.wrapper = new THREE.Scene();
        this.material = material;
        this.wrapper.add(glassesUi);
        this.renderTarget = renderTarget;
        this.material.map = this.renderTarget.texture;
        this.renderCamera.position.set(0, 0, 1);
        this.renderCamera.lookAt(0, 0, -1);
    }
    render(renderer) {
        const presentingToXr = renderer.xr.isPresenting;
        const originalRenderTarget = renderer.getRenderTarget();
        renderer.xr.isPresenting = false;
        renderer.setRenderTarget(this.renderTarget);
        renderer.clearColor();
        renderer.render(this.glassesUi, this.renderCamera);
        renderer.setRenderTarget(originalRenderTarget);
        renderer.xr.isPresenting = presentingToXr;
    }
}

export { GlassesRenderer };
