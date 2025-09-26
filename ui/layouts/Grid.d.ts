import { ExitButton } from '../components/ExitButton';
import { IconButton, IconButtonOptions } from '../components/IconButton';
import { IconView } from '../components/IconView';
import { ImageView, ImageViewOptions } from '../components/ImageView';
import { LabelView } from '../components/LabelView';
import { TextButton, TextButtonOptions } from '../components/TextButton';
import { TextView, TextViewOptions } from '../components/TextView';
import { VideoView, VideoViewOptions } from '../components/VideoView';
import type { Panel } from '../core/Panel';
import type { PanelOptions } from '../core/PanelOptions';
import { View } from '../core/View';
import { ViewOptions } from '../core/ViewOptions';
import type { Col, ColOptions } from './Col';
import type { Orbiter, OrbiterOptions } from './Orbiter';
import type { Row, RowOptions } from './Row';
/**
 * A layout container that arranges child views in a grid-like
 * structure. It provides helper methods like `addRow()` and `addCol()` to
 * declaratively build complex layouts. Children are positioned based on the
 * order they are added and their respective `weight` properties.
 */
export type GridOptions = ViewOptions & {
    weight?: number;
};
export declare class Grid extends View {
    static RowClass: typeof Row;
    static ColClass: typeof Col;
    static PanelClass: typeof Panel;
    static OrbiterClass: typeof Orbiter;
    /**
     * The weight of the current rows in the grid.
     */
    rowWeight: number;
    /**
     * The weight of the current columns in the grid.
     */
    colWeight: number;
    /**
     * The summed weight to the left of the grid.
     */
    leftWeight: number;
    /**
     * The summed weight to the top of the grid.
     */
    topWeight: number;
    cols: number;
    rows: number;
    /**
     * Initializes the Grid class with the provided Row, Col, and Panel
     * classes.
     * @param RowClass - The class for rows.
     * @param ColClass - The class for columns.
     * @param PanelClass - The class for panels.
     * @param OrbiterClass - The class for panels.
     */
    static init(RowClass: typeof Row, ColClass: typeof Col, PanelClass: typeof Panel, OrbiterClass: typeof Orbiter): void;
    /**
     * Adds an image to the grid.
     * @param options - The options for the image.
     * @returns The added image view.
     */
    addImage(options: ImageViewOptions): ImageView;
    addVideo(options: VideoViewOptions): VideoView;
    addIconButton(options?: IconButtonOptions): IconButton;
    addTextButton(options?: TextButtonOptions): TextButton;
    addIcon(options?: IconButtonOptions): IconView;
    addText(options?: TextViewOptions): TextView;
    addLabel(options: object): LabelView;
    addOrbiter(options?: OrbiterOptions): Orbiter;
    addExitButton(options?: IconButtonOptions): ExitButton;
    /**
     * Adds a panel to the grid.
     * @param options - The options for the panel.
     * @returns The added panel.
     */
    addPanel(options?: PanelOptions): Panel;
    /**
     * Adds a row to the grid.
     * @param options - The options for the row.
     * @returns The added row.
     */
    addRow(options?: RowOptions): Row;
    /**
     * Adds a column to the grid.
     * @param options - The options for the column.
     * @returns The added column.
     */
    addCol(options?: ColOptions): Col;
    /**
     * Updates the layout of the grid.
     */
    updateLayout(): void;
    /**
     * Initializes the layout of the grid with compose().
     */
    resetLayout(): void;
}
