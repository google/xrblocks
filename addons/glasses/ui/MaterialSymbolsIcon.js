import { Svg } from '@pmndrs/uikit';
import { computed } from '@preact/signals-core';
import { extractValue } from './utils.js';

const SVG_BASE_PATH = 'https://cdn.jsdelivr.net/gh/marella/material-symbols@v0.33.0/svg/{{weight}}/{{style}}/{{icon}}.svg';
class MaterialSymbolsIcon extends Svg {
    constructor(properties, initialClasses, config) {
        const icon = properties?.icon ?? config?.defaultOverrides?.icon;
        const iconStyle = properties?.iconStyle ?? config?.defaultOverrides?.iconStyle;
        const iconWeight = properties?.iconWeight ?? config?.defaultOverrides?.iconWeight;
        const svgPath = computed(() => {
            const finalIcon = extractValue(icon) ?? 'question_mark';
            const finalStyle = extractValue(iconStyle) ?? 'outlined';
            const finalWeight = extractValue(iconWeight) ?? 400;
            return SVG_BASE_PATH.replace('{{style}}', finalStyle)
                .replace('{{icon}}', finalIcon)
                .replace('{{weight}}', String(finalWeight));
        });
        super(properties, initialClasses, {
            ...config,
            defaultOverrides: {
                src: svgPath,
                ...config?.defaultOverrides,
            },
        });
        this.name = 'Material Symbols Icon';
    }
}

export { MaterialSymbolsIcon };
