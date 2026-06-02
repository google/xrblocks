import { Container, Image, Text } from '@pmndrs/uikit';
import { effect } from '@preact/signals-core';

// Unicode-aware regex to split text into standard words, whitespace, and emoji symbols.
// It matches all emoji presentation sequences (including warning signs, hearts, and sparkles)
// and groups Variation Selectors (\uFE0F), ZWJ Joiners (\u200D), and modifiers with their parent emoji.
const WORD_EMOJI_REGEX = /(?:\p{Emoji_Presentation}|\p{Emoji}\uFE0F)(?:\u200D(?:\p{Emoji_Presentation}|\p{Emoji}\uFE0F))*(?:\p{Emoji_Modifier})*|\n|[ \t\r]+|[a-zA-Z0-9]+|[^a-zA-Z0-9\s]/gu;
function getEmojiHex(emoji) {
    let hex = Array.from(emoji)
        .map((char) => char.codePointAt(0).toString(16))
        .join('-');
    // Twemoji CDN strips -fe0f from simple emoji codepoints unless it is a ZWJ sequence
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
    // Twemoji PNG CDN (72x72 assets, universally supported by Three.js TextureLoader)
    return `https://cdnjs.cloudflare.com/ajax/libs/twemoji/14.0.2/72x72/${hex}.png`;
}
/**
 * ==================================================================================
 *                                TEXT WITH EMOJI
 * ==================================================================================
 *
 * A modular, high-performance component for rendering inline text mixed with emojis in 3D
 * user interfaces, acting as a drop-in layout-equivalent alternative to the `Text` component.
 *
 * 📖 OVERVIEW & WHY IT EXISTS:
 * In `@pmndrs/uikit`, standard text is drawn using razor-sharp Multi-channel Signed Distance
 * Field (MSDF) font textures. While incredibly fast and scalable, MSDF textures are single-color
 * vector channels that cannot represent multi-colored raster/vector emoji graphics (e.g. 🚀, 😂).
 *
 * `TextWithEmoji` bypasses shader limitations entirely by utilizing Yoga's Flexbox engine.
 * It configures a row wrapper (`flexDirection: 'row'`, `flexWrap: 'wrap'`) and segments the text
 * dynamically, instantiating each word/space as a separate `<Text>` node, and each emoji as an
 * `<Image>` node. Yoga then naturally wraps these individual nodes to achieve perfect inline flow.
 *
 * 🔄 REACTIVITY & MEMORY LIFE-CYCLE:
 * Using Preact Signals (`effect()`), the component reactively listens to changes on the `text`
 * property. When updated, it automatically disposes of previous child elements cleanly to prevent
 * memory leaks and recreate children on the fly.
 *
 * ⚠️ KNOWN LIMITATIONS & CONSTRAINTS:
 *
 * 1. Segment-Level Wrapping:
 *    Since wrapping is handled at the Yoga Flexbox child-component boundary, text wrapping only
 *    occurs at segment limits (words, spaces, emojis, and punctuation). Core typography settings
 *    like `wordBreak` apply locally within each individual word box, not globally.
 *
 * 2. Ultra-Long Word Wrapping:
 *    If a single word (e.g., a very long continuous URL or code snippet) is wider than the entire
 *    container:
 *      - The word will wrap internally inside its own `<Text>` component using standard MSDF wrapping.
 *      - Once wrapped, that `<Text>` component occupies a multi-line block node. Any subsequent words
 *        or emojis will be positioned *after the entire block* (e.g. on a new line below), rather than
 *        continuing inline immediately after the final character.
 *      - MITIGATION: This is resolved by default using Mitigation 1 (Punctuation-Aware Splitting)
 *        which tokenizes common punctuation symbols (`/`, `.`, `-`, etc.) individually, allowing URLs
 *        to break naturally inline at punctuation bounds.
 *
 * 3. Node Count Overhead:
 *    Instantiating every token as a separate layout node increases the size of the Yoga flex tree.
 *    This overhead is completely negligible for normal dynamic labels, headers, and card descriptions.
 *    However, for long novels, books, or very long paragraphs, a core layout integration is preferred.
 * ==================================================================================
 */
