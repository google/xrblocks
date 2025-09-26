import * as THREE from 'three';

import {LEFT_VIEW_ONLY_LAYER, RIGHT_VIEW_ONLY_LAYER} from '../constants';

/**
 * Sets the given object and all its children to only be visible in the left
 * eye.
 * @param obj - Object to show only in the left eye.
 * @returns The original object.
 */
export function showOnlyInLeftEye<T extends THREE.Object3D>(obj: T) {
  obj.layers.set(LEFT_VIEW_ONLY_LAYER);
  obj.children.forEach((child) => {
    showOnlyInLeftEye(child);
  });
  return obj;
}

/**
 * Sets the given object and all its children to only be visible in the right
 * eye.
 * @param obj - Object to show only in the right eye.
 * @returns The original object.
 */
export function showOnlyInRightEye<T extends THREE.Object3D>(obj: T) {
  obj.layers.set(RIGHT_VIEW_ONLY_LAYER);
  obj.children.forEach((child) => {
    showOnlyInRightEye(child);
  });
  return obj;
}

/**
 * Loads a stereo image from a URL and returns two THREE.Texture objects, one
 * for the left eye and one for the right eye.
 * @param url - The URL of the stereo image.
 * @returns A promise that resolves to an array containing the left and right
 *     eye textures.
 */
export async function loadStereoImageAsTextures(url: string) {
  const image = await new Promise(
      (resolve, reject) => {
          new THREE.ImageLoader().load(url, resolve, undefined, reject)});
  const leftTexture = new THREE.Texture();
  leftTexture.image = image;
  leftTexture.repeat.x = 0.5;
  leftTexture.needsUpdate = true;
  const rightTexture = leftTexture.clone();
  rightTexture.offset.x = 0.5;
  rightTexture.needsUpdate = true;
  return [leftTexture, rightTexture];
}
