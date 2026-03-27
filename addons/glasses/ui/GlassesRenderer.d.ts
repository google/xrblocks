import { Component } from '@pmndrs/uikit';
import * as THREE from 'three';
export declare class GlassesRenderer extends THREE.Mesh<THREE.BufferGeometry, THREE.MeshBasicMaterial> {
    private glassesUi;
    renderTarget: THREE.WebGLRenderTarget;
    renderCamera: THREE.OrthographicCamera;
    wrapper: THREE.Scene<THREE.Object3DEventMap>;
    constructor(glassesUi: Component, useScreenBlending?: boolean);
    render(renderer: THREE.WebGLRenderer): void;
}
