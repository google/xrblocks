import type { DragMode } from '../../ux/DragManager';
import type { ViewOptions } from './ViewOptions';
export type PanelOptions = ViewOptions & {
    backgroundColor?: string;
    draggable?: boolean;
    draggingMode?: DragMode;
    touchable?: boolean;
    isRoot?: boolean;
    width?: number;
    height?: number;
    showHighlights?: boolean;
    useDefaultPosition?: boolean;
    useBorderlessShader?: boolean;
};
