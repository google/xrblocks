import { View } from '../core/View';
import { ViewOptions } from '../core/ViewOptions';
import { TextScrollerState } from '../layouts/TextScrollerState';
/**
 * A high-quality scrolling text view that uses Troika for SDF text
 * rendering and a `VerticalPager` for clipping and scrolling. This component is
 * ideal for displaying logs, chat histories, or other long-form text content
 * that requires crisp rendering and smooth scrolling.
 *
 * It is built by composing three key components:
 * - A `TextView` to render the actual text content.
 * - A `TextScrollerState` to manage the animation and state of the scroll
 * position.
 * - A `VerticalPager` to clip the `TextView` and create the visible scroll
 * window.
 */
export type ScrollingTroikaTextViewOptions = ViewOptions & {
    text?: string;
    textAlign?: 'left' | 'right' | 'center';
    scrollerState?: TextScrollerState;
    fontSize?: number;
};
export declare class ScrollingTroikaTextView extends View {
    private scrollerState;
    private pager;
    private textViewWrapper;
    private textView;
    private onTextSyncCompleteBound;
    private currentText;
    constructor({ text, textAlign, scrollerState, fontSize }?: ScrollingTroikaTextViewOptions);
    update(): void;
    addText(text: string): void;
    setText(text: string): void;
    onTextSyncComplete(): void;
    clipToLineHeight(): void;
}
