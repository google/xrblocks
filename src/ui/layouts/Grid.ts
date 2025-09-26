import {ExitButton} from '../components/ExitButton';
import {IconButton, IconButtonOptions} from '../components/IconButton';
import {IconView} from '../components/IconView';
import {ImageView, ImageViewOptions} from '../components/ImageView';
import {LabelView} from '../components/LabelView';
import {TextButton, TextButtonOptions} from '../components/TextButton';
import {TextView, TextViewOptions} from '../components/TextView';
import {VideoView, VideoViewOptions} from '../components/VideoView';
import type {Panel} from '../core/Panel';
import type {PanelOptions} from '../core/PanelOptions';
import {View} from '../core/View';
import {ViewOptions} from '../core/ViewOptions';

import type {Col, ColOptions} from './Col';
import type {Orbiter, OrbiterOptions} from './Orbiter';
import type {Row, RowOptions} from './Row';

/**
 * A layout container that arranges child views in a grid-like
 * structure. It provides helper methods like `addRow()` and `addCol()` to
 * declaratively build complex layouts. Children are positioned based on the
 * order they are added and their respective `weight` properties.
 */
export type GridOptions = ViewOptions&{
  weight?: number;
};

export class Grid extends View {
  static RowClass: typeof Row;
  static ColClass: typeof Col;
  static PanelClass: typeof Panel;
  static OrbiterClass: typeof Orbiter;

  /**
   * The weight of the current rows in the grid.
   */
  rowWeight = 0;

  /**
   * The weight of the current columns in the grid.
   */
  colWeight = 0;

  /**
   * The summed weight to the left of the grid.
   */
  leftWeight = 0;

  /**
   * The summed weight to the top of the grid.
   */
  topWeight = 0;

  cols = 0;
  rows = 0;

  /**
   * Initializes the Grid class with the provided Row, Col, and Panel
   * classes.
   * @param RowClass - The class for rows.
   * @param ColClass - The class for columns.
   * @param PanelClass - The class for panels.
   * @param OrbiterClass - The class for panels.
   */
  static init(
      RowClass: typeof Row, ColClass: typeof Col, PanelClass: typeof Panel,
      OrbiterClass: typeof Orbiter) {
    Grid.RowClass = RowClass;
    Grid.ColClass = ColClass;
    Grid.PanelClass = PanelClass;
    Grid.OrbiterClass = OrbiterClass;
  }

  /**
   * Adds an image to the grid.
   * @param options - The options for the image.
   * @returns The added image view.
   */
  addImage(options: ImageViewOptions) {
    const image = new ImageView(options);
    this.add(image);
    return image;
  }

  addVideo(options: VideoViewOptions) {
    const video = new VideoView(options);
    this.add(video);
    return video;
  }

  addIconButton(options: IconButtonOptions = {}) {
    const iconButton = new IconButton(options);
    this.add(iconButton);
    return iconButton;
  }

  addTextButton(options: TextButtonOptions = {}) {
    const iconButton = new TextButton(options);
    this.add(iconButton);
    return iconButton;
  }

  addIcon(options: IconButtonOptions = {}) {
    const iconView = new IconView(options);
    this.add(iconView);
    return iconView;
  }

  addText(options: TextViewOptions = {}) {
    const textView = new TextView(options);
    this.add(textView);
    return textView;
  }

  addLabel(options: object) {
    const labelView = new LabelView(options);
    this.add(labelView);
    return labelView;
  }

  addOrbiter(options: OrbiterOptions = {}) {
    const ui = new Grid.OrbiterClass(options);
    this.add(ui);
    return ui;
  }

  addExitButton(options: IconButtonOptions = {}) {
    const ui = new ExitButton(options);
    this.add(ui);
    return ui;
  }

  /**
   * Adds a panel to the grid.
   * @param options - The options for the panel.
   * @returns The added panel.
   */
  addPanel(options: PanelOptions = {}) {
    options.isRoot = false;
    const panel = new Grid.PanelClass(options);
    this.add(panel);
    return panel;
  }

  /**
   * Adds a row to the grid.
   * @param options - The options for the row.
   * @returns The added row.
   */
  addRow(options: RowOptions = {}) {
    const row = new Grid.RowClass(options);
    row.topWeight = this.rowWeight;
    row.height = row.weight;

    this.rowWeight += row.weight;
    this.add(row);
    this.rows++;
    return row;
  }

  /**
   * Adds a column to the grid.
   * @param options - The options for the column.
   * @returns The added column.
   */
  addCol(options: ColOptions = {}) {
    const col = new Grid.ColClass(options);
    col.leftWeight = this.colWeight;
    col.width = col.weight;

    this.colWeight += col.weight;
    this.add(col);
    this.cols++;
    return col;
  }

  /**
   * Updates the layout of the grid.
   */
  updateLayout() {
    this.x = -0.5 + (this.leftWeight + this.width / 2);
    this.y = 0.5 - (this.topWeight + this.height / 2);
    super.updateLayout();
  }

  /**
   * Initializes the layout of the grid with compose().
   */
  resetLayout() {
    this.rows = 0;
    this.cols = 0;
    this.colWeight = 0;
    this.rowWeight = 0;

    for (const child of this.children) {
      if (child instanceof Grid.RowClass) {
        child.topWeight = this.rowWeight;
        child.height = child.weight;
        this.rowWeight += child.weight;
        this.rows++;
      } else if (child instanceof Grid.ColClass) {
        child.leftWeight = this.colWeight;
        child.width = child.weight;
        this.colWeight += child.weight;
        this.cols++;
      }
    }
  }
}
