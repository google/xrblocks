import * as xb from 'xrblocks';
import * as THREE from 'three';
import { DEFAULT_MANIPULATION_PANEL_PROPS } from '../constants/ManipulationPanelConstants.js';
import { UICardBehavior } from './UICardBehavior.js';

/**
 * ManipulationBehavior
 * Handles visual padding expansion, rounded edges, and interactive cursor glows for a `UICard`.
 * Also provides complete 3DOF Drag-and-Drop functionality using standard controllers.
 */
class ManipulationBehavior extends UICardBehavior {
    constructor() {
        super(...arguments);
        this.dragging = false;
        this.draggingControllerId = null;
        this.originalCardPosition = new THREE.Vector3();
        this.originalCardRotation = new THREE.Quaternion();
        this.originalCardScale = new THREE.Vector3();
        this.originalControllerMatrixInverse = new THREE.Matrix4();
        this._vector3 = new THREE.Vector3();
        this._up = new THREE.Vector3(0, 1, 0);
    }
    // Global drag state to ensure only one card can be dragged at a time.
    static { this.activeDraggingCard = null; }
    get isDragging() {
        return this.dragging;
    }
    onAttach(card) {
        super.onAttach(card);
        // If not draggable, no interaction/expansion applies.
        if (!this.properties.draggable)
            return;
        const marginPx = DEFAULT_MANIPULATION_PANEL_PROPS.manipulationMargin;
        const marginMeters = marginPx * card.cardPixelSize;
        const overrides = {};
        if (card.baseWidth !== undefined) {
            overrides.width = card.baseWidth + 2 * marginPx;
        }
        else if (card.baseSizeX !== undefined) {
            overrides.sizeX = card.baseSizeX + 2 * marginMeters;
            overrides.width = overrides.sizeX / card.cardPixelSize;
        }
        if (card.baseHeight !== undefined) {
            overrides.height = card.baseHeight + 2 * marginPx;
        }
        else if (card.baseSizeY !== undefined) {
            overrides.sizeY = card.baseSizeY + 2 * marginMeters;
            overrides.height = overrides.sizeY / card.cardPixelSize;
        }
        overrides.padding = marginPx;
        overrides.paddingLeft = marginPx;
        overrides.paddingRight = marginPx;
        overrides.paddingTop = marginPx;
        overrides.paddingBottom = marginPx;
        card.setProperties(overrides);
        if (card.basePosition &&
            card.anchorX !== undefined &&
            card.anchorY !== undefined) {
            const offsetX = (card.anchorX - 0.5) * 2 * marginMeters;
            const offsetY = (card.anchorY - 0.5) * 2 * marginMeters;
            const newPos = card.basePosition
                .clone()
                .add(new THREE.Vector3(offsetX, offsetY, 0));
            card.position.copy(newPos);
        }
        card.setManipulationMargin(marginPx);
        card.setManipulationCornerRadius(DEFAULT_MANIPULATION_PANEL_PROPS.manipulationCornerRadius);
        card.setCursorSpotlightBlur(DEFAULT_MANIPULATION_PANEL_PROPS.cursorSpotlightBlur);
    }
    update() {
        if (!this.card || !this.card.ux)
            return;
        if (!this.properties.draggable)
            return;
        if (ManipulationBehavior.activeDraggingCard !== null &&
            ManipulationBehavior.activeDraggingCard !== this.card) {
            this.card.setCursor(null, 0);
            this.card.setCursor(null, 1);
            return;
        }
        const ux = this.card.ux;
        // Handle Dragging Logic.
        if (!this.dragging) {
            // Look for a controller that just started selecting and is hovering over this card.
            const controllers = xb.core?.input?.controllers || [];
            for (let i = 0; i < controllers.length; i++) {
                const controller = controllers[i];
                const id = controller.userData.id;
                if (ux.hovered[id] && ux.selected[id]) {
                    // Check if another card is already being dragged.
                    if (ManipulationBehavior.activeDraggingCard !== null &&
                        ManipulationBehavior.activeDraggingCard !== this.card) {
                        continue;
                    }
                    this.dragging = true;
                    this.draggingControllerId = id;
                    this.draggingController = controller;
                    ManipulationBehavior.activeDraggingCard = this.card;
                    this.originalCardPosition.copy(this.card.position);
                    this.originalCardScale.copy(this.card.scale);
                    // Apply face camera rotation so that the entire drag happens mathematically
                    // oriented to the camera from the start, as if the user grabbed it facing them.
                    if (this.properties.faceCamera) {
                        const camera = xb.core?.camera;
                        if (camera) {
                            this._vector3.subVectors(this.card.position, camera.position);
                            this.card.quaternion.setFromAxisAngle(this._up, (3 * Math.PI) / 2 - Math.atan2(this._vector3.z, this._vector3.x));
                        }
                    }
                    this.originalCardRotation.copy(this.card.quaternion);
                    this.originalControllerMatrixInverse
                        .compose(controller.position, controller.quaternion, controller.scale)
                        .invert();
                    ux.activeDragged[id] = true;
                    break; // Only drag with one controller at a time.
                }
            }
        }
        else {
            // Continue dragging if still selected by the dragging controller (regardless of hover).
            const id = this.draggingControllerId;
            if (this.draggingController.userData.selected) {
                const controller = this.draggingController;
                this.card.position.copy(this.originalCardPosition);
                this.card.quaternion.copy(this.originalCardRotation);
                this.card.scale.copy(this.originalCardScale);
                this.card.updateMatrix();
                controller.updateMatrix();
                this.card.matrix
                    .premultiply(this.originalControllerMatrixInverse)
                    .premultiply(controller.matrix);
                this.card.position.setFromMatrixPosition(this.card.matrix);
                // Continuously face camera while actively dragging.
                if (this.properties.faceCamera) {
                    const camera = xb.core?.camera;
                    if (camera) {
                        this._vector3.subVectors(this.card.position, camera.position);
                        this.card.quaternion.setFromAxisAngle(this._up, (3 * Math.PI) / 2 - Math.atan2(this._vector3.z, this._vector3.x));
                    }
                }
            }
            else {
                // Stop dragging.
                this.dragging = false;
                this.draggingControllerId = null;
                this.draggingController = undefined;
                ux.activeDragged[id] = false;
                if (ManipulationBehavior.activeDraggingCard === this.card) {
                    ManipulationBehavior.activeDraggingCard = null;
                }
            }
        }
        const activeIds = ux.getPrimaryTwoControllerIds();
        for (let i = 0; i < 2; i++) {
            const id = activeIds[i];
            if (id !== null && ux.hovered[id]) {
                const uv = ux.uvs[id];
                this.card.setCursor(uv ? uv.clone() : null, i);
            }
            else {
                this.card.setCursor(null, i);
            }
        }
    }
    dispose() {
        if (!this.card)
            return;
        if (this.properties.draggable) {
            const overrides = {};
            if (this.card.baseWidth !== undefined) {
                overrides.width = this.card.baseWidth;
            }
            else if (this.card.baseSizeX !== undefined) {
                overrides.sizeX = this.card.baseSizeX;
                overrides.width = this.card.baseSizeX / this.card.cardPixelSize;
            }
            if (this.card.baseHeight !== undefined) {
                overrides.height = this.card.baseHeight;
            }
            else if (this.card.baseSizeY !== undefined) {
                overrides.sizeY = this.card.baseSizeY;
                overrides.height = this.card.baseSizeY / this.card.cardPixelSize;
            }
            overrides.padding = 0;
            overrides.paddingLeft = 0;
            overrides.paddingRight = 0;
            overrides.paddingTop = 0;
            overrides.paddingBottom = 0;
            this.card.setProperties(overrides);
            if (this.card.basePosition) {
                this.card.position.copy(this.card.basePosition);
            }
            this.card.setManipulationMargin(0);
            this.card.setManipulationCornerRadius(0);
            this.card.setCursorSpotlightBlur(0);
            this.card.setCursor(null, 0);
            this.card.setCursor(null, 1);
        }
        if (this.dragging &&
            ManipulationBehavior.activeDraggingCard === this.card) {
            ManipulationBehavior.activeDraggingCard = null;
        }
        this.card = null;
    }
}

export { ManipulationBehavior };
