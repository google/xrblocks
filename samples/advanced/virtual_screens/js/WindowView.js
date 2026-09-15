import * as THREE from 'three';
import * as xb from 'xrblocks';

/**
 * A movable video surface with optional curvature and texture sharpening.
 */
export class WindowView extends THREE.Mesh {
  /**
   * @param {object} options - Configuration options.
   * @param {number} options.width The screen width in meters.
   * @param {number} options.height The screen height in meters.
   * @param {boolean} [options.isCurved=false] If true, displays the video on
   * a curved surface.
   * @param {number} [options.curvature=0.5] The amount of curvature, from 0
   * (flat) to 1 (a full semicircle).
   * @param {number} [options.sharpness=0.1] Controls the texture sharpness.
   * Lower values (e.g., 0.1) produce a sharper image by tricking the
   * renderer into using higher-resolution mipmaps. 1.0 is normal.
   */
  constructor(options = {}) {
    const {
      width,
      height,
      isCurved = false,
      curvature = 0.5,
      sharpness = 0.3,
    } = options;
    const geometry = createScreenGeometry(width, height, isCurved, curvature);

    const customMaterial = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      side: isCurved ? THREE.BackSide : THREE.FrontSide,
    });
    super(geometry, customMaterial);
    this.sharpness = sharpness;

    customMaterial.onBeforeCompile = (shader) => {
      shader.uniforms.sharpness = {value: this.sharpness};
      shader.fragmentShader = `
        uniform float sharpness;
        ${shader.fragmentShader}
      `;

      // Replace the standard texture lookup with textureGrad, which provides
      // direct control over the mipmap level selection.
      shader.fragmentShader = shader.fragmentShader.replace(
        'vec4 texelColor = texture2D( map, vMapUv );',
        `
          // Calculate the original screen-space derivatives.
          vec2 ddx = dFdx(vMapUv);
          vec2 ddy = dFdy(vMapUv);

          // Scale the derivatives by the sharpness factor. A smaller
          // factor tricks the GPU into thinking the texture is changing
          // very slowly (i.e., is very close to the camera), prompting
          // it to select a higher-resolution mipmap.
          vec4 texelColor = textureGrad( map, vMapUv, ddx * sharpness, ddy * sharpness );
          `
      );
    };

    this.frustumCulled = !isCurved;
  }

  /**
   * Overrides the default load method to attach the custom quality-setting
   * logic after the stream has been initialized by the parent class.
   * @param {xb.VideoStream} source The video stream source.
   */
  load(source) {
    this.stream = source;
    this.material.map = source.texture;
    this.material.needsUpdate = true;
    this.qualitySetupCallback = this.setupTextureQuality.bind(this);
    source.addEventListener('statechange', this.qualitySetupCallback);
    this.setupTextureQuality();
  }

  /**
   * Callback that applies high-quality settings to the video texture once the
   * stream is active.
   * @private
   */
  setupTextureQuality() {
    if (this.stream?.state === xb.StreamState.STREAMING && this.material.map) {
      const texture = this.material.map;
      texture.generateMipmaps = true;
      texture.minFilter = THREE.LinearMipmapLinearFilter;
      texture.magFilter = THREE.LinearFilter;
      texture.colorSpace = THREE.SRGBColorSpace;
      const maxAnisotropy = xb.core.renderer.capabilities.getMaxAnisotropy();
      texture.anisotropy = maxAnisotropy;
      texture.needsUpdate = true;
      this.material.needsUpdate = true;
      this.stream.removeEventListener('statechange', this.qualitySetupCallback);
    }
  }

  /**
   * Overrides the dispose method to also clean up the event listener.
   */
  dispose() {
    if (this.stream && this.qualitySetupCallback) {
      this.stream.removeEventListener('statechange', this.qualitySetupCallback);
    }
    this.geometry.dispose();
    this.material.dispose();
  }
}

function createScreenGeometry(width, height, isCurved, curvature) {
  if (!isCurved || curvature <= 0) {
    return new THREE.PlaneGeometry(width, height);
  }

  const thetaLength = Math.min(curvature, 1) * Math.PI;
  const radius = width / thetaLength;
  const geometry = new THREE.CylinderGeometry(
    radius,
    radius,
    height,
    64,
    1,
    true,
    -thetaLength / 2,
    thetaLength
  );
  geometry.translate(0, 0, -radius);
  geometry.rotateY(Math.PI);
  return geometry;
}
