import * as THREE from 'three';
import 'xrblocks/addons/simulator/SimulatorAddons.js';
import { Sample } from '../../Sample.js';
import '@pmndrs/uikit';
import 'uiblocks';
import 'xrblocks';

/**
 * CardSample.
 *
 * Demonstrates basic creation and configuration of template `UICard` instances.
 * Shows default scaling options and layout anchors placement setups.
 */
class CardSample extends Sample {
    constructor() {
        super();
    }
    /**
     * Creates cards with different configurations.
     */
    createUI() {
        // 1. Default Card.
        const card1 = this.uiCore.createCard({
            name: 'Card_Default',
            position: new THREE.Vector3(-0.6, 1.5, -1),
        });
        this.createSectionWithTitle(card1, 'Default', '100%', '100%');
        // 2. Larger Size Card.
        const card2 = this.uiCore.createCard({
            name: 'Card_Large',
            position: new THREE.Vector3(-0.2, 1.5, -1),
            sizeX: 0.3,
            sizeY: 0.2,
        });
        this.createSectionWithTitle(card2, 'Large Size (0.3x0.2)', '100%', '100%');
        // 3. Different Anchor Card.
        const card3 = this.uiCore.createCard({
            name: 'Card_CustomAnchor',
            position: new THREE.Vector3(0.3, 1.5, -1),
            anchorX: 'left',
            anchorY: 'top',
        });
        this.createSectionWithTitle(card3, 'Top-Left Anchor', '100%', '100%');
        // 4. Custom pixelSize (DPI).
        const card4 = this.uiCore.createCard({
            name: 'Card_PixelSize',
            position: new THREE.Vector3(0.7, 1.5, -1),
            pixelSize: 0.0005,
        });
        this.createSectionWithTitle(card4, 'pixelSize: 0.0005', '100%', '100%');
    }
}
Sample.run(CardSample);
