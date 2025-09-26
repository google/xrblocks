import {View} from '../core/View';
import {ViewOptions} from '../core/ViewOptions';
import {TextScrollerState} from '../layouts/TextScrollerState';
import {VerticalPager} from '../layouts/VerticalPager';

import {TextView} from './TextView';

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
export type ScrollingTroikaTextViewOptions = ViewOptions&{
  text?: string;
  textAlign?: 'left'|'right'|'center';
  scrollerState?: TextScrollerState;
  fontSize?: number;
};

export class ScrollingTroikaTextView extends View {
  private scrollerState: TextScrollerState;
  private pager: VerticalPager;
  private textViewWrapper: View;
  private textView: TextView;
  private onTextSyncCompleteBound = this.onTextSyncComplete.bind(this);
  private currentText = '';

  constructor({
    text = 'ScrollingTroikaTextView',
    textAlign = 'left',
    scrollerState = new TextScrollerState(),
    fontSize = 0.06
  }: ScrollingTroikaTextViewOptions = {}) {
    super();
    this.scrollerState = scrollerState || new TextScrollerState();
    this.pager = new VerticalPager();
    this.textViewWrapper = new View();
    this.pager.children[0].add(this.textViewWrapper);
    this.textView = new TextView({
      text: text,
      textAlign: textAlign,
      fontSize: fontSize,
      anchorX: 0,
      anchorY: 0
    });
    this.textView.x = -0.5;
    this.textView.addEventListener(
        'synccomplete', this.onTextSyncCompleteBound);
    this.textViewWrapper.add(this.textView);

    this.add(this.scrollerState);
    this.add(this.pager);
  }

  update() {
    this.textViewWrapper.y = this.textView.lineHeight *
        this.textView.aspectRatio * this.scrollerState.currentLine;
    this.textViewWrapper.updateLayout();
  }

  addText(text: string) {
    this.setText(this.currentText + text);
  }

  setText(text: string) {
    this.currentText = text;
    this.textView.setText(this.currentText);
  }

  onTextSyncComplete() {
    if (this.textView.lineCount > 0) {
      this.textView.y =
          -0.5 + this.textView.lineHeight * this.textView.aspectRatio;
      this.textView.updateLayout();
      this.scrollerState.lineCount = this.textView.lineCount;
      this.scrollerState.targetLine = this.textView.lineCount - 1;

      this.clipToLineHeight();
    }
  }

  clipToLineHeight() {
    const lineHeight = this.textView.lineHeight * this.textView.aspectRatio;
    const visibleLines = Math.floor(1.0 / lineHeight);
    const newHeight = visibleLines * lineHeight;
    this.pager.localClippingPlanes[1].constant = newHeight - 0.5;
  }
}
