import * as THREE from 'three';

import {keyOutBackground} from './BackgroundKeyer';

/** A loaded texture together with its source pixel dimensions. */
export interface LoadedTexture {
  texture: THREE.Texture;
  width: number;
  height: number;
}

/**
 * Loads a texture from an image source (typically a `data:` URL produced by
 * image generation). Abstracted behind an interface so the orchestration in
 * {@link GenerativeObjects} can be unit-tested without decoding real images.
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
 * canvas, keys out background pixels via {@link keyOutBackground}, and returns a
 * `CanvasTexture`. Browser-only (requires `Image` and a 2D canvas context).
 */
export class CanvasBackgroundTextureSource implements TextureSource {
  /** Maximum RGB distance from the sampled background color to key out. */
  tolerance?: number;

  constructor(options: {tolerance?: number} = {}) {
    this.tolerance = options.tolerance;
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
    return {texture, width, height};
  }
}
