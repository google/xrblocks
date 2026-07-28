import * as THREE from 'three';

/**
 * A mesh injected into the {@link MeshDetector} by the desktop simulator.
 *
 * The real WebXR Mesh Detection API only produces meshes from
 * `frame.detectedMeshes`, which the simulator never provides. This is the
 * mesh-detection analog of {@link SimulatorPlane}: the simulator extracts the
 * ground-truth geometry of the loaded environment and feeds it to the
 * `MeshDetector` via `setSimulatorMeshes()`.
 */
export interface SimulatorMesh {
  /** Vertex positions as flat xyz triples, in world space. */
  vertices: Float32Array;

  /** Triangle indices into {@link vertices}. */
  indices: Uint32Array;

  /**
   * Timestamp of the last geometry change, analogous to `XRMesh.lastChangedTime`.
   * Simulator meshes are static, so this is typically 0.
   */
  lastChangedTime: number;

  /**
   * Optional semantic label (e.g. 'floor', 'ceiling', 'wall'). When it matches
   * one of the detector's debug materials it is colored accordingly; otherwise
   * the fallback debug material is used.
   */
  semanticLabel?: string;

  /**
   * Optional world-space origin. Defaults to the identity. When {@link vertices}
   * are already baked into world space this should be left undefined.
   */
  position?: THREE.Vector3;

  /** Optional world-space orientation. Defaults to the identity. */
  quaternion?: THREE.Quaternion;

  /** Internal simulator object id used to keep dynamic mesh poses synchronized. */
  simulatorObjectId?: string;
}
