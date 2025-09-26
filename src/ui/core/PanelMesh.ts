import * as THREE from 'three';

import type {Shader} from '../../utils/Types';
import {getVec4ByColorString} from '../../utils/utils';


/**
 * A specialized `THREE.Mesh` designed for rendering UI panel
 * backgrounds. It utilizes a custom shader to draw rounded rectangles
 * (squircles) and provides methods to dynamically update its appearance,
 * such as aspect ratio and size. This class is a core building block for
 * `Panel` components.
 */
export class PanelMesh extends
    THREE.Mesh<THREE.PlaneGeometry, THREE.ShaderMaterial> {
  /** Text description of the PanelMesh */
  name = 'PanelMesh';

  /**
   * Provides convenient access to the material's shader uniforms.
   * @returns The uniforms object of the shader material.
   */
  get uniforms() {
    return this.material.uniforms;
  }

  /**
   * Creates an instance of PanelMesh.
   * @param shader - Shader for the panel mesh.
   * @param backgroundColor - The background color as a CSS string.
   * @param panelScale - The initial scale of the plane
   */
  constructor(shader: Shader, backgroundColor?: string, panelScale = 1.0) {
    // Each mesh needs its own unique set of uniforms.
    const uniforms = THREE.UniformsUtils.clone(shader.uniforms);

    const material = new THREE.ShaderMaterial({
      uniforms: uniforms,
      vertexShader: shader.vertexShader,
      fragmentShader: shader.fragmentShader,
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
    });

    const geometry = new THREE.PlaneGeometry(panelScale, panelScale);

    super(geometry, material);

    if (backgroundColor) {
      uniforms.uBackgroundColor.value = getVec4ByColorString(backgroundColor);
    }
  }

  /**
   * Sets the panel's absolute dimensions (width and height) in the shader.
   * This is used by the shader to correctly calculate properties like rounded
   * corner radii.
   * @param width - The width of the panel.
   * @param height - The height of the panel.
   */
  setWidthHeight(width: number, height: number) {
    this.uniforms.uBoxSize.value.set(width, height);
  }

  /**
   * Adjusts the mesh's scale to match a given aspect ratio, preventing the
   * panel from appearing stretched.
   * @param aspectRatio - The desired width-to-height ratio.
   */
  setAspectRatio(aspectRatio: number) {
    this.scale.set(
        Math.max(aspectRatio, 1.0), Math.max(1.0 / aspectRatio, 1.0), 1.0);
  }
}
