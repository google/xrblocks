export type TrackedPlaneOrientation = 'horizontal' | 'vertical';
export type TrackedPlaneLabel = 'floor' | 'ceiling' | 'table' | 'wall';

export interface DepthPlaneTrackerConfig {
  minDepthMeters?: number;
  maxDepthMeters?: number;
  minPlaneAreaSqMeters?: number;
  minPlaneExtentMeters?: number;
  maxTrackedPlanes?: number;
  maxPolygonVertices?: number;
}

export interface DepthFrameInput {
  requestId: number;
  sceneGeneration: number;
  timestampMs: number;
  width: number;
  height: number;
  /** Row-major top-down (y=0 top) linear view-space depth (-z_view) in meters; <=0 invalid. Transferable ArrayBuffer. */
  depthBuffer: Float32Array;
  /** 16-element column-major perspective projection matrix (THREE.Camera.projectionMatrix.elements). */
  projectionMatrix: Float32Array;
  /** Camera world-space position [x, y, z] in meters. */
  cameraPosition: [number, number, number];
  /** Camera world-space unit quaternion [x, y, z, w]. */
  cameraQuaternion: [number, number, number, number];
}

export interface TrackedPlaneSnapshot {
  id: string;
  type: TrackedPlaneOrientation;
  label?: TrackedPlaneLabel;
  area: number;
  position: [number, number, number];
  /** World quaternion [x, y, z, w] mapping local (0, 1, 0) -> plane world normal. */
  quaternion: [number, number, number, number];
  /** Local extents [extentX, extentZ] in meters. */
  extents: [number, number];
  /** Interleaved local 2D polygon vertices [x0, z0, x1, z1, ...] (length >= 6, non-self-intersecting). */
  polygon: number[];
  lastChangedTime: number;
}

export type PlaneTrackingWorkerRequest =
  | {type: 'configure'; config: DepthPlaneTrackerConfig}
  | ({type: 'processDepth'} & DepthFrameInput)
  | {type: 'reset'; sceneGeneration: number}
  | {type: 'dispose'};

export type PlaneTrackingWorkerResponse =
  | {
      type: 'planes';
      requestId: number;
      sceneGeneration: number;
      planes: TrackedPlaneSnapshot[];
    }
  | {
      type: 'error';
      requestId?: number;
      sceneGeneration?: number;
      message: string;
    };
