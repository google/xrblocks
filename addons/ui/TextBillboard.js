import * as THREE from 'three';
import { FontLoader } from 'three/addons/loaders/FontLoader.js';

const DEFAULT_FONT_PATH = 'https://cdn.jsdelivr.net/gh/mrdoob/three.js@r180/examples/fonts/droid/droid_sans_regular.typeface.json';
const vector3 = new THREE.Vector3();
class TextBillboard extends THREE.Object3D {
    /**
     * Constrct a text billboard.
     * @param text - Text to show.
     * @param material - Color of the material.
     * @param font - Font to use. If not provided, a default font will be loaded.
     */
    constructor(text = '', material, font) {
        super();
        this.text = text;
        this.font = font;
        this.textMaterial =
            material ?? new THREE.MeshBasicMaterial({ color: 0xFFFFFF });
        if (!font) {
            new FontLoader().load(DEFAULT_FONT_PATH, (font) => {
                this.font = font;
                this.generateTextMesh();
            });
        }
    }
    generateTextMesh() {
        if (!this.font) {
            // Font is not loaded.
            return;
        }
        if (this.textGeometry) {
            this.textGeometry.dispose();
        }
        const textShapes = this.font.generateShapes(this.text);
        this.textGeometry = new THREE.ShapeGeometry(textShapes);
        this.textGeometry.computeBoundingBox();
        this.textGeometry.boundingBox.getCenter(vector3);
        this.textGeometry.translate(-vector3.x, -vector3.y, -vector3.z);
        if (this.textMesh) {
            this.remove(this.textMesh);
        }
        this.textMesh = new THREE.Mesh(this.textGeometry, this.textMaterial);
        this.textMesh.scale.setScalar(0.0005);
        this.add(this.textMesh);
    }
    updateText(text) {
        this.text = text;
        this.generateTextMesh();
    }
    dispose() {
        this.textGeometry?.dispose();
        this.textMaterial.dispose();
    }
}

export { TextBillboard };
