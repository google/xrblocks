import {UIElement, type UIElementOptions} from '../UIElement';

export type UIPanelOptions = UIElementOptions;

/** A passive flex-layout and visual grouping element. */
export class UIPanel extends UIElement {
  name = 'UIPanel';

  constructor(options: UIPanelOptions = {}) {
    super('panel', options);
  }
}
