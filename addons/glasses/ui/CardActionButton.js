import { Container, abortableEffect } from '@pmndrs/uikit';
import { computed } from '@preact/signals-core';
import * as THREE from 'three';
import { ActionButton } from './ActionButton.js';
import { BoxShadow } from './BoxShadow.js';
import './HighlightMaterial.js';
import './MaterialSymbolsIcon.js';
import './utils.js';

// Shadows from bottom to top.
const shadowDefinitions = [
    { blur: 6, spread: 2, color: '#000000' },
    { blur: 12, spread: 6, color: 'rgba(0, 0, 0, 0.90)' },
];
function generateActionButtonBackgroundTexture(actionButtonSize, canvasSize, padding, radius, canvas) {
    canvas.width = canvasSize[0];
    canvas.height = canvasSize[1];
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#00000000';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    // Draw each shadow layer, from bottom to top
    for (const shadow of shadowDefinitions) {
        const spread = shadow.spread || 0;
        const shapeSizeX = actionButtonSize[0] + spread * 2;
        const shapeSizeY = actionButtonSize[1] + spread * 2;
        ctx.shadowBlur = shadow.blur || 0;
        ctx.shadowColor = shadow.color || 'black';
        ctx.fillStyle = 'black';
        ctx.beginPath();
        ctx.roundRect(padding - spread, padding - spread, shapeSizeX, shapeSizeY, radius);
        ctx.fill();
    }
    return new THREE.CanvasTexture(canvas);
}
class CardActionButton extends Container {
    constructor(properties) {
        const spaceToReserve = computed(() => 56 - 16);
        super({ height: spaceToReserve, marginX: 'auto' });
        this.name = 'Card Action Button';
        this.shadowCanvas = document.createElement('canvas');
        this.shadowTexture = new THREE.CanvasTexture(this.shadowCanvas);
        const paddingAmount = 15;
        const container = new Container(properties, undefined, {
            defaultOverrides: {
                marginTop: -16 - paddingAmount,
                padding: paddingAmount,
                justifyContent: 'center',
                alignContent: 'center',
            },
        });
        this.add(container);
        const actionButton = new ActionButton({
            ...properties,
            backgroundColor: 'black',
        });
        const actionButtonShadow = new BoxShadow({
            boxSize: actionButton.size,
            boxCornerRadius: actionButton.properties.signal.borderTopLeftRadius,
            width: '100%',
            height: '100%',
            positionType: 'absolute',
            positionTop: 0,
            positionLeft: 0,
        });
        container.add(actionButtonShadow);
        container.add(actionButton);
        abortableEffect(() => {
            const actionButtonSize = actionButton.size.value;
            const containerSize = container.size.value;
            if (actionButtonSize && containerSize) {
                generateActionButtonBackgroundTexture(actionButtonSize, containerSize, paddingAmount, 100, this.shadowCanvas);
                this.shadowTexture.needsUpdate = true;
            }
        }, this.abortSignal);
    }
    dispose() {
        this.shadowTexture.dispose();
        super.dispose();
    }
}

export { CardActionButton };
