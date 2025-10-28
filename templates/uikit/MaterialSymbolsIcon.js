import {Svg} from '@pmndrs/uikit';
import {computed} from '@preact/signals-core';

const SVG_BASE_PATH =
  'https://cdn.jsdelivr.net/gh/marella/material-symbols@v0.38.0/svg/{{weight}}/{{style}}/{{icon}}.svg';

export class MaterialSymbolsIcon extends Svg {
  name = 'Material Symbols Icon';
  constructor(properties, initialClasses, config) {
    const icon = properties?.icon ?? config?.defaultOverrides?.icon;
    const iconStyle =
      properties?.iconStyle ?? config?.defaultOverrides?.iconStyle;
    const iconWeight =
      properties?.iconWeight ?? config?.defaultOverrides?.iconWeight;

    const svgPath = computed(() => {
      const finalIcon = icon?.value ?? icon ?? 'question_mark';
      const finalStyle = iconStyle?.value ?? iconStyle ?? 'outlined';
      const finalWeight = iconWeight?.value ?? iconWeight ?? 400;

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
  }
}
