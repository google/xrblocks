import * as THREE from 'three';
import * as xb from 'xrblocks';
import { UICardBehavior } from './UICardBehavior.js';

/**
 * BillboardBehavior
 * Makes a `UICard` automatically face the user's camera view.
 * Dynamically resolves continuous frames updating smoothly into calculated thresholds.
 */
class BillboardBehavior extends UICardBehavior {
    /**
     * Constructs a new BillboardBehavior.
     */
    constructor(config = {}) {
        super({
            mode: config.mode ?? 'cylindrical',
            lerpFactor: config.lerpFactor ?? 0.1,
        });
        this._targetPos = new THREE.Vector3();
        this._dummy = new THREE.Object3D();
    }
    update() {
        if (!this.card || !xb.core?.camera)
            return;
        if (this.card.isDragging)
            return;
        const camera = xb.core.camera;
        const cardObj = this.card;
        // Use dummy object to calculate target rotation.
        this._dummy.position.copy(cardObj.position);
        if (this.properties.mode === 'spherical') {
            this._dummy.lookAt(camera.position);
        }
        else if (this.properties.mode === 'cylindrical') {
            this._targetPos.set(camera.position.x, cardObj.position.y, camera.position.z);
            this._dummy.lookAt(this._targetPos);
        }
        // Smoothly rotate towards target.
        // Adjust lerp speed based on delta to be somewhat framerate independent.
        // Using a simple lerp factor for "feel" as requested.
        // A higher lerpFactor means faster (1.0 = instant).
        const lerpFactor = this.properties.lerpFactor ?? 0.1;
        const smoothFactor = 1 - Math.exp(-lerpFactor * xb.getDeltaTime() * 60);
        cardObj.quaternion.slerp(this._dummy.quaternion, smoothFactor);
    }
}

export { BillboardBehavior };
