import { TextView, TextViewOptions } from './TextView';
/**
 * Identical to text view except sets this.layer to UI_OVERLAY_LAYER.
 */
export type LabelViewOptions = TextViewOptions;
export declare class LabelView extends TextView {
    constructor(options?: LabelViewOptions);
    protected createTextSDF(): void;
}
