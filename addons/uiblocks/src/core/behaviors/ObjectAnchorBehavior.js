import * as THREE from 'three';
import { UICardBehavior } from './UICardBehavior.js';

/**
 * ObjectAnchorBehavior
 * Anchors a `UICard` to another 3D object in the scene with optional continuous offset buffers.
 * Supports position, rotation, or full pose alignment hooks seamlessly.
 */
class ObjectAnchorBehavior extends UICardBehavior {
    /**
     * Constructs a new ObjectAnchorBehavior.
     */
    constructor(config) {
        super({
            ...config,
            mode: config.mode ?? 'position',
        });
        // Local offsets relative to the target.
        this.positionOffset = new THREE.Vector3();
        this.rotationOffset = new THREE.Quaternion();
        this._wasDragging = false;
        if (config.positionOffset)
            this.positionOffset.copy(config.positionOffset);
        if (config.rotationOffset)
            this.rotationOffset.copy(config.rotationOffset);
    }
    update() {
        if (!this.card)
            return;
        if (this.card.isDragging) {
            this._wasDragging = true;
            return;
        }
        // Handle post-drag offset updates.
        if (this._wasDragging) {
            this._wasDragging = false;
            // Reverse compute the position offset.
            if (this.properties.mode === 'position' ||
                this.properties.mode === 'pose') {
                this.positionOffset
                    .copy(this.card.position)
                    .sub(this.properties.target.position);
            }
            // Reverse compute the rotation offset.
            if ((this.properties.mode === 'rotation' ||
                this.properties.mode === 'pose') &&
                this.properties.target.quaternion) {
                // card.quaternion = target.quaternion * rotationOffset.
                // reversed: rotationOffset = target.quaternion.inverse() * card.quaternion.
                const invTargetQuat = this.properties.target.quaternion
                    .clone()
                    .invert();
                this.rotationOffset.copy(invTargetQuat).multiply(this.card.quaternion);
            }
        }
        // 1. Sync Position.
        if (this.properties.mode === 'position' ||
            this.properties.mode === 'pose') {
            // Logic: Target World Pos + Offset.
            this.card.position
                .copy(this.properties.target.position)
                .add(this.positionOffset);
        }
        // 2. Sync Rotation
        // Only works if the target actually provides a quaternion.
        if ((this.properties.mode === 'rotation' ||
            this.properties.mode === 'pose') &&
            this.properties.target.quaternion) {
            this.card.quaternion.copy(this.properties.target.quaternion);
            // Apply local rotation offset if needed
            if (!this.rotationOffset.equals(new THREE.Quaternion())) {
                this.card.quaternion.multiply(this.rotationOffset);
            }
        }
    }
}

export { ObjectAnchorBehavior };
