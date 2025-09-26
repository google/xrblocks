import {UI_OVERLAY_LAYER} from '../../constants';

import {TextView, TextViewOptions} from './TextView';

/**
 * Identical to text view except sets this.layer to UI_OVERLAY_LAYER.
 */
export type LabelViewOptions = TextViewOptions;

export class LabelView extends TextView {
  constructor(options: LabelViewOptions = {}) {
    super(options);
    this.layers.set(UI_OVERLAY_LAYER);
  }

  protected override createTextSDF() {
    super.createTextSDF();
    this.textObj!.material.depthText = false;
    this.textObj!.material.depthWrite = false;
  }
}
