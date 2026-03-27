import { contentDefaults, Container, Image, abortableEffect, Text } from '@pmndrs/uikit';
import { computed } from '@preact/signals-core';
import { ActionButton } from './ActionButton.js';
import { CardActionButton } from './CardActionButton.js';
import { CardTitleChip } from './CardTitleChip.js';
import './HighlightMaterial.js';
import 'three';
import './MaterialSymbolsIcon.js';
import './utils.js';
import './BoxShadow.js';

const cardDefaults = {
    titleChip: undefined,
    title: undefined,
    subtitle: undefined,
    body: undefined,
    imageSrc: undefined,
    entityIcon: undefined,
    actionButton: undefined,
    trailingEntityIcon: false,
    buttons: [],
    ...contentDefaults,
};
class Card extends Container {
    constructor(properties) {
        super({
            ...properties,
            flexDirection: 'column',
            justifyContent: 'flex-end',
            width: '100%',
        }, undefined, { defaults: cardDefaults });
        const titleChip = new CardTitleChip({
            text: computed(() => this.properties.signal.titleChip.value ?? ''),
            display: computed(() => this.properties.signal.titleChip.value ? undefined : 'none'),
            marginBottom: 12,
            height: 56,
        });
        this.add(titleChip);
        const borderWidth = 3;
        const cardContainer = new Container({
            flexDirection: 'column',
            borderWidth: borderWidth,
            borderRadius: 40,
            borderColor: 0x606460,
            // For some reason uikit counts padding from the end of the border.
            padding: 16 - borderWidth,
            flexGrow: computed(() => (this.properties.signal.imageSrc.value ? 1 : 0)),
            minHeight: 80,
            backgroundColor: 'black',
        });
        this.add(cardContainer);
        const image = new Image({
            src: this.properties.signal.imageSrc,
            objectFit: 'cover',
            width: '100%',
            borderRadius: 24,
            keepAspectRatio: false,
            flexGrow: computed(() => (this.properties.signal.imageSrc.value ? 1 : 0)),
            display: computed(() => this.properties.signal.imageSrc.value ? undefined : 'none'),
        });
        cardContainer.add(image);
        const contentArea = new Container({
            flexDirection: computed(() => this.properties.signal.trailingEntityIcon.value ? 'row-reverse' : 'row'),
            padding: 8,
            gap: 12,
        });
        contentArea.name = 'Card Content Area';
        cardContainer.add(contentArea);
        const cardEntityIcon = new Image({
            src: this.properties.signal.entityIcon,
            width: 56,
            height: 56,
            display: computed(() => this.properties.signal.entityIcon.value !== undefined
                ? undefined
                : 'none'),
        });
        contentArea.add(cardEntityIcon);
        const actionArea = new Container({ flexDirection: 'column', gap: 12 });
        cardContainer.add(actionArea);
        abortableEffect(() => {
            const buttons = [];
            for (const button of this.properties.signal.buttons.value) {
                const actionButton = new ActionButton({
                    text: button.text,
                    icon: button.icon,
                    width: '100%',
                });
                buttons.push(actionButton);
                actionArea.add(actionButton);
            }
            return () => {
                actionArea.remove(...buttons);
                for (const button of buttons) {
                    button.dispose();
                }
            };
        }, this.abortSignal);
        const textArea = new Container({
            flexDirection: 'column',
            flexGrow: 1,
            gap: 3,
        });
        contentArea.add(textArea);
        const titleText = new Text({
            text: computed(() => this.properties.signal.title.value ?? ''),
            fontSize: 24,
            lineHeight: '32px',
            fontWeight: 600,
            color: 'white',
            letterSpacing: 1.26,
            display: computed(() => this.properties.signal.title.value !== undefined ? undefined : 'none'),
            flexGrow: 1,
            whiteSpace: 'pre',
        });
        textArea.add(titleText);
        const subtitleText = new Text({
            text: computed(() => this.properties.signal.subtitle.value ?? ''),
            fontSize: 18,
            lineHeight: '32px',
            fontWeight: 600,
            color: 'white',
            letterSpacing: 1.26,
            display: computed(() => this.properties.signal.subtitle.value !== undefined ? undefined : 'none'),
            flexGrow: 1,
            whiteSpace: 'pre',
        });
        textArea.add(subtitleText);
        const bodyText = new Text({
            text: computed(() => this.properties.signal.body.value ?? ''),
            fontSize: 20,
            lineHeight: '32px',
            fontWeight: 600,
            color: 'white',
            letterSpacing: 1.26,
            display: computed(() => this.properties.signal.body.value !== undefined ? undefined : 'none'),
            flexGrow: 1,
            whiteSpace: 'pre',
        });
        textArea.add(bodyText);
        const actionButtonWrapper = new Container();
        this.add(actionButtonWrapper);
        abortableEffect(() => {
            const actionButtonValue = this.properties.signal.actionButton.value;
            if (actionButtonValue) {
                const actionButton = new CardActionButton({
                    text: actionButtonValue.text,
                    icon: actionButtonValue.icon,
                    iconStyle: 'rounded',
                    iconWeight: 600,
                });
                actionButtonWrapper.add(actionButton);
                return () => {
                    actionButtonWrapper.remove(actionButton);
                };
            }
        }, this.abortSignal);
    }
}

export { Card, cardDefaults };
