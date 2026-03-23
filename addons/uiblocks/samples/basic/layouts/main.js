import * as THREE from 'three';
import { UIPanel, UIText } from 'uiblocks';
import 'xrblocks/addons/simulator/SimulatorAddons.js';
import { Sample } from '../../Sample.js';
import '@pmndrs/uikit';
import 'xrblocks';

/**
 * LayoutSample.
 *
 * Demonstrates standard Flexbox layout properties including Direction,
 * JustifyContent, AlignItems, and Advanced Flex sizing.
 */
class LayoutSample extends Sample {
    /**
     * Constructs a new LayoutSample.
     */
    constructor() {
        super();
    }
    /**
     * Helper function to create a flex container.
     */
    createFlexContainer(parent, title, props = {}) {
        const wrapper = new UIPanel({
            flexDirection: 'column',
            alignItems: 'stretch',
            gap: 5,
        });
        parent.add(wrapper);
        const titleText = new UIText(title, {
            color: 'white',
            fontSize: 14,
        });
        wrapper.add(titleText);
        const container = new UIPanel({
            flexDirection: 'row',
            fillColor: '#1a1a1a',
            cornerRadius: 8,
            padding: 10,
            gap: 10,
            height: 60,
            alignItems: 'center',
            ...props,
        });
        wrapper.add(container);
        return container;
    }
    /**
     * Helper function to create a box.
     */
    createBox(parent, label, color = '#4796e3', props = {}) {
        const box = new UIPanel({
            width: 40,
            height: 40,
            fillColor: color,
            cornerRadius: 8,
            justifyContent: 'center',
            alignItems: 'center',
            ...props,
        });
        parent.add(box);
        const text = new UIText(label, {
            color: 'white',
            fontSize: 14,
        });
        box.add(text);
        return box;
    }
    /**
     * Create different layouts for the UIPanel.
     */
    createUI() {
        const card = this.uiCore.createCard({
            name: 'Card_Flex',
            sizeX: 1.5,
            sizeY: 1.3,
            position: new THREE.Vector3(0, 1.5, -1.2),
            flexDirection: 'column',
            justifyContent: 'flex-start',
            alignItems: 'stretch',
            gap: 30,
        });
        // 1. Flex Direction.
        const dirSection = this.createSectionWithTitle(card, 'Flex Direction', '100%', 'auto', 'column');
        // Row.
        const rowContainer = this.createFlexContainer(dirSection, 'Row', {
            flexDirection: 'row',
            height: 50,
        });
        this.createBox(rowContainer, '1');
        this.createBox(rowContainer, '2');
        this.createBox(rowContainer, '3');
        // Column.
        const colContainer = this.createFlexContainer(dirSection, 'Column', {
            flexDirection: 'column',
            height: 160,
            width: 60,
            alignItems: 'center',
        });
        this.createBox(colContainer, '1');
        this.createBox(colContainer, '2');
        this.createBox(colContainer, '3');
        // 2. Justify Content.
        const justifySection = this.createSectionWithTitle(card, 'Justify Content', '100%', 'auto', 'column');
        // Flex Start.
        const startContainer = this.createFlexContainer(justifySection, 'Flex Start', {
            justifyContent: 'flex-start',
        });
        this.createBox(startContainer, '1');
        this.createBox(startContainer, '2');
        this.createBox(startContainer, '3');
        // Center.
        const centerContainer = this.createFlexContainer(justifySection, 'Center', {
            justifyContent: 'center',
        });
        this.createBox(centerContainer, '1');
        this.createBox(centerContainer, '2');
        this.createBox(centerContainer, '3');
        // Space Between.
        const spaceBetweenContainer = this.createFlexContainer(justifySection, 'Space Between', {
            justifyContent: 'space-between',
        });
        this.createBox(spaceBetweenContainer, '1');
        this.createBox(spaceBetweenContainer, '2');
        this.createBox(spaceBetweenContainer, '3');
        // 3. Align Items (in 80px height).
        const alignSection = this.createSectionWithTitle(card, 'Align Items (in 80px height)', '100%', 'auto', 'column');
        // Center.
        const alignCenter = this.createFlexContainer(alignSection, 'Center', {
            height: 80,
            alignItems: 'center',
        });
        this.createBox(alignCenter, '1');
        this.createBox(alignCenter, '2', '#9177c7', { height: 60 });
        this.createBox(alignCenter, '3');
        // Flex End.
        const alignEnd = this.createFlexContainer(alignSection, 'Flex End', {
            height: 80,
            alignItems: 'flex-end',
        });
        this.createBox(alignEnd, '1');
        this.createBox(alignEnd, '2', '#9177c7', { height: 60 });
        this.createBox(alignEnd, '3');
        // Stretch.
        const alignStretch = this.createFlexContainer(alignSection, 'Stretch', {
            height: 100,
            alignItems: 'stretch',
        });
        this.createBox(alignStretch, '1', '#4796e3', { height: undefined });
        this.createBox(alignStretch, '2', '#9177c7', { height: undefined });
        this.createBox(alignStretch, '3', '#4796e3', { height: undefined });
        // 4. Advanced Flex (Grow, Shrink, Basis).
        const advancedSection = this.createSectionWithTitle(card, 'Advanced Flex', '100%', 'auto', 'column');
        // Flex Grow.
        const growContainer = this.createFlexContainer(advancedSection, 'Flex Grow', {
            gap: 10,
        });
        this.createBox(growContainer, '1', '#4796e3', {
            flexGrow: 1,
            width: undefined,
        });
        this.createBox(growContainer, '2 (Grow 2)', '#9177c7', {
            flexGrow: 2,
            width: undefined,
        });
        this.createBox(growContainer, '1', '#4796e3', {
            flexGrow: 1,
            width: undefined,
        });
        // Flex Basis.
        const basisContainer = this.createFlexContainer(advancedSection, 'Flex Basis', {
            gap: 10,
        });
        this.createBox(basisContainer, 'Basis 20%', '#4796e3', { width: '20%' });
        this.createBox(basisContainer, 'Basis 100px', '#9177c7', { width: 100 });
        this.createBox(basisContainer, 'Auto', '#4796e3', { flexGrow: 1 });
    }
}
Sample.run(LayoutSample);
