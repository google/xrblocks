import * as THREE from 'three';
import * as xb from 'xrblocks';
import { UICardBehavior } from './UICardBehavior.js';

/**
 * HeadLeashBehavior
 * Makes a `UICard` gently follow the user's head movement with a delay (spring/damper).
 * Keeps the panel within comfortable viewing frustums maintaining responsive overlays.
 */
class HeadLeashBehavior extends UICardBehavior {
    /**
     * Constructs a new HeadLeashBehavior.
     */
    constructor(config) {
        super({
            ...config,
            posLerp: config.posLerp ?? 0.1,
            rotLerp: config.rotLerp ?? 0.1,
        });
        this._targetPos = new THREE.Vector3();
        this._dummy = new THREE.Object3D();
        this._wasDragging = false;
    }
    update() {
        if (!this.card || !xb.core?.camera)
            return;
        if (this.card.isDragging) {
            this._wasDragging = true;
            return;
        }
        const camera = xb.core.camera;
        // Handle post-drag offset update.
        if (this._wasDragging) {
            this._wasDragging = false;
            // Recalculate offset so the leash naturally targets the newly dropped position.
            // targetPos = camera.position + offset * camera.quaternion.
            // reversed: offset = (card.position - camera.position) * camera.quaternion.inverse().
            const invCamQuat = camera.quaternion.clone().invert();
            this.properties.offset
                .copy(this.card.position)
                .sub(camera.position)
                .applyQuaternion(invCamQuat);
        }
        // Calculate target position.
        // offset is in camera space: target = cameraPos + cameraRot * offset.
        this._targetPos
            .copy(this.properties.offset)
            .applyQuaternion(camera.quaternion)
            .add(camera.position);
        // Calculate smoothing factors.
        // Using 60fps base reference for consistency with Billboard.
        const posLerp = this.properties.posLerp ?? 0.1;
        const rotLerp = this.properties.rotLerp ?? 0.1;
        const delta = xb.getDeltaTime();
        const smoothPos = 1 - Math.exp(-posLerp * delta * 60);
        const smoothRot = 1 - Math.exp(-rotLerp * delta * 60);
        // Apply Position Lerp.
        this.card.position.lerp(this._targetPos, smoothPos);
        // Calculate Target Rotation.
        this._dummy.position.copy(this.card.position); // Rotate from where it is.
        this._dummy.lookAt(camera.position);
        // Apply Rotation Lerp.
        this.card.quaternion.slerp(this._dummy.quaternion, smoothRot);
    }
}

export { HeadLeashBehavior };
