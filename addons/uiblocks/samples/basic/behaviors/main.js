import * as THREE from 'three';
import { HeadLeashBehavior, UIText, BillboardBehavior, ManipulationBehavior, ObjectAnchorBehavior } from 'uiblocks';
import * as xb from 'xrblocks';
import 'xrblocks/addons/simulator/SimulatorAddons.js';
import { Sample } from '../../Sample.js';
import '@pmndrs/uikit';

/**
 * BehaviorSample.
 *
 * Demonstrates various user interface behaviors (HeadLeash, Billboard, Manipulation, ObjectAnchor)
 * assembled dynamically on top of standard template cards.
 */
class BehaviorSample extends Sample {
    /**
     * Constructs a new BehaviorSample and sets up the environment lights/scene props.
     */
    constructor() {
        super();
        // Create a small jumping cube.
        const geometry = new THREE.BoxGeometry(0.1, 0.1, 0.1);
        const material = new THREE.MeshStandardMaterial({ color: 0xff0000 });
        this._cube = new THREE.Mesh(geometry, material);
        xb.core.scene.add(this._cube);
        // Add lights to illuminate the cube.
        const ambientLight = new THREE.AmbientLight(0xffffff, 0.4);
        xb.core.scene.add(ambientLight);
        const dirLight = new THREE.DirectionalLight(0xffffff, 2.0);
        dirLight.position.set(2, 5, 3);
        xb.core.scene.add(dirLight);
    }
    /**
     * Updates animations and state routines continuously every frame hook.
     */
    update() {
        super.update();
        // Animate the cube jumping horizontally.
        const timeSec = xb.getElapsedTime();
        const speed = 0.5;
        const range = 0.1;
        this._cube.position.set(Math.sin(timeSec * speed) * range, 0.9, -1);
    }
    /**
     * Creates cards and attaches various configurations of behaviors.
     */
    createUI() {
        // 1. Head Leash Card.
        const card1 = this.uiCore.createCard({
            name: 'Card_HeadLeash',
            position: new THREE.Vector3(-0.5, 1.5, -1),
            behaviors: [
                new HeadLeashBehavior({
                    offset: new THREE.Vector3(0, 0, -1.1),
                    posLerp: 0.1,
                    rotLerp: 0.1,
                }),
            ],
        });
        const leashSection = this.createSectionWithTitle(card1, 'Head Leash', '100%', '100%');
        leashSection.add(new UIText('Always follows camera.', {
            color: 'white',
            fontSize: 14,
        }));
        // 2. Billboard Card.
        const card2 = this.uiCore.createCard({
            name: 'Card_Billboard',
            position: new THREE.Vector3(0.5, 1.5, -1),
            behaviors: [new BillboardBehavior()],
        });
        const billboardSection = this.createSectionWithTitle(card2, 'Billboard', '100%', '100%');
        billboardSection.add(new UIText('Always faces camera.', {
            color: 'white',
            fontSize: 14,
        }));
        // 3. Manipulation Behavior Card.
        const card3 = this.uiCore.createCard({
            name: 'Card_Manipulation_with_panel',
            position: new THREE.Vector3(-0.5, 1.5, -1),
            behaviors: [
                new ManipulationBehavior({ draggable: true, faceCamera: true }),
            ],
        });
        const panelSection = this.createSectionWithTitle(card3, 'Manipulation', '100%', '100%');
        panelSection.add(new UIText('Drag the edge.', {
            color: 'white',
            fontSize: 14,
        }));
        // 4. Object Anchor + Manipulation Behavior Card.
        const card4 = this.uiCore.createCard({
            name: 'Card_ObjectAnchor',
            position: new THREE.Vector3(0, 1.2, -1.5),
            behaviors: [
                new ObjectAnchorBehavior({
                    target: this._cube,
                    mode: 'pose',
                    positionOffset: new THREE.Vector3(0, 0.2, 0),
                }),
                new ManipulationBehavior({ draggable: true, faceCamera: true }),
            ],
        });
        const anchorSection = this.createSectionWithTitle(card4, 'Object Anchor', '100%', '100%');
        anchorSection.add(new UIText('Attached to the cube.', {
            color: 'white',
            fontSize: 14,
        }));
    }
}
Sample.run(BehaviorSample);
