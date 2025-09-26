import {TextView} from '../components/TextView';

import {PagerState} from './PagerState';

/**
 * A UI component that visually displays the current page and total
 * number of pages for a `Pager`. It typically renders as a series of dots
 * (e.g., "◦ ● ◦") to indicate the user's position in a carousel.
 */
export class PageIndicator extends TextView {
  emptyPageIndicator = '◦';
  currentPageIndicator = '•';
  numberOfPages = 0;
  pagerState: PagerState;
  previousPage = 0;

  constructor({pagerState}: {pagerState: PagerState}) {
    super({
      text: '',
    });
    this.pagerState = pagerState;
    this.previousPage = Math.round(pagerState.currentPage);
    this.numberOfPages = pagerState.pages;
    this.updateText();
  }

  update() {
    super.update();
    const currentPage = Math.round(this.pagerState.currentPage);
    if (this.previousPage !== currentPage ||
        this.numberOfPages !== this.pagerState.pages) {
      this.updateText();
    }
  }

  updateText() {
    const currentPage =
        Math.round(this.pagerState.currentPage) % this.pagerState.pages;
    const text = new Array(this.pagerState.pages).fill(this.emptyPageIndicator);
    text[currentPage] = this.currentPageIndicator;
    this.setText(text.join(''));
    this.previousPage = currentPage;
  }
}
