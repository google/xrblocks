import * as THREE from 'three';
import * as xb from 'xrblocks';
import {ALL_EDGES} from './FaceMeshIndices.js';

export class FaceWireframe extends xb.Script {
  init() {
    // 1. Line segments for wireframe edges
    const lineMaterial = new THREE.LineBasicMaterial({
      color: 0x4796e3,
      transparent: true,
      opacity: 0.85,
      depthTest: false,
    });
    const lineGeom = new THREE.BufferGeometry();
    lineGeom.setAttribute(
      'position',
      new THREE.BufferAttribute(new Float32Array(ALL_EDGES.length * 6), 3)
    );
    this.lineGeometry = lineGeom;
    this.wireframeLines = new THREE.LineSegments(lineGeom, lineMaterial);
    this.wireframeLines.frustumCulled = false;
    this.wireframeLines.renderOrder = 5;
    this.add(this.wireframeLines);

    // 2. Point cloud of landmarks
    const pointGeom = new THREE.BufferGeometry();
    pointGeom.setAttribute(
      'position',
      new THREE.BufferAttribute(new Float32Array(478 * 3), 3)
    );
    this.pointGeometry = pointGeom;
    this.pointCloud = new THREE.Points(
      pointGeom,
      new THREE.PointsMaterial({
        color: 0x9b5de5,
        size: 0.004,
        transparent: true,
        opacity: 0.6,
        depthTest: false,
      })
    );
    this.pointCloud.frustumCulled = false;
    this.pointCloud.renderOrder = 4;
    this.add(this.pointCloud);
  }

  setVisible(v) {
    this.pointCloud.visible = v;
    this.wireframeLines.visible = v;
  }

  updateFace(face) {
    // Update points
    const pts = this.pointGeometry.attributes.position.array;
    for (let i = 0; i < face.landmarks.length; i++) {
      const wp = face.landmarks[i].worldPosition;
      if (wp) {
        pts[i * 3] = wp.x;
        pts[i * 3 + 1] = wp.y;
        pts[i * 3 + 2] = wp.z;
      }
    }
    this.pointGeometry.attributes.position.needsUpdate = true;

    // Update lines
    const lines = this.lineGeometry.attributes.position.array;
    for (let e = 0; e < ALL_EDGES.length; e++) {
      const [a, b] = ALL_EDGES[e];
      const wa = face.landmarks[a]?.worldPosition;
      const wb = face.landmarks[b]?.worldPosition;
      const off = e * 6;
      if (!wa || !wb) {
        // Collapse the edge to a single point so it doesn't render a
        // stale line back to (0, 0, 0) when a landmark is missing.
        lines[off] = 0;
        lines[off + 1] = 0;
        lines[off + 2] = 0;
        lines[off + 3] = 0;
        lines[off + 4] = 0;
        lines[off + 5] = 0;
        continue;
      }
      lines[off] = wa.x;
      lines[off + 1] = wa.y;
      lines[off + 2] = wa.z;
      lines[off + 3] = wb.x;
      lines[off + 4] = wb.y;
      lines[off + 5] = wb.z;
    }
    this.lineGeometry.attributes.position.needsUpdate = true;
  }
}
