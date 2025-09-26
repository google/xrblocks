import { View } from '../core/View';
/**
 * A simple container that represents a single, swipeable page
 * within a `Pager` component. It's a fundamental building block for creating
 * carousels or tabbed interfaces.
 */
export declare class Page extends View {
    constructor(options?: {});
    updateLayout(): void;
}