class TextWithEmoji extends Container {
    constructor(inputProperties, initialClasses, inputConfig) {
        // Configure the parent container for wrap-around inline flex flow
        super({
            flexDirection: 'row',
            flexWrap: 'wrap',
            alignItems: 'center',
            ...inputProperties,
        }, initialClasses, inputConfig);
        // Reactively rebuild children when the text or sizing properties change
        this.cleanupEffect = effect(() => {
            const currentText = (this.properties.value.text ?? '').replace(/\r\n/g, '\n');
            const currentFontSize = this.properties.value.fontSize ?? 16;
            const emojiCdn = (this.properties.value.emojiCdn ?? 'twemoji');
            const emojiSizeMultiplier = this.properties.value.emojiSizeMultiplier ?? 1.05;
            const calculatedEmojiSize = currentFontSize * emojiSizeMultiplier;
            const calculatedEmojiOffsetY = this.properties.value.emojiOffsetY ?? -calculatedEmojiSize * 0.08;
            // Parse text into active structural segment tokens
            const segments = currentText.match(WORD_EMOJI_REGEX) || [];
            const activeSegments = [];
            for (let i = 0; i < segments.length; i++) {
                const segment = segments[i];
                if (segment === '\n') {
                    const isConsecutiveNewline = i === 0 || segments[i - 1] === '\n';
                    activeSegments.push({
                        type: 'newline',
                        text: segment,
                        isConsecutiveNewline,
                    });
                }
                else if (/^[ \t\r]+$/.test(segment)) {
                    const prev = activeSegments[activeSegments.length - 1];
                    if (prev && (prev.type === 'word' || prev.type === 'emoji')) {
                        prev.trailingSpaceWidth = currentFontSize * 0.26 * segment.length;
                    }
                    else {
                        activeSegments.push({ type: 'space', text: segment });
                    }
                }
                else if (/(?:\p{Emoji_Presentation}|\p{Emoji}\uFE0F)/u.test(segment)) {
                    activeSegments.push({ type: 'emoji', text: segment });
                }
                else {
                    const cleanedSegment = segment.replace(/\uFE0F/g, '');
                    if (cleanedSegment.length > 0) {
                        activeSegments.push({ type: 'word', text: cleanedSegment });
                    }
                }
            }
            // Check if the existing children list matches the new structural layout segments
            let isCompatible = this.children.length === activeSegments.length;
            if (isCompatible) {
                for (let i = 0; i < this.children.length; i++) {
                    const child = this.children[i];
                    const seg = activeSegments[i];
                    if ((seg.type === 'space' || seg.type === 'newline') &&
                        !(child instanceof Container &&
                            !(child instanceof Image) &&
                            !(child instanceof Text))) {
                        isCompatible = false;
                        break;
                    }
                    if (seg.type === 'emoji' && !(child instanceof Image)) {
                        isCompatible = false;
                        break;
                    }
                    if (seg.type === 'word' && !(child instanceof Text)) {
                        isCompatible = false;
                        break;
                    }
                }
            }
            if (isCompatible) {
                // 1. If the structure is compatible, perform extremely fast, flicker-free in-place updates
                for (let i = 0; i < this.children.length; i++) {
                    const child = this.children[i];
                    const seg = activeSegments[i];
                    if (seg.type === 'space') {
                        const spaceContainer = child;
                        spaceContainer.setProperties({
                            width: currentFontSize * 0.26 * seg.text.length,
                            height: currentFontSize,
                        });
                    }
                    else if (seg.type === 'newline') {
                        const newlineContainer = child;
                        newlineContainer.setProperties({
                            width: '100%',
                            height: seg.isConsecutiveNewline ? currentFontSize : 0,
                        });
                    }
                    else if (seg.type === 'emoji') {
                        const img = child;
                        img.setProperties({
                            src: getEmojiUrl(seg.text, emojiCdn),
                            width: calculatedEmojiSize,
                            height: calculatedEmojiSize,
                            transformTranslateY: calculatedEmojiOffsetY,
                            marginRight: seg.trailingSpaceWidth,
                        });
                    }
                    else {
                        const txt = child;
                        txt.setProperties({
                            text: seg.text,
                            fontSize: currentFontSize,
                            lineHeight: this.properties.value.lineHeight,
                            color: this.properties.value.color,
                            marginRight: seg.trailingSpaceWidth,
                        });
                    }
                }
            }
            else {
                // 2. If structural layout has changed, clean up previous components and rebuild completely
                // Dispose and clear all existing child components safely
                while (this.children.length > 0) {
                    const child = this.children[0];
                    if (child == null) {
                        this.children.shift();
                        continue;
                    }
                    if (child instanceof Container ||
                        child instanceof Text ||
                        child instanceof Image) {
                        child.dispose();
                    }
                    else {
                        this.remove(child);
                    }
                }
                // Create and mount the new child elements
                for (const seg of activeSegments) {
                    if (seg.type === 'space') {
                        const spaceContainer = new Container({
                            width: currentFontSize * 0.26 * seg.text.length,
                            height: currentFontSize,
                        });
                        this.add(spaceContainer);
                    }
                    else if (seg.type === 'newline') {
                        const newlineContainer = new Container({
                            width: '100%',
                            height: seg.isConsecutiveNewline ? currentFontSize : 0,
                        });
                        this.add(newlineContainer);
                    }
                    else if (seg.type === 'emoji') {
                        const img = new Image({
                            src: getEmojiUrl(seg.text, emojiCdn),
                            width: calculatedEmojiSize,
                            height: calculatedEmojiSize,
                            keepAspectRatio: true,
                            transformTranslateY: calculatedEmojiOffsetY,
                            marginRight: seg.trailingSpaceWidth,
                        });
                        this.add(img);
                    }
                    else {
                        const txt = new Text({
                            text: seg.text,
                            fontSize: currentFontSize,
                            lineHeight: this.properties.value.lineHeight,
                            color: this.properties.value.color,
                            whiteSpace: 'pre',
                            marginRight: seg.trailingSpaceWidth,
                        });
                        this.add(txt);
                    }
                }
            }
        });
    }
    dispose() {
        if (this.cleanupEffect) {
            this.cleanupEffect();
        }
        super.dispose();
    }
}

export { TextWithEmoji };
