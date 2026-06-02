import { Container } from '@pmndrs/uikit';
import { computed } from '@preact/signals-core';
import { HighlightMaterial } from './HighlightMaterial.js';
import { MaterialSymbolsIcon } from './MaterialSymbolsIcon.js';
import { TextWithEmoji } from '../../uiblocks/src/core/primitives/TextWithEmoji.js';
import 'three';
import './utils.js';

/** A reusable action button component with icon and text support. */
class ActionButton extends Container {
    constructor(inputProperties, initialClasses, config) {
        super(inputProperties, initialClasses, {
            defaultOverrides: {
                width: 'auto',
                marginX: 'auto',
                height: 56,
                minWidth: 56,
                borderWidth: 4,
                borderRadius: 100,
                borderColor: 0x858885,
                paddingBottom: 8,
                paddingTop: 8,
                paddingLeft: 16,
                paddingRight: 16,
                justifyContent: 'center',
                alignItems: 'center',
                gapColumn: 8,
                positionType: 'relative',
                panelMaterialClass: HighlightMaterial,
                ...config?.defaultOverrides,
            },
            ...config,
        });
        this.name = 'Action Button';
        const iconContainer = new Container({});
        this.add(iconContainer);
        const icon = new MaterialSymbolsIcon({
            icon: this.properties.signal.icon,
            iconStyle: this.properties.signal.iconStyle,
            iconWeight: this.properties.signal.iconWeight,
            height: 40,
            color: 0xa8c7fa,
            display: computed(() => this.properties.signal.icon ? 'initial' : 'none'),
            alignSelf: 'center',
        });
        iconContainer.add(icon);
        const text = new TextWithEmoji({
            text: this.properties.signal.text,
            fontSize: 24,
            color: 'white',
            fontWeight: 600,
            letterSpacing: 1.26,
            wordBreak: 'keep-all',
        });
        this.add(text);
    }
}

export { ActionButton };
