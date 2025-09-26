import * as THREE from 'three';
import { ImprovedNoise } from 'three/addons/math/ImprovedNoise.js';
import { VolumetricCloudShader } from './VolumetricCloud.glsl.js';

/**
 * VolumetricCloud class for creating a 3D volumetric cloud effect in a scene.
 */
class VolumetricCloud extends THREE.Object3D {
    /**
     * Constructor for the VolumetricCloud class.
     */
    constructor() {
        super();
        this.size = 128;
        this.cloudScale = 0.05;
        // Generates 3D texture data.
        this.texture = this.createTexture();
        // Retrieves shaders from VolumetricCloudShader.
        this.vertexShader = VolumetricCloudShader.vertexShader;
        this.fragmentShader = VolumetricCloudShader.fragmentShader;
        // Initializes the material for cloud rendering.
        this.material = this.createMaterial();
        // Sets up geometry and mesh.
        this.geometry = new THREE.BoxGeometry(1, 1, 1);
        this.mesh = new THREE.Mesh(this.geometry, this.material);
        this.mesh.position.set(0, 8, 0);
        this.mesh.scale.set(12, 2, 12);
        // this.mesh.scale.set(8, 2, 8);
        this.add(this.mesh);
    }
    /**
     * Creates and populates a 3D texture with Perlin noise.
     * @returns A 3D texture containing the noise data.
     */
    createTexture() {
        const data = new Uint8Array(this.size * this.size * this.size);
        const perlin = new ImprovedNoise();
        const vector = new THREE.Vector3();
        let i = 0;
        // Iterates through each voxel to apply Perlin noise.
        for (let z = 0; z < this.size; z++) {
            for (let y = 0; y < this.size; y++) {
                for (let x = 0; x < this.size; x++) {
                    // Calculates the density based on the distance from the center.
                    const d = 1.0 -
                        vector.set(x, y, z)
                            .subScalar(this.size / 2)
                            .divideScalar(this.size)
                            .length();
                    // Populates the data array with density influenced by noise.
                    data[i] = (this.size +
                        this.size *
                            perlin.noise(x * this.cloudScale / 1.5, y * this.cloudScale, z * this.cloudScale / 1.5)) *
                        d * d;
                    i++;
                }
            }
        }
        // Creates and configures the 3D texture.
        const texture = new THREE.Data3DTexture(data, this.size, this.size, this.size);
        texture.format = THREE.RedFormat;
        texture.minFilter = THREE.LinearFilter;
        texture.magFilter = THREE.LinearFilter;
        texture.unpackAlignment = 1;
        texture.needsUpdate = true;
        return texture;
    }
    /**
     * Creates the custom material for rendering the volumetric cloud.
     * @returns The material for the cloud mesh.
     */
    createMaterial() {
        return new THREE.RawShaderMaterial({
            glslVersion: THREE.GLSL3,
            uniforms: {
                base: { value: new THREE.Color(0x4f5c6e) },
                map: { value: this.texture },
                cameraPos: { value: new THREE.Vector3() },
                threshold: { value: 0.2 },
                opacity: { value: 0.4 },
                range: { value: 0.1 },
                steps: { value: 50 },
                frame: { value: 0 },
            },
            vertexShader: this.vertexShader,
            fragmentShader: this.fragmentShader,
            side: THREE.BackSide,
            transparent: true,
        });
    }
    /**
     * Updates the cloud's position and rotation to sync with the camera's
     * position and to animate the cloud's rotation.
     */
    update(camera) {
        // Synchronizes the camera position with the shader's uniform.
        this.mesh.material.uniforms.cameraPos.value.copy(camera.position);
        // Applies a continuous rotation to the cloud mesh.
        this.mesh.rotation.y = -performance.now() / 7500;
        // Increments the frame uniform for time-based shader calculations.
        this.mesh.material.uniforms.frame.value++;
    }
}

export { VolumetricCloud };
