import * as THREE from 'three';

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
