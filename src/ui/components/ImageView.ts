import * as THREE from 'three';

import {View} from '../core/View';
import {ViewOptions} from '../core/ViewOptions';

/**
 * A UI component for displaying a 2D image on a panel in XR.
 * It automatically handles loading the image and scaling it to fit within its
 * layout bounds while preserving the original aspect ratio.
 */
export type ImageViewOptions = ViewOptions&{
  src?: string;
};

export class ImageView extends View {
  /** The URL of the image file to be displayed. */
  src?: string;
  /** The material applied to the image plane. */
  material: THREE.MeshBasicMaterial;
  /** The mesh that renders the image. */
  mesh: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>;

  private texture?: THREE.Texture;
  private initCalled = false;
  private textureLoader = new THREE.TextureLoader();

  /**
   * @param options - Configuration options. Can include properties like
   * `src`, `width`, `height`, and other properties from the base `View` class.
   */
  constructor(options: ImageViewOptions = {}) {
    super(options);

    const material = new THREE.MeshBasicMaterial({
      map: null,  // Texture will be loaded and assigned in reload()
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
    });

    const geometry = new THREE.PlaneGeometry(1, 1);
    this.mesh = new THREE.Mesh(geometry, material);
    this.material = material;
    this.add(this.mesh);
  }

  /**
   * Initializes the component. Called once by the XR Blocks lifecycle.
   */
  init() {
    if (this.initCalled) return;
    this.initCalled = true;
    this.reload();
  }

  /**
   * Reloads the image from the `src` URL. If a texture already exists, it is
   * properly disposed of before loading the new one.
   */
  reload() {
    if (!this.src) {
      // If no source, ensure no texture is displayed.
      if (this.material.map) {
        this.material.map = null;
        this.material.needsUpdate = true;
      }
      this.texture?.dispose();
      this.texture = undefined;
      return;
    }

    this.texture?.dispose();
    this.texture = this.textureLoader.load(this.src, (loadedTexture) => {
      loadedTexture.colorSpace = THREE.SRGBColorSpace;
      this.material.map = loadedTexture;
      this.material.needsUpdate = true;
      // Updates layout after the image has loaded to get correct dimensions.
      this.updateLayout();
    });
  }

  /**
   * Updates the layout of the view and then adjusts the mesh scale to maintain
   * the image's aspect ratio.
   * @override
   */
  updateLayout() {
    super.updateLayout();
    if (this.mesh) {
      this.mesh.renderOrder = this.renderOrder;
    }
    this.scaleImageToCorrectAspectRatio();
  }

  /**
   * Calculates the correct scale for the image plane to fit within the view's
   * bounds without distortion.
   */
  scaleImageToCorrectAspectRatio() {
    if (this.texture?.image) {
      const {image} = this.texture;
      const textureWidth = image.width;
      const textureHeight = image.height;

      // Determines the scaling factor to fit the image within the view's range.
      const widthScaleFactor = this.rangeX / textureWidth;
      const heightScaleFactor = this.rangeY / textureHeight;
      const minScaleFactor = Math.min(widthScaleFactor, heightScaleFactor);

      // Applies the calculated scale to the mesh.
      this.mesh.scale.set(
          textureWidth * minScaleFactor, textureHeight * minScaleFactor, 1);
    }
  }

  /**
   * Sets a new image source and reloads it.
   * @param src - The URL of the new image to load.
   */
  load(src: string) {
    this.src = src;
    this.reload();
  }
}
