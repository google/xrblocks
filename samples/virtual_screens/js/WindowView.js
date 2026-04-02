import * as THREE from 'three';
import * as xb from 'xrblocks';

/**
 * A video view for displaying window streams with high-quality rendering
 * settings, an option for a curved display, and a shader for sharpness control.
 */
export class WindowView extends xb.VideoView {
  /**
   * @param {object} options - Configuration options.
   * @param {boolean} [options.isCurved=false] - If true, displays the video on
   * a curved surface.
   * @param {number} [options.curvature=0.5] - The amount of curvature, from 0
   * (flat) to 1 (a full semicircle).
   * @param {number} [options.sharpness=0.1] - Controls the texture sharpness.
   * Lower values (e.g., 0.1) produce a sharper image by tricking the
   * renderer into using higher-resolution mipmaps. 1.0 is normal.
   */
  constructor(options = {}) {
    super(options);
    this.isCurved = this.isCurved ?? false;
    this.curvature = this.curvature ?? 0.5;
    this.sharpness = this.sharpness ?? 0.3;

    // Create a custom material with a shader that controls sharpness.
    const customMaterial = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      transparent: true,
    });

    this._curvedGeoAspectRatio = 0;
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

    // Dispose of the original material created by the parent and replace it
    // with our custom one.
    this.material.dispose();
    this.material = customMaterial;
    this.mesh.material = this.material;
  }

  /**
   * Extends the default layout update to handle the curved geometry correctly.
   * For curved surfaces, it creates a cylinder with the proper aspect ratio and
   * applies a uniform scale, avoiding the texture distortion caused by the
   * parent class's non-uniform scaling.
   * @override
   */
  updateLayout() {
    super.updateLayout();

    if (isNaN(this.rangeY) || this.rangeY <= 0) {
      this.mesh.visible = false;
      console.error(
        '[WindowView] Invalid parent dimensions detected. Hiding view.'
      );
      return;
    }
    this.mesh.visible = true;

    // If the view isn't meant to be curved, or has no actual curvature, then
    // the parent's default scaling logic is sufficient.
    if (!this.isCurved || this.curvature <= 0) {
      return;
    }

    if (this.videoAspectRatio <= 0) {
      return;
    }

    // Recreate the curved geometry only when the aspect ratio changes.
    if (this._curvedGeoAspectRatio !== this.videoAspectRatio) {
      this._curvedGeoAspectRatio = this.videoAspectRatio;
      const aspectRatio = this.videoAspectRatio;

      // Curvature is a value from 0 (flat) to 1 (a semicircle).
      const thetaLength = this.curvature * Math.PI;

      // To preserve the video's aspect ratio, the arc length of the
      // geometry's surface must be proportional to its height.
      // Arc Length = radius * thetaLength.
      const radius = aspectRatio / thetaLength;

      const cylinderGeometry = new THREE.CylinderGeometry(
        radius,
        radius,
        1,
        64,
        1,
        true,
        -thetaLength / 2,
        thetaLength
      );

      // Translate the geometry's vertices instead of the mesh's position.
      cylinderGeometry.translate(0, 0, -radius);

      this.mesh.geometry.dispose();
      this.mesh.geometry = cylinderGeometry;

      // Configure the mesh for displaying the inside of the cylinder.
      this.mesh.position.z = 0;
      this.mesh.rotation.y = Math.PI;
      this.material.side = THREE.BackSide;
      this.mesh.frustumCulled = false;
    }

    // The SpatialPanel's `updateLayout` sets a non-uniform scale, which we
    // override. The geometry has height=1, so the scale is the final height.
    const scale = this.rangeY;
    this.mesh.scale.set(scale, scale, scale);
  }

  /**
   * Overrides the default load method to attach the custom quality-setting
   * logic after the stream has been initialized by the parent class.
   * @param {xb.VideoStream} source The video stream source.
   */
  load(source) {
    super.load(source);
    if (source instanceof xb.VideoStream) {
      this.qualitySetupCallback_ = this.qualitySetupCallback_.bind(this);
      this.stream_.addEventListener('statechange', this.qualitySetupCallback_);
    }
  }

  /**
   * Callback that applies high-quality settings to the video texture once the
   * stream is active.
   * @private
   */
  qualitySetupCallback_() {
    if (this.stream_?.state === xb.StreamState.STREAMING && this.material.map) {
      const texture = this.material.map;
      texture.generateMipmaps = true;
      texture.minFilter = THREE.LinearMipmapLinearFilter;
      texture.magFilter = THREE.LinearFilter;
      texture.colorSpace = THREE.SRGBColorSpace;
      if (this.isCurved) {
        texture.wrapS = THREE.RepeatWrapping;
        texture.repeat.x = -1;
      }
      const maxAnisotropy = xb.core.renderer.capabilities.getMaxAnisotropy();
      texture.anisotropy = maxAnisotropy;
      texture.needsUpdate = true;
      this.material.needsUpdate = true;
      this.stream_.removeEventListener(
        'statechange',
        this.qualitySetupCallback_
      );
    }
  }

  /**
   * Overrides the dispose method to also clean up the event listener.
   */
  dispose() {
    if (this.stream_ && this.qualitySetupCallback_) {
      this.stream_.removeEventListener(
        'statechange',
        this.qualitySetupCallback_
      );
    }
    super.dispose();
  }
}
