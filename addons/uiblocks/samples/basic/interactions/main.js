import * as THREE from 'three';
import { UIPanel, UIIcon, UIText, ToggleAnimationBehavior } from 'uiblocks';
import 'xrblocks/addons/simulator/SimulatorAddons.js';
import { Sample } from '../../Sample.js';
import '@pmndrs/uikit';
import 'xrblocks';

/**
 * InteractionSample.
 *
 * Demonstrates standard interactive component states (hover, click effects) and layout
 * setups using Expandable headers adapting dynamically.
 */
class InteractionSample extends Sample {
    /**
     * Constructs a new InteractionSample.
     */
    constructor() {
        super();
    }
    /**
     * Helper to create an interactive button with label and description.
     */
    createLabeledButton(iconName, labelObj, desc, type = 'fill') {
        // Interaction logic.
        let isHovered = false;
        let isAnimating = false;
        let startTime = 0;
        const duration = 1.0;
        // Define gradients based on target.
        let gradient;
        if (type === 'stroke') {
            gradient = {
                gradientType: 'angular',
                rotation: 0,
                stops: [
                    { position: 0, color: '#4796E3' },
                    { position: 0.5, color: '#9177C7' },
                    { position: 1, color: '#CA6673' },
                ],
            };
        }
        const button = new UIPanel({
            width: 100,
            height: 100,
            cornerRadius: 20,
            fillColor: '#444444',
            justifyContent: 'center',
            alignItems: 'center',
            strokeWidth: 4,
            strokeColor: type === 'stroke' ? gradient : '#00000000',
            onHoverEnter: () => {
                isHovered = true;
                if (type === 'fill') {
                    button.setFillColor('#666666');
                }
                else if (type === 'stroke') {
                    if (!isAnimating) {
                        isAnimating = true;
                        startTime = performance.now() / 1000;
                    }
                    button.setFillColor('#555555');
                }
            },
            onHoverExit: () => {
                isHovered = false;
                button.setFillColor('#444444');
            },
            onClick: () => {
                console.log('onClick');
                if (type !== 'fill')
                    return;
                const flashGradient = {
                    gradientType: 'linear',
                    rotation: 90,
                    stops: [
                        { position: 0, color: '#4796E3' },
                        { position: 0.5, color: '#9177C7' },
                        { position: 1, color: '#CA6673' },
                    ],
                };
                button.setFillColor(flashGradient);
                setTimeout(() => {
                    if (isHovered)
                        button.setFillColor('#666666');
                    else
                        button.setFillColor('#444444');
                }, 200);
            },
        });
        const wrapperPanel = new UIPanel({
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 10,
            gap: 20,
            fillColor: 'rgba(0,0,0,0)',
        });
        wrapperPanel.add(button);
        const icon = new UIIcon(iconName, {
            color: 'white',
            width: 48,
            height: 48,
        });
        button.add(icon);
        const label = new UIText(labelObj, {
            color: 'white',
            fontSize: 20,
            fontWeight: 'bold',
            textAlign: 'center',
        });
        wrapperPanel.add(label);
        const description = new UIText(desc, {
            color: 'white',
            fontSize: 14,
            textAlign: 'center',
            maxWidth: 160,
        });
        wrapperPanel.add(description);
        if (type !== 'fill') {
            button.onUpdate = () => {
                if (!isAnimating || !gradient)
                    return;
                const now = performance.now() / 1000;
                const elapsed = now - startTime;
                if (elapsed >= duration) {
                    isAnimating = false;
                    const finalProp = { ...gradient, rotation: 0 };
                    button.setProperties({ strokeColor: finalProp });
                }
                else {
                    const progress = elapsed / duration;
                    const rot = progress * 360;
                    const animProp = { ...gradient, rotation: rot };
                    button.setProperties({ strokeColor: animProp });
                }
            };
        }
        return wrapperPanel;
    }
    /**
     * Create interactive UI elements.
     */
    createUI() {
        // Card 1: Basic interactions.
        const card = this.uiCore.createCard({
            name: 'Card_Interaction',
            position: new THREE.Vector3(0, 1.5, -0.8),
            sizeX: 0.6,
            sizeY: 0.3,
            flexDirection: 'column',
            justifyContent: 'center',
            alignItems: 'stretch',
            gap: 30,
        });
        const container = this.createSectionWithTitle(card, 'Hover/Click Callback', '100%', 'auto', 'column');
        // Two buttons.
        const buttonRow = new UIPanel({
            flexDirection: 'row',
            gap: 40,
            justifyContent: 'center',
            alignItems: 'center',
        });
        container.add(buttonRow);
        buttonRow.add(this.createLabeledButton('thumb_up', 'Fill On Click', 'Hover changes color\n\nClick flashes gradient fill', 'fill'));
        buttonRow.add(this.createLabeledButton('refresh', 'Stroke Animation On Hover', 'Hover triggers gradient rotation', 'stroke'));
        // Card 2: Expandable card.
        const card2 = this.uiCore.createCard({
            name: 'Card_Expandable',
            position: new THREE.Vector3(0, 1.0, -0.8),
            sizeX: 0.6,
            sizeY: 0.6,
            flexDirection: 'column',
            justifyContent: 'flex-start',
            alignItems: 'stretch',
        });
        let isExpanded = false;
        // Main layout container.
        const layout = this.createSectionWithTitle(card2, 'Flexbox/Visibility Change', '100%', 'auto', 'column');
        // Header.
        const header = new UIPanel({
            height: 60,
            width: '100%',
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
            paddingLeft: 20,
            paddingRight: 20,
            fillColor: '#1a1a1a',
            cornerRadius: 20,
        });
        layout.add(header);
        const title = new UIText('More Options', {
            color: 'white',
            fontSize: 20,
            fontWeight: 'bold',
        });
        header.add(title);
        const arrowIcon = new UIIcon('keyboard_arrow_down', {
            color: 'white',
            width: 32,
            height: 32,
        });
        const arrowButton = new UIPanel({
            width: 48,
            height: 48,
            justifyContent: 'center',
            alignItems: 'center',
            onHoverEnter: () => {
                arrowIcon.setProperties({ color: 'white' });
            },
            onHoverExit: () => {
                arrowIcon.setProperties({ color: 'white' });
            },
            onClick: () => {
                isExpanded = !isExpanded;
                // Icon change.
                arrowIcon.setProperties({
                    icon: isExpanded ? 'keyboard_arrow_up' : 'keyboard_arrow_down',
                });
                // Content visibility.
                content.setProperties({
                    display: isExpanded ? 'flex' : 'none',
                });
                // Feedback (Flash icon).
                arrowIcon.setProperties({ color: '#4796E3' });
                setTimeout(() => {
                    // Return to hover state (since we are likely still hovering).
                    arrowIcon.setProperties({ color: 'white' });
                }, 150);
            },
        });
        arrowButton.add(arrowIcon);
        header.add(arrowButton);
        // Content panel (hidden by default).
        const content = new UIPanel({
            width: '100%',
            flexDirection: 'column',
            padding: 20,
            fillColor: '#1a1a1a',
            display: 'none',
            cornerRadius: 20,
        });
        layout.add(content);
        // Mock content.
        const infoText = new UIText('Here is some additional content that was hidden.\n\n' +
            'The panel height automatically adjusts to fit this text because ' +
            'we are using Flexbox layout with flexDirection column.', {
            color: 'white',
            fontSize: 16,
            lineHeight: 1.4,
        });
        content.add(infoText);
        // Card 3: Animated Toggle Card.
        const card3 = this.uiCore.createCard({
            name: 'Card_Animated_Toggle',
            position: new THREE.Vector3(0.5, 1.05, -0.8),
            sizeX: 0.3,
            sizeY: 0.3,
            flexDirection: 'column',
            justifyContent: 'center',
            alignItems: 'center',
            behaviors: [
                new ToggleAnimationBehavior({
                    showAnimation: 'scale',
                    hideAnimation: 'scale',
                    duration: 0.4,
                }),
            ],
            visible: false,
        });
        const card3Container = this.createSectionWithTitle(card3, 'Animated Toggle Behavior');
        card3Container.add(new UIText('This card scales in and out cleanly!', {
            color: 'white',
            fontSize: 14,
        }));
        // Add a button to toggle Card 3 inside the expandable content of Card 2.
        const toggleCard3Btn = new UIPanel({
            width: '100%',
            height: 48,
            marginTop: 20,
            justifyContent: 'center',
            alignItems: 'center',
            fillColor: '#444444',
            cornerRadius: 10,
            onClick: () => {
                card3.toggle();
            },
            onHoverEnter: () => toggleCard3Btn.setFillColor('#666666'),
            onHoverExit: () => toggleCard3Btn.setFillColor('#444444'),
        });
        toggleCard3Btn.add(new UIText('Toggle Another Card', { color: 'white', fontSize: 16 }));
        content.add(toggleCard3Btn);
    }
}
Sample.run(InteractionSample);
