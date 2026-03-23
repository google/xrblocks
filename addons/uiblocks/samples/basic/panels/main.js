import * as THREE from 'three';
import { UIPanel, UIText } from 'uiblocks';
import 'xrblocks/addons/simulator/SimulatorAddons.js';
import { Sample } from '../../Sample.js';
import '@pmndrs/uikit';
import 'xrblocks';

/**
 * PanelSample.
 *
 * Demonstrates extensive UIPanel features including background painting,
 * bordering, corner radiuses, and shadow manipulations.
 */
class PanelSample extends Sample {
    /**
     * Constructs a new PanelSample.
     */
    constructor() {
        super();
    }
    /**
     * Helper to create a demo panel with label and properties.
     */
    createPanelWithLabel(parent, label, props) {
        const wrapper = new UIPanel({
            flexDirection: 'column',
            justifyContent: 'center',
            alignItems: 'center',
            gap: 10,
            width: 150,
            height: 150,
        });
        parent.add(wrapper);
        const p = new UIPanel({
            width: 100,
            height: 100,
            cornerRadius: 20,
            ...props,
        });
        wrapper.add(p);
        const l = new UIText(label, {
            color: 'white',
            fontSize: 16,
            textAlign: 'center',
        });
        wrapper.add(l);
        return p;
    }
    /**
     * Creates static and dynamic panels with different configurations.
     */
    createUI() {
        // Card 1: Static Panels.
        const card1 = this.uiCore.createCard({
            name: 'Card_StaticPanels',
            position: new THREE.Vector3(0, 1.6, -1),
            sizeX: 1.5,
            sizeY: 1.0,
            flexDirection: 'column',
            justifyContent: 'center',
            alignItems: 'center',
            gap: 20,
        });
        // Row 1: Panel Colors (Solid & Gradient).
        const row1 = this.createSectionWithTitle(card1, 'Panel Colors (Solid & Gradient)');
        this.createPanelWithLabel(row1, 'Solid', {
            fillColor: '#4796E3',
        });
        this.createPanelWithLabel(row1, 'Linear Gradient 30deg', {
            fillColor: {
                gradientType: 'linear',
                rotation: 30,
                stops: [
                    { position: 0, color: '#4796E3' },
                    { position: 0.5, color: '#9177C7' },
                    { position: 1, color: '#CA6673' },
                ],
            },
        });
        this.createPanelWithLabel(row1, 'Radial Gradient', {
            fillColor: {
                gradientType: 'radial',
                stops: [
                    { position: 0, color: '#4796E3' },
                    { position: 0.5, color: '#9177C7' },
                    { position: 1, color: '#CA6673' },
                ],
            },
        });
        this.createPanelWithLabel(row1, 'Angular Gradient 30deg', {
            fillColor: {
                gradientType: 'angular',
                rotation: 30,
                stops: [
                    { position: 0, color: '#4796E3' },
                    { position: 0.5, color: '#9177C7' },
                    { position: 1, color: '#CA6673' },
                ],
            },
        });
        this.createPanelWithLabel(row1, 'Diamond Gradient', {
            fillColor: {
                gradientType: 'diamond',
                stops: [
                    { position: 0, color: '#4796E3' },
                    { position: 0.5, color: '#9177C7' },
                    { position: 1, color: '#CA6673' },
                ],
            },
        });
        // Row 2: Inner Shadows.
        const row2 = this.createSectionWithTitle(card1, 'Inner Shadows (Blur, Spread, Falloff, Position, Gradient)');
        this.createPanelWithLabel(row2, 'Solid 10px', {
            fillColor: '#1a1a1a',
            innerShadowColor: '#4796E3',
            innerShadowBlur: 10,
        });
        this.createPanelWithLabel(row2, 'Larger Blur 40px', {
            fillColor: '#1a1a1a',
            innerShadowColor: '#4796E3',
            innerShadowBlur: 40,
        });
        this.createPanelWithLabel(row2, 'Spread 10px', {
            fillColor: '#1a1a1a',
            innerShadowColor: '#4796E3',
            innerShadowBlur: 10,
            innerShadowSpread: 10,
        });
        this.createPanelWithLabel(row2, 'Falloff 2.0', {
            fillColor: '#1a1a1a',
            innerShadowColor: '#4796E3',
            innerShadowBlur: 10,
            innerShadowFalloff: 2.0,
        });
        this.createPanelWithLabel(row2, 'Position (10, -10)', {
            fillColor: '#1a1a1a',
            innerShadowColor: '#4796E3',
            innerShadowBlur: 10,
            innerShadowPosition: [10, -10],
        });
        this.createPanelWithLabel(row2, 'Linear Gradient 30deg', {
            fillColor: '#1a1a1a',
            innerShadowColor: {
                gradientType: 'linear',
                rotation: 30,
                stops: [
                    { position: 0, color: '#4796E3' },
                    { position: 0.5, color: '#9177C7' },
                    { position: 1, color: '#CA6673' },
                ],
            },
            innerShadowBlur: 10,
        });
        this.createPanelWithLabel(row2, 'Radial Gradient', {
            fillColor: '#1a1a1a',
            innerShadowColor: {
                gradientType: 'radial',
                stops: [
                    { position: 0, color: '#4796E3' },
                    { position: 0.5, color: '#9177C7' },
                    { position: 1, color: '#CA6673' },
                ],
            },
            innerShadowBlur: 10,
        });
        // Row 3: Drop Shadows.
        const row3 = this.createSectionWithTitle(card1, 'Drop Shadows (Blur, Spread, Falloff, Position, Gradient)');
        this.createPanelWithLabel(row3, 'Solid 10px', {
            fillColor: '#1a1a1a',
            dropShadowColor: '#4796E3',
            dropShadowBlur: 10,
        });
        this.createPanelWithLabel(row3, 'Larger Blur 40px', {
            fillColor: '#1a1a1a',
            dropShadowColor: '#4796E3',
            dropShadowBlur: 40,
        });
        this.createPanelWithLabel(row3, 'Spread 10px', {
            fillColor: '#1a1a1a',
            dropShadowColor: '#4796E3',
            dropShadowBlur: 10,
            dropShadowSpread: 10,
        });
        this.createPanelWithLabel(row3, 'Falloff 2.0', {
            fillColor: '#1a1a1a',
            dropShadowColor: '#4796E3',
            dropShadowBlur: 10,
            dropShadowFalloff: 2.0,
        });
        this.createPanelWithLabel(row3, 'Position (10, -10)', {
            fillColor: '#1a1a1a',
            dropShadowColor: '#4796E3',
            dropShadowBlur: 10,
            dropShadowPosition: [10, -10],
        });
        this.createPanelWithLabel(row3, 'Linear Gradient 30deg', {
            fillColor: '#1a1a1a',
            dropShadowColor: {
                gradientType: 'linear',
                rotation: 30,
                stops: [
                    { position: 0, color: '#4796E3' },
                    { position: 0.5, color: '#9177C7' },
                    { position: 1, color: '#CA6673' },
                ],
            },
            dropShadowBlur: 10,
        });
        this.createPanelWithLabel(row3, 'Radial Gradient', {
            fillColor: '#1a1a1a',
            dropShadowColor: {
                gradientType: 'radial',
                stops: [
                    { position: 0, color: '#4796E3' },
                    { position: 0.5, color: '#9177C7' },
                    { position: 1, color: '#CA6673' },
                ],
            },
            dropShadowBlur: 10,
        });
        // Row 4: Strokes (Gradient & Solid).
        const row4 = this.createSectionWithTitle(card1, 'Strokes (Solid, Width, Align, Gradient)');
        this.createPanelWithLabel(row4, 'Solid', {
            fillColor: '#1a1a1a',
            strokeColor: '#4796E3',
            strokeWidth: 4,
        });
        this.createPanelWithLabel(row4, 'Wider 10px', {
            fillColor: '#1a1a1a',
            strokeColor: '#4796E3',
            strokeWidth: 10,
        });
        this.createPanelWithLabel(row4, 'Outside Align', {
            fillColor: '#1a1a1a',
            strokeColor: '#4796E3',
            strokeWidth: 5,
            strokeAlign: 'outside',
        });
        this.createPanelWithLabel(row4, 'Inside Align', {
            fillColor: '#1a1a1a',
            strokeColor: '#4796E3',
            strokeWidth: 5,
            strokeAlign: 'inside',
        });
        this.createPanelWithLabel(row4, 'Linear Gradient 30deg', {
            fillColor: '#1a1a1a',
            strokeWidth: 6,
            strokeColor: {
                gradientType: 'linear',
                rotation: 30,
                stops: [
                    { position: 0, color: '#4796E3' },
                    { position: 0.5, color: '#9177C7' },
                    { position: 1, color: '#CA6673' },
                ],
            },
        });
        this.createPanelWithLabel(row4, 'Angular Gradient 30deg', {
            fillColor: '#1a1a1a',
            strokeWidth: 6,
            strokeColor: {
                gradientType: 'angular',
                rotation: 30,
                stops: [
                    { position: 0, color: '#4796E3' },
                    { position: 0.5, color: '#9177C7' },
                    { position: 1, color: '#CA6673' },
                ],
            },
        });
        // Card 2: Dynamic Panels.
        const card2 = this.uiCore.createCard({
            name: 'Card_DynamicPanels',
            position: new THREE.Vector3(0, 0.9, -1),
            sizeX: 1.5,
            sizeY: 1.0,
            flexDirection: 'column',
            justifyContent: 'center',
            alignItems: 'center',
            gap: 20,
        });
        const dynamicRow = this.createSectionWithTitle(card2, 'Dynamic Panel Properties');
        // 1. Dynamic Gradient.
        this.dynamicPanel1 = this.createPanelWithLabel(dynamicRow, 'Linear Gradient Fill Rot', {
            fillColor: {
                gradientType: 'linear',
                rotation: 0,
                stops: [
                    { position: 0, color: '#4796E3' },
                    { position: 0.5, color: '#9177C7' },
                    { position: 1, color: '#CA6673' },
                ],
            },
        });
        // 2. Dynamic Radius.
        this.dynamicPanel2 = this.createPanelWithLabel(dynamicRow, 'Corner Radius', {
            cornerRadius: 0,
            fillColor: '#1a1a1a',
            strokeWidth: 4,
            strokeColor: '#4796E3',
        });
        // 3. Dynamic Inner Shadow.
        this.dynamicPanel3 = this.createPanelWithLabel(dynamicRow, 'Inner Shadow Blur', {
            fillColor: '#1a1a1a',
            innerShadowColor: '#4796E3',
            innerShadowBlur: 0,
        });
        // 4. Dynamic Drop Shadow Position.
        this.dynamicPanel4 = this.createPanelWithLabel(dynamicRow, 'Drop Shadow Position', {
            fillColor: '#1a1a1a',
            dropShadowColor: '#4796E3',
            dropShadowBlur: 10,
            dropShadowPosition: [0, 0],
        });
        // 5. Dynamic Stroke Gradient Base.
        this.dynamicPanel5 = this.createPanelWithLabel(dynamicRow, 'Angular Gradient Stroke Rot', {
            cornerRadius: 50,
            fillColor: '#1a1a1a',
            strokeWidth: 6,
            strokeColor: {
                gradientType: 'angular',
                rotation: 0,
                stops: [
                    { position: 0, color: '#4796E3' },
                    { position: 0.5, color: '#9177C7' },
                    { position: 1, color: '#CA6673' },
                ],
            },
        });
        // Define the update loop for each dynamic panel.
        // 1. Gradient Fill Rotation.
        this.dynamicPanel1.onUpdate = () => {
            const time = performance.now() / 1000;
            const rot = (time * 50) % 360;
            this.dynamicPanel1.setFillColor({
                gradientType: 'linear',
                rotation: rot,
                stops: [
                    { position: 0, color: '#4796E3' },
                    { position: 0.5, color: '#9177C7' },
                    { position: 1, color: '#CA6673' },
                ],
            });
        };
        // 2. Corner Radius.
        this.dynamicPanel2.onUpdate = () => {
            const time = performance.now() / 1000;
            const radius = 25 + Math.sin(time * 2) * 25;
            this.dynamicPanel2.setCornerRadius(radius);
        };
        // 3. Inner Shadow Blur.
        this.dynamicPanel3.onUpdate = () => {
            const time = performance.now() / 1000;
            const blur = 20 + Math.sin(time * 3) * 20;
            this.dynamicPanel3.setInnerShadowBlur(blur);
        };
        // 4. Drop Shadow Position.
        this.dynamicPanel4.onUpdate = () => {
            const time = performance.now() / 1000;
            const x = Math.cos(time * 2) * 10;
            const y = Math.sin(time * 2) * 10;
            this.dynamicPanel4.setDropShadowPosition(new THREE.Vector2(x, y));
        };
        // 5. Stroke Rotation.
        this.dynamicPanel5.onUpdate = () => {
            const time = performance.now() / 1000;
            const rot = (time * 100) % 360;
            this.dynamicPanel5.setStrokeColor({
                gradientType: 'angular',
                rotation: rot,
                stops: [
                    { position: 0, color: '#4796E3' },
                    { position: 0.5, color: '#9177C7' },
                    { position: 1, color: '#CA6673' },
                ],
            });
        };
    }
}
Sample.run(PanelSample);
