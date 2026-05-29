import {
  BaseOutProperties,
  Container,
  InProperties,
  RenderContext,
  WithSignal,
} from '@pmndrs/uikit';
import {TextWithEmoji} from '../../uiblocks/src/core/primitives/TextWithEmoji';
import {computed} from '@preact/signals-core';

import {HighlightMaterial} from './HighlightMaterial';
import {MaterialSymbolsIcon} from './MaterialSymbolsIcon';

export type ActionButtonOutProperties = {
  text: string;
  icon?: string;
  iconStyle?: string;
  iconWeight?: number;
} & BaseOutProperties;

export class ActionButton<
  OutProperties extends ActionButtonOutProperties = ActionButtonOutProperties,
> extends Container<OutProperties> {
  name = 'Action Button';
  constructor(
    inputProperties?: InProperties<OutProperties>,
    initialClasses?: Array<InProperties<BaseOutProperties> | string>,
    config?: {
      renderContext?: RenderContext;
      defaultOverrides?: InProperties<OutProperties>;
      defaults?: WithSignal<OutProperties>;
    }
  ) {
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
      } as InProperties<OutProperties>,
      ...config,
    });

    const icon = new MaterialSymbolsIcon({
      icon: this.properties.signal.icon,
      iconStyle: this.properties.signal.iconStyle,
      iconWeight: this.properties.signal.iconWeight,
      width: 40,
      color: 0xa8c7fa,
      display: computed(() =>
        this.properties.signal.icon ? 'initial' : 'none'
      ),
    });
    this.add(icon);

    const text = new TextWithEmoji({
      text: this.properties.signal.text,
      fontSize: 24,
      color: 'white',
      fontWeight: 600,
      letterSpacing: 1.26,
    });
    this.add(text);
  }
}
