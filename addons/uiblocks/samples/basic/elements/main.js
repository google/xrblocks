import * as THREE from 'three';
import { UIPanel, UIText, UIImage, UIIcon } from 'uiblocks';
import 'xrblocks/addons/simulator/SimulatorAddons.js';
import { Sample } from '../../Sample.js';
import '@pmndrs/uikit';
import 'xrblocks';

/**
 * ElementSample.
 *
 * Demonstrates various standard layouts and configurations demonstrating continuous reactivity loops.
 * Shows text scaling, image transparency masking overrides, and material systems toggling.
 */
class ElementSample extends Sample {
    /**
     * Constructs a new ElementSample.
     */
    constructor() {
        super();
    }
    /**
     * Helper function to wrap a generic UI element (Text, Image, Icon) inside a styled
     * container panel with an accompanying descriptive text label.
     */
    createElementWithLabel(parent, label, item, width, height) {
        const container = new UIPanel({
            flexDirection: 'column',
            justifyContent: 'space-between',
            alignItems: 'center',
            gap: 10,
            padding: 10,
            ...(width !== undefined && { width }),
            ...(height !== undefined && { height }),
        });
        parent.add(container);
        const itemBox = new UIPanel({
            flexGrow: 1,
            width: '100%',
            justifyContent: 'center',
            alignItems: 'center',
        });
        container.add(itemBox);
        itemBox.add(item);
        const l = new UIText(label, {
            color: 'white',
            fontSize: 16,
            textAlign: 'center',
        });
        container.add(l);
    }
    /**
     * Create static and dynamic UI elements with different configurations.
     */
    createUI() {
        // Card 1: Static Elements.
        const card1 = this.uiCore.createCard({
            name: 'Card_StaticElements',
            sizeX: 0.8,
            sizeY: 1.0,
            position: new THREE.Vector3(0, 1.7, -1),
            behaviors: [],
            flexDirection: 'column',
            justifyContent: 'flex-start',
            alignItems: 'stretch',
            gap: 30,
        });
        // Row 1: Texts.
        const textRow = this.createSectionWithTitle(card1, 'Static Texts');
        this.createElementWithLabel(textRow, 'Default', new UIText('Text', {
            color: 'white',
            fontSize: 24,
            textAlign: 'center',
        }));
        this.createElementWithLabel(textRow, 'Size', new UIText('Text', {
            color: 'white',
            fontSize: 48,
            textAlign: 'center',
        }));
        this.createElementWithLabel(textRow, 'Color', new UIText('Text', {
            color: '#4796e3',
            fontSize: 24,
            textAlign: 'center',
        }));
        this.createElementWithLabel(textRow, 'Weight', new UIText('Text', {
            color: 'white',
            fontSize: 24,
            fontWeight: 'bold',
            textAlign: 'center',
        }));
        // Row 2: Images.
        const imageRow = this.createSectionWithTitle(card1, 'Static Images');
        this.createElementWithLabel(imageRow, 'Default', new UIImage('https://picsum.photos/id/237/100/100', {
            width: 80,
            height: 80,
            color: 'white',
            opacity: 1,
        }));
        this.createElementWithLabel(imageRow, 'Size', new UIImage('https://picsum.photos/id/1084/200/200', {
            width: 120,
            height: 120,
        }));
        this.createElementWithLabel(imageRow, 'Color', new UIImage('https://picsum.photos/id/10/160/160', {
            width: 80,
            height: 80,
            color: '#4796e3',
            opacity: 1,
        }));
        this.createElementWithLabel(imageRow, 'Opacity', new UIImage('https://picsum.photos/id/11/160/160', {
            width: 80,
            height: 80,
            color: 'white',
            opacity: 0.2,
        }));
        this.createElementWithLabel(imageRow, 'Rounded Corners', new UIImage('https://picsum.photos/id/100/160/160', {
            width: 80,
            height: 80,
            borderRadius: 20,
        }));
        // Row 3: Icons.
        const iconRow = this.createSectionWithTitle(card1, 'Static Icons');
        this.createElementWithLabel(iconRow, 'Default', new UIIcon('favorite', {
            width: 32,
            height: 32,
            color: 'white',
        }));
        this.createElementWithLabel(iconRow, 'Size', new UIIcon('favorite', {
            width: 48,
            height: 48,
            color: 'white',
        }));
        this.createElementWithLabel(iconRow, 'Color', new UIIcon('favorite', {
            width: 32,
            height: 32,
            color: '#4796e3',
        }));
        this.createElementWithLabel(iconRow, 'Weight', new UIIcon('favorite', {
            iconWeight: 700,
            width: 32,
            height: 32,
            color: 'white',
        }));
        this.createElementWithLabel(iconRow, 'Style', new UIIcon('favorite', {
            iconStyle: 'rounded',
            width: 32,
            height: 32,
            color: 'white',
        }));
        this.createElementWithLabel(iconRow, 'Filled', new UIIcon('favorite', {
            iconFill: 1,
            width: 32,
            height: 32,
            color: 'white',
        }));
        // Card 2: Dynamic Elements.
        const card2 = this.uiCore.createCard({
            name: 'Card_DynamicElements',
            sizeX: 0.8,
            sizeY: 1.0,
            position: new THREE.Vector3(0.0, 1.0, -1),
            behaviors: [],
            flexDirection: 'column',
            justifyContent: 'flex-start',
            alignItems: 'stretch',
            gap: 30,
        });
        // Texts.
        const textUpdateRow = this.createSectionWithTitle(card2, 'Dynamic Texts');
        this.dynamicText1 = new UIText('Text: 0', {
            color: 'white',
            fontSize: 20,
            textAlign: 'center',
        });
        this.createElementWithLabel(textUpdateRow, 'Text', this.dynamicText1, 120, 100);
        this.dynamicText2 = new UIText('Text', {
            color: 'white',
            fontSize: 24,
            textAlign: 'center',
        });
        this.createElementWithLabel(textUpdateRow, 'Size', this.dynamicText2, 120, 100);
        this.dynamicText3 = new UIText('Text', {
            color: 'white',
            fontSize: 24,
            textAlign: 'center',
        });
        this.createElementWithLabel(textUpdateRow, 'Color', this.dynamicText3);
        // Images.
        const imageUpdateRow = this.createSectionWithTitle(card2, 'Dynamic Images');
        this.dynamicImage1 = new UIImage('https://picsum.photos/id/10/100/100', {
            width: 80,
            height: 80,
        });
        this.createElementWithLabel(imageUpdateRow, 'Source', this.dynamicImage1);
        this.dynamicImage2 = new UIImage('https://picsum.photos/id/10/100/100', {
            width: 80,
            height: 80,
        });
        this.createElementWithLabel(imageUpdateRow, 'Size', this.dynamicImage2, 120, 150);
        this.dynamicImage3 = new UIImage('https://picsum.photos/id/10/100/100', {
            width: 80,
            height: 80,
        });
        this.createElementWithLabel(imageUpdateRow, 'Color', this.dynamicImage3);
        this.dynamicImage4 = new UIImage('https://picsum.photos/id/10/100/100', {
            width: 80,
            height: 80,
            color: 'white',
        });
        this.createElementWithLabel(imageUpdateRow, 'Opacity', this.dynamicImage4);
        this.dynamicImage5 = new UIImage('https://picsum.photos/id/100/100/100', {
            width: 80,
            height: 80,
            borderRadius: 0,
        });
        this.createElementWithLabel(imageUpdateRow, 'Rounded Corners', this.dynamicImage5);
        // Icons.
        const iconUpdateRow = this.createSectionWithTitle(card2, 'Dynamic Icons');
        this.dynamicIcon1 = new UIIcon('favorite', {
            width: 32,
            height: 32,
            color: 'white',
        });
        this.createElementWithLabel(iconUpdateRow, 'Source', this.dynamicIcon1);
        this.dynamicIcon2 = new UIIcon('favorite', {
            width: 32,
            height: 32,
            color: 'white',
        });
        this.createElementWithLabel(iconUpdateRow, 'Size', this.dynamicIcon2, 120, 100);
        this.dynamicIcon3 = new UIIcon('favorite', {
            width: 32,
            height: 32,
            color: 'white',
        });
        this.createElementWithLabel(iconUpdateRow, 'Color', this.dynamicIcon3);
        this.dynamicIcon4 = new UIIcon('settings', {
            width: 32,
            height: 32,
            color: 'white',
            iconWeight: 400,
        });
        this.createElementWithLabel(iconUpdateRow, 'Weight', this.dynamicIcon4);
        // Helper function to loop colors.
        const loopColor = (speed = 1.0) => {
            const colors = ['#4796e3', '#9177c7', '#ca6673'];
            const time = performance.now() / 1000;
            const t = (time * speed) % colors.length;
            const idx1 = Math.floor(t);
            const idx2 = (idx1 + 1) % colors.length;
            const frac = t - idx1;
            const color = new THREE.Color(colors[idx1]).lerp(new THREE.Color(colors[idx2]), frac);
            return '#' + color.getHexString();
        };
        // Text Content.
        let lastCount = -1;
        this.dynamicText1.onUpdate = () => {
            const time = performance.now() / 1000;
            const count = Math.floor(time * 10) % 50;
            if (count !== lastCount) {
                lastCount = count;
                this.dynamicText1.setText(`Text: ${count}`);
            }
        };
        // Text Size.
        this.dynamicText2.onUpdate = () => {
            const time = performance.now() / 1000;
            const size = 24 + Math.sin(time * 5) * 4;
            this.dynamicText2.setFontSize(size);
        };
        // Text Color.
        this.dynamicText3.onUpdate = () => {
            this.dynamicText3.setColor(loopColor());
        };
        // Image Source.
        let lastImageIndex = -1;
        this.dynamicImage1.onUpdate = () => {
            const time = performance.now() / 1000;
            // Swap image every 1 second.
            const index = Math.floor(time) % 3;
            if (index !== lastImageIndex) {
                lastImageIndex = index;
                const images = [
                    'https://picsum.photos/id/10/100/100',
                    'https://picsum.photos/id/11/100/100',
                    'https://picsum.photos/id/12/100/100',
                ];
                this.dynamicImage1.setSrc(images[index]);
            }
        };
        // Image Size.
        this.dynamicImage2.onUpdate = () => {
            // Loop size from 40 to 120.
            const size = 80 + Math.sin(Date.now() / 500) * 40;
            this.dynamicImage2.setProperties({ width: size, height: size });
        };
        // Image Color.
        this.dynamicImage3.onUpdate = () => {
            this.dynamicImage3.setColor(loopColor());
        };
        // Image Opacity.
        this.dynamicImage4.onUpdate = () => {
            const time = performance.now() / 1000;
            const opacity = 0.5 + Math.sin(time * 3) * 0.4;
            this.dynamicImage4.setOpacity(opacity);
        };
        // Image Border Radius.
        this.dynamicImage5.onUpdate = () => {
            const time = performance.now() / 1000;
            const radius = 25 + Math.sin(time * 4) * 25; // 0 to 50
            this.dynamicImage5.setBorderRadius(radius);
        };
        // Icon Source.
        let lastIconIndex = -1;
        this.dynamicIcon1.onUpdate = () => {
            const time = performance.now() / 1000;
            // Swap icon every 1 second.
            const index = Math.floor(time) % 3;
            if (index !== lastIconIndex) {
                lastIconIndex = index;
                const icons = ['favorite', 'star', 'home'];
                this.dynamicIcon1.setIcon(icons[index]);
            }
        };
        // Icon Size.
        this.dynamicIcon2.onUpdate = () => {
            const time = performance.now() / 1000;
            const size = 32 + Math.sin(time * 4) * 8;
            this.dynamicIcon2.setProperties({ width: size, height: size });
        };
        // Icon Color.
        this.dynamicIcon3.onUpdate = () => {
            this.dynamicIcon3.setColor(loopColor());
        };
        // Icon Weight.
        let lastWeight = -1;
        this.dynamicIcon4.onUpdate = () => {
            const time = performance.now() / 1000;
            // Oscillate weight between 100 and 700 (discrete steps).
            // sin varies from -1 to 1.
            // mapped to 0 to 6 (index for 100 to 700).
            const t = (Math.sin(time * 3) + 1) / 2; // 0 to 1.
            const step = Math.round(t * 6); // 0 to 6.
            const weight = 100 + step * 100;
            if (weight !== lastWeight) {
                lastWeight = weight;
                this.dynamicIcon4.setIconWeight(weight);
            }
        };
    }
}
Sample.run(ElementSample);
