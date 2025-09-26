import { TextView } from '../components/TextView';
import { PagerState } from './PagerState';
/**
 * A UI component that visually displays the current page and total
 * number of pages for a `Pager`. It typically renders as a series of dots
 * (e.g., "◦ ● ◦") to indicate the user's position in a carousel.
 */
export declare class PageIndicator extends TextView {
    emptyPageIndicator: string;
    currentPageIndicator: string;
    numberOfPages: number;
    pagerState: PagerState;
    previousPage: number;
    constructor({ pagerState }: {
        pagerState: PagerState;
    });
    update(): void;
    updateText(): void;
}
