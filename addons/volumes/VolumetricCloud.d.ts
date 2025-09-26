import * as THREE from 'three';
/**
 * VolumetricCloud class for creating a 3D volumetric cloud effect in a scene.
 */
export declare class VolumetricCloud extends THREE.Object3D {
    private size;
    private cloudScale;
    private texture;
    private vertexShader;
    private fragmentShader;
    private material;
    private geometry;
    mesh: THREE.Mesh<THREE.BoxGeometry, THREE.RawShaderMaterial>;
    /**
     * Constructor for the VolumetricCloud class.
     */
    constructor();
    /**
     * Creates and populates a 3D texture with Perlin noise.
     * @returns A 3D texture containing the noise data.
     */
    private createTexture;
    /**
     * Creates the custom material for rendering the volumetric cloud.
     * @returns The material for the cloud mesh.
     */
    private createMaterial;
    /**
     * Updates the cloud's position and rotation to sync with the camera's
     * position and to animate the cloud's rotation.
     */
    update(camera: THREE.Camera): void;
}
