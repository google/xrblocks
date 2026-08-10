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
/** Renders UIKit text and full-color emoji in one wrapping layout. */
export declare class TextWithEmoji extends Container<TextWithEmojiOutProperties> {
    private cleanupEffect?;
    constructor(inputProperties?: InProperties<TextWithEmojiOutProperties>, initialClasses?: Array<InProperties<BaseOutProperties> | string>, inputConfig?: {
        renderContext?: RenderContext;
        defaultOverrides?: InProperties<TextWithEmojiOutProperties>;
        defaults?: WithSignal<TextWithEmojiOutProperties>;
    });
    private parseSegments;
    private hasCompatibleChildren;
    private updateChildren;
    private rebuildChildren;
    dispose(): void;
}
