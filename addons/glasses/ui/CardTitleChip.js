import { Container, Text } from '@pmndrs/uikit';

class CardTitleChip extends Container {
    constructor(properties, initialClasses, config) {
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
            },
            ...config,
        });
        this.name = 'Card Title Chip';
        const text = new Text({
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

export { CardTitleChip };
