export type Vec2Tuple = [number, number];
export type Vec3Tuple = [number, number, number];
export type QuatTuple = [number, number, number, number];

export type SemanticSource = 'xrblocks' | 'uiblocks' | 'three' | 'app';

export interface SemanticBounds {
  center: Vec3Tuple;
  size: Vec3Tuple;
}

export interface SemanticViewData {
  rendered: boolean;
  inFrame: boolean;
  inLineOfSight: boolean;
  /**
   * Normalized horizontal screen coordinate: 0 at the left edge, 1 at the
   * right edge.
   */
  x?: number;
  /**
   * Normalized vertical screen coordinate: 0 at the top edge, 1 at the
   * bottom edge. This matches detector 2D bounding-box conventions.
   */
  y?: number;
}

export interface SemanticNode {
  id: string;
  role: string;
  name: string;
  visible: boolean;
  position: Vec3Tuple;
  children: string[];
  parentId?: string;
  objectId?: number;
  source?: SemanticSource;
  type?: string;
  text?: string;
  traits?: string[];
  disabled?: boolean;
  selected?: boolean;
  hovered?: boolean;
  bounds?: SemanticBounds;
  view?: SemanticViewData;
}

export interface SemanticTree {
  snapshotId: string;
  /** Elapsed simulation time in milliseconds when the snapshot was captured. */
  capturedAt: number;
  rootIds: string[];
  nodes: Record<string, SemanticNode>;
}

export type VisibleObjectsContext = SemanticTree;

export interface SetOfMark {
  label: string;
  nodeId: string;
  role: string;
  name: string;
  /**
   * Normalized horizontal screen coordinate: 0 at the left edge, 1 at the
   * right edge.
   */
  x: number;
  /**
   * Normalized vertical screen coordinate: 0 at the top edge, 1 at the
   * bottom edge. This matches detector 2D bounding-box conventions.
   */
  y: number;
}

export interface SetOfMarkContext {
  snapshotId: string;
  /** Elapsed simulation time in milliseconds when the snapshot was captured. */
  capturedAt: number;
  image: string;
  marks: SetOfMark[];
}

export type SemanticMetadata = {
  role?: string;
  name?: string;
  text?: string;
  traits?: string[];
  hidden?: boolean;
  disabled?: boolean;
  source?: SemanticSource;
};
