import {Component, reversePainterSortStable} from '@pmndrs/uikit';
import * as THREE from 'three';

export class GlassesRenderer extends THREE.Mesh<
  THREE.BufferGeometry,
  THREE.MeshBasicMaterial
> {
  renderTarget: THREE.WebGLRenderTarget;
  renderCamera = new THREE.OrthographicCamera(-0.5, 0.5, 0.5, -0.5);
  wrapper = new THREE.Scene();
  constructor(
    private glassesUi: Component,
    useScreenBlending = true
  ) {
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
    this.material = material;
    this.wrapper.add(glassesUi);

    this.renderTarget = renderTarget;
    this.material.map = this.renderTarget.texture;
    this.renderCamera.position.set(0, 0, 1);
    this.renderCamera.lookAt(0, 0, -1);
  }

  render(renderer: THREE.WebGLRenderer) {
    const presentingToXr = renderer.xr.isPresenting;
    const originalRenderTarget = renderer.getRenderTarget();
    renderer.localClippingEnabled = true;
    renderer.setTransparentSort(reversePainterSortStable);
    renderer.xr.isPresenting = false;
    renderer.setRenderTarget(this.renderTarget);
    renderer.clearColor();
    renderer.render(this.glassesUi, this.renderCamera);
    renderer.setRenderTarget(originalRenderTarget);
    renderer.xr.isPresenting = presentingToXr;
  }
}
