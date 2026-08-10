import { Container, Text, Image } from '@pmndrs/uikit';
import { effect } from '@preact/signals-core';

const WORD_EMOJI_REGEX = /(?:\p{Emoji_Presentation}|\p{Emoji}\uFE0F)(?:\u200D(?:\p{Emoji_Presentation}|\p{Emoji}\uFE0F))*(?:\p{Emoji_Modifier})*|\n|[ \t\r]+|[a-zA-Z0-9]+|[^a-zA-Z0-9\s]/gu;
const EMOJI_REGEX = /(?:\p{Emoji_Presentation}|\p{Emoji}\uFE0F)/u;
function getEmojiHex(emoji) {
    let hex = Array.from(emoji)
        .map((character) => character.codePointAt(0).toString(16))
        .join('-');
    if (!hex.includes('200d') && hex.endsWith('-fe0f')) {
        hex = hex.slice(0, -5);
    }
    return hex;
}
function getEmojiUrl(emoji, provider) {
    const hex = getEmojiHex(emoji);
    if (provider === 'noto-emoji') {
        return `https://cdn.jsdelivr.net/gh/googlefonts/noto-emoji/svg/emoji_u${hex}.svg`;
    }
    return `https://cdnjs.cloudflare.com/ajax/libs/twemoji/14.0.2/72x72/${hex}.png`;
}
/** Renders UIKit text and full-color emoji in one wrapping layout. */
class TextWithEmoji extends Container {
    constructor(inputProperties, initialClasses, inputConfig) {
        super({
            flexDirection: 'row',
            flexWrap: 'wrap',
            alignItems: 'center',
            ...inputProperties,
        }, initialClasses, inputConfig);
        this.cleanupEffect = effect(() => {
            const currentText = (this.properties.value.text ?? '').replace(/\r\n/g, '\n');
            const currentFontSize = this.properties.value.fontSize ?? 16;
            const emojiCdn = this.properties.value.emojiCdn ?? 'twemoji';
            const emojiSize = currentFontSize * (this.properties.value.emojiSizeMultiplier ?? 1.05);
            const emojiOffsetY = this.properties.value.emojiOffsetY ?? -emojiSize * 0.08;
            const segments = this.parseSegments(currentText, currentFontSize);
            if (this.hasCompatibleChildren(segments)) {
                this.updateChildren(segments, currentFontSize, emojiCdn, emojiSize, emojiOffsetY);
            }
            else {
                this.rebuildChildren(segments, currentFontSize, emojiCdn, emojiSize, emojiOffsetY);
            }
        });
    }
    parseSegments(text, fontSize) {
        const rawSegments = text.match(WORD_EMOJI_REGEX) ?? [];
        const segments = [];
        for (let index = 0; index < rawSegments.length; index++) {
            const text = rawSegments[index];
            if (text === '\n') {
                segments.push({
                    type: 'newline',
                    text,
                    isConsecutiveNewline: index === 0 || rawSegments[index - 1] === '\n',
                });
            }
            else if (/^[ \t\r]+$/.test(text)) {
                const previous = segments[segments.length - 1];
                if (previous?.type === 'word' || previous?.type === 'emoji') {
                    previous.trailingSpaceWidth = fontSize * 0.26 * text.length;
                }
                else {
                    segments.push({ type: 'space', text });
                }
            }
            else if (EMOJI_REGEX.test(text)) {
                segments.push({ type: 'emoji', text });
            }
            else {
                const cleanedText = text.replace(/\uFE0F/g, '');
                if (cleanedText.length > 0) {
                    segments.push({ type: 'word', text: cleanedText });
                }
            }
        }
        return segments;
    }
    hasCompatibleChildren(segments) {
        if (this.children.length !== segments.length) {
            return false;
        }
        return segments.every((segment, index) => {
            const child = this.children[index];
            switch (segment.type) {
                case 'space':
                case 'newline':
                    return (child instanceof Container &&
                        !(child instanceof Image) &&
                        !(child instanceof Text));
                case 'emoji':
                    return child instanceof Image;
                case 'word':
                    return child instanceof Text;
            }
        });
    }
    updateChildren(segments, fontSize, emojiCdn, emojiSize, emojiOffsetY) {
        segments.forEach((segment, index) => {
            const child = this.children[index];
            switch (segment.type) {
                case 'space':
                    child.setProperties({
                        width: fontSize * 0.26 * segment.text.length,
                        height: fontSize,
                    });
                    break;
                case 'newline':
                    child.setProperties({
                        width: '100%',
                        height: segment.isConsecutiveNewline ? fontSize : 0,
                    });
                    break;
                case 'emoji':
                    child.setProperties({
                        src: getEmojiUrl(segment.text, emojiCdn),
                        width: emojiSize,
                        height: emojiSize,
                        transformTranslateY: emojiOffsetY,
                        marginRight: segment.trailingSpaceWidth,
                    });
                    break;
                case 'word':
                    child.setProperties({
                        text: segment.text,
                        fontSize,
                        lineHeight: this.properties.value.lineHeight,
                        color: this.properties.value.color,
                        marginRight: segment.trailingSpaceWidth,
                    });
            }
        });
    }
    rebuildChildren(segments, fontSize, emojiCdn, emojiSize, emojiOffsetY) {
        while (this.children.length > 0) {
            const child = this.children[0];
            if (child instanceof Container ||
                child instanceof Text ||
                child instanceof Image) {
                child.dispose();
            }
            else {
                this.remove(child);
            }
        }
        for (const segment of segments) {
            switch (segment.type) {
                case 'space':
                    this.add(new Container({
                        width: fontSize * 0.26 * segment.text.length,
                        height: fontSize,
                    }));
                    break;
                case 'newline':
                    this.add(new Container({
                        width: '100%',
                        height: segment.isConsecutiveNewline ? fontSize : 0,
                    }));
                    break;
                case 'emoji':
                    this.add(new Image({
                        src: getEmojiUrl(segment.text, emojiCdn),
                        width: emojiSize,
                        height: emojiSize,
                        keepAspectRatio: true,
                        transformTranslateY: emojiOffsetY,
                        marginRight: segment.trailingSpaceWidth,
                    }));
                    break;
                case 'word':
                    this.add(new Text({
                        text: segment.text,
                        fontSize,
                        lineHeight: this.properties.value.lineHeight,
                        color: this.properties.value.color,
                        whiteSpace: 'pre',
                        marginRight: segment.trailingSpaceWidth,
                    }));
            }
        }
    }
    dispose() {
        this.cleanupEffect?.();
        super.dispose();
    }
}

export { TextWithEmoji };
