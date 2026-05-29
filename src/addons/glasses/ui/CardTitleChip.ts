import {
  BaseOutProperties,
  Container,
  InProperties,
  RenderContext,
  WithSignal,
} from '@pmndrs/uikit';
import {TextWithEmoji} from '../../uiblocks/src/core/primitives/TextWithEmoji';

export type CardTitleChipOutProperties = BaseOutProperties & {
  text: string;
};

export class CardTitleChip<
  OutProperties extends CardTitleChipOutProperties,
> extends Container<OutProperties> {
  name = 'Card Title Chip';

  constructor(
    properties?: InProperties<OutProperties>,
    initialClasses?: Array<InProperties<OutProperties> | string>,
    config?: {
      renderContext?: RenderContext;
      defaultOverrides?: OutProperties;
      defaults?: WithSignal<OutProperties>;
    }
  ) {
    super(properties, initialClasses, {
      defaultOverrides: {
        paddingX: 16,
        paddingY: 8,
        borderWidth: 2,
        borderRadius: 100,
        borderColor: 0x606460,
        width: 'auto',
        marginX: 'auto',
        ...config?.defaultOverrides,
      } as InProperties<OutProperties>,
      ...config,
    });
    const text = new TextWithEmoji({
      text: this.properties.signal.text,
      fontSize: 24,
      color: 'white',
      fontWeight: 750,
      letterSpacing: 1.26,
    });
    text.name = 'Card Title Chip Text';
    this.add(text);
  }
}
