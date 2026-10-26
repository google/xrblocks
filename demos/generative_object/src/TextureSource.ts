import * as THREE from 'three';
import {buildDisplacementMap, keyOutBackground} from 'xrblocks';

/** A loaded texture together with its source pixel dimensions. */
export interface LoadedTexture {
  texture: THREE.Texture;
  width: number;
  height: number;
  /**
   * Optional alpha-masked grayscale map for relief displacement/bump, where the
   * (transparent) background is black so it does not displace.
   */
  displacementTexture?: THREE.Texture;
}

/**
 * Loads a texture from an image source (typically a `data:` URL produced by
 * image generation). Abstracted behind an interface so the orchestration in
 * `GenerativeObjects` can be swapped without decoding real images.
 */
export interface TextureSource {
  load(dataUrl: string): Promise<LoadedTexture>;
}

/**
 * Default {@link TextureSource} backed by `THREE.TextureLoader`. Resolves once
 * the browser has decoded the image, reporting its natural pixel dimensions.
 */
export class DataUrlTextureSource implements TextureSource {
  private loader = new THREE.TextureLoader();

  load(dataUrl: string): Promise<LoadedTexture> {
    return new Promise((resolve, reject) => {
      this.loader.load(
        dataUrl,
        (texture) => {
          texture.colorSpace = THREE.SRGBColorSpace;
          const image = texture.image as
            | {width?: number; height?: number}
            | undefined;
          resolve({
            texture,
            width: image?.width ?? 0,
            height: image?.height ?? 0,
          });
        },
        undefined,
        (error) => reject(error)
      );
    });
  }
}

/**
 * A {@link TextureSource} that removes the (plain) background of the generated
 * image so the subject reads as a clean cutout. Decodes the image to a 2D
 * canvas, keys out background pixels via `keyOutBackground`, and returns a
 * `CanvasTexture`. Browser-only (requires `Image` and a 2D canvas context).
 *
 * The relief displacement map is built lazily, only when `buildDisplacement` is
 * set, so flat cutouts do not allocate a texture they never use.
 */
export class CanvasBackgroundTextureSource implements TextureSource {
  /** Maximum RGB distance from the sampled background color to key out. */
  tolerance?: number;
  /** Whether to also build the relief displacement map. */
  buildDisplacement: boolean;

  constructor(options: {tolerance?: number; buildDisplacement?: boolean} = {}) {
    this.tolerance = options.tolerance;
    this.buildDisplacement = options.buildDisplacement ?? false;
  }

  load(dataUrl: string): Promise<LoadedTexture> {
    return new Promise((resolve, reject) => {
      const image = new Image();
      image.crossOrigin = 'anonymous';
      image.onload = () => {
        try {
          resolve(this.process(image));
        } catch (error) {
          reject(error);
        }
      };
      image.onerror = () =>
        reject(new Error('Failed to decode generated image'));
      image.src = dataUrl;
    });
  }

  private process(image: HTMLImageElement): LoadedTexture {
    const width = image.naturalWidth || image.width;
    const height = image.naturalHeight || image.height;
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext('2d');
    if (!context) {
      throw new Error('2D canvas context unavailable for background removal');
    }
    context.drawImage(image, 0, 0, width, height);
    const imageData = context.getImageData(0, 0, width, height);
    const keyed = keyOutBackground(
      {data: imageData.data, width, height},
      {tolerance: this.tolerance}
    );
    imageData.data.set(keyed.data);
    context.putImageData(imageData, 0, 0);

    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;

    let displacementTexture: THREE.Texture | undefined;
    if (this.buildDisplacement) {
      // An alpha-masked grayscale map for relief: the transparent background is
      // black so it stays flat instead of displacing into stray geometry.
      const displacement = buildDisplacementMap({
        data: keyed.data,
        width,
        height,
      });
      const displacementCanvas = document.createElement('canvas');
      displacementCanvas.width = width;
      displacementCanvas.height = height;
      const displacementContext = displacementCanvas.getContext('2d');
      if (displacementContext) {
        const displacementImageData = displacementContext.createImageData(
          width,
          height
        );
        displacementImageData.data.set(displacement.data);
        displacementContext.putImageData(displacementImageData, 0, 0);
        displacementTexture = new THREE.CanvasTexture(displacementCanvas);
      }
    }

    return {texture, width, height, displacementTexture};
  }
}
