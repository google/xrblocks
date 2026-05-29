import { BaseOutProperties, Container, InProperties, RenderContext, WithSignal } from '@pmndrs/uikit';
export type TextWithEmojiOutProperties = BaseOutProperties & {
    text?: string;
    fontSize?: number;
    lineHeight?: number | string;
    emojiCdn?: 'twemoji' | 'noto-emoji';
    emojiSizeMultiplier?: number;
    emojiOffsetY?: number;
};
export type TextWithEmojiProperties = InProperties<TextWithEmojiOutProperties>;
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
export declare class TextWithEmoji extends Container<TextWithEmojiOutProperties> {
    private cleanupEffect?;
    constructor(inputProperties?: InProperties<TextWithEmojiOutProperties>, initialClasses?: Array<InProperties<BaseOutProperties> | string>, inputConfig?: {
        renderContext?: RenderContext;
        defaultOverrides?: InProperties<TextWithEmojiOutProperties>;
        defaults?: WithSignal<TextWithEmojiOutProperties>;
    });
    dispose(): void;
}
