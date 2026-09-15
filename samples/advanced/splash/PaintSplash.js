import * as THREE from 'three';
import {SimpleDecalGeometry} from 'xrblocks/addons/objects/SimpleDecalGeometry.js';

const ASSETS_PATH = 'https://cdn.jsdelivr.net/gh/xrblocks/assets@main/';

// Duration of fade out in ms.
const kFadeoutMs = 2000;
const textureLoader = new THREE.TextureLoader();
const decalDiffuse = textureLoader.load(
  './paintball_assets/decal-diffuse1.webp'
);
decalDiffuse.colorSpace = THREE.SRGBColorSpace; // Sets the color space for the decal diffuse texture.
const decalNormal = textureLoader.load('./paintball_assets/decal-normal1.webp');

let paintshotAudioBuffer; // Declares a variable to hold the audio buffer for
// the paint shot sound.
const audioLoader = new THREE.AudioLoader();
audioLoader.load(
  ASSETS_PATH + 'musicLibrary/PaintOneShot1.opus',
  function (buffer) {
    paintshotAudioBuffer = buffer; // Loads the paint shot audio and assigns it to the buffer.
  }
);

/**
 * PaintSplash class represents a 3D object for the paintball decal, including
 * the visual decal and optional sound.
 */
export class PaintSplash extends THREE.Object3D {
  /**
   * @param {THREE.AudioListener} listener The audio listener for spatial audio.
   * @param {THREE.Color} color The color of the paintball.
   */
  constructor(listener, color) {
    super();
    // Adds positional audio to the paintball if a listener is provided.
    if (listener != null) {
      this.sound = new THREE.PositionalAudio(listener);
    }
    this.color = color; // Sets the paintball color.
    this.enableSound = true;
    this.splashList = [];
  }

  /**
   * Projects a splat onto a mesh from an intersection point, applying rotation
   * and scale.
   * @param {THREE.Intersection} intersection The intersection data.
   * @param {number} scale The scale of the splat.
   */
  splatFromIntersection(intersection, scale) {
    const objectRotation = new THREE.Quaternion();
    intersection.object.getWorldQuaternion(objectRotation); // Gets the world quaternion for rotation.

    // Clones and rotates the intersection normal to align it with the mesh's
    // orientation.
    const normal = intersection.normal.clone().applyQuaternion(objectRotation);

    const originalNormal = new THREE.Vector3(0, 0, 1); // The original normal to face.
    const angle = originalNormal.angleTo(normal); // Calculates the angle between the normals.

    // Rotates the original normal by the cross product and normalizes it.
    originalNormal.cross(normal).normalize();

    // Applies a random rotation to the splat around the normal.
    const randomRotation = new THREE.Quaternion().setFromAxisAngle(
      normal,
      Math.random() * Math.PI * 2
    );

    // Rotates the splat to face the surface normal with a random rotation.
    const rotateFacingNormal = new THREE.Quaternion()
      .setFromAxisAngle(originalNormal, angle)
      .premultiply(randomRotation);

    // Projects the splat onto the mesh at the given position, orientation, and
    // scale.
    this.splatOnMesh(
      intersection.object,
      intersection.point,
      rotateFacingNormal,
      scale
    );
  }

  /**
   * Creates and applies a decal on the mesh at the specified position with the
   * given orientation and scale.
   * @param {THREE.Mesh} mesh The mesh where the splat will be applied.
   * @param {THREE.Vector3} position The world position of the splat.
   * @param {THREE.Quaternion} orientation The rotation of the splat.
   * @param {number} scale The scale of the splat.
   */
  splatOnMesh(mesh, position, orientation, scale) {
    // Creates a material for the decal using the specified color, textures, and
    // settings.
    const material = new THREE.MeshPhongMaterial({
      color: this.color,
      specular: 0x555555,
      map: decalDiffuse,
      normalMap: decalNormal,
      normalScale: new THREE.Vector2(1, 1),
      shininess: 30,
      transparent: true,
      depthTest: true,
      polygonOffset: true,
      polygonOffsetFactor: 0,
      alphaTest: 0.5,
      opacity: 1.0,
      side: THREE.FrontSide,
    });

    // Creates a scale vector for the decal geometry.
    const scaleVector3 = new THREE.Vector3(scale, scale, scale);

    // Generates a custom geometry for the decal using the SimpleDecalGeometry
    // class.
    const geometry = new SimpleDecalGeometry(
      mesh,
      position,
      orientation,
      scaleVector3
    );
    geometry.computeVertexNormals(); // Computes vertex normals for proper shading.

    // Creates a mesh for the decal and adds it to the scene.
    this.decalMesh = new THREE.Mesh(geometry, material);
    this.decalMesh.createdTime = performance.now();
    this.add(this.decalMesh);

    // Plays the paint shot sound if the audio buffer is loaded and sound is
    // enabled.
    if (
      this.enableSound &&
      this.sound != null &&
      paintshotAudioBuffer != null
    ) {
      this.sound.setBuffer(paintshotAudioBuffer);
      this.sound.setRefDistance(10);
      this.sound.play();
    }
  }

  update() {
    const currentTime = performance.now();

    // Iterate over all children of the Object3D instance
    this.children.forEach((child) => {
      // Ensure the child is a THREE.Mesh and has a 'createdTime' property
      if (child instanceof THREE.Mesh && child.createdTime !== undefined) {
        const timeElapsed = currentTime - child.createdTime;

        // Check if it's time to start fading out the mesh (after 2 seconds)
        if (timeElapsed > kFadeoutMs) {
          const timeSinceFadeStart = timeElapsed - kFadeoutMs; // Time since the start of fade

          // If within the fade duration, update opacity
          if (timeSinceFadeStart <= kFadeoutMs) {
            const newOpacity = 1.0 - timeSinceFadeStart / kFadeoutMs;
            child.material.opacity = Math.max(0.0, newOpacity); // Ensure opacity doesn't go below 0
            child.material.transparent = true; // Ensure transparency is enabled
          } else {
            // If the fade duration has passed, remove the mesh from the scene
            this.remove(child);
          }
        }
      }
    });
  }

  /**
   * Disposes of the paintball's decal mesh and its associated geometry and
   * material.
   */
  dispose() {
    if (this.decalMesh) {
      this.decalMesh.geometry.dispose(); // Disposes of the geometry.
      this.decalMesh.material.dispose(); // Disposes of the material.
    }
  }
}
