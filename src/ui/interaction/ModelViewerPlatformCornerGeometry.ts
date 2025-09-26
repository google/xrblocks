import * as THREE from 'three';

/**
 * A custom `THREE.BufferGeometry` that creates one rounded corner
 * piece for the `ModelViewerPlatform`. Four of these are instantiated and
 * rotated to form all corners of the platform.
 */
export class ModelViewerPlatformCornerGeometry extends THREE.BufferGeometry {
  constructor(
      radius = 1, tube = 0.4, radialSegments = 12, tubularSegments = 48) {
    super();

    const indices = [];
    const vertices = [];
    const normals = [];
    const uvs = [];

    const center = new THREE.Vector3();
    const vertex = new THREE.Vector3();
    const normal = new THREE.Vector3();

    for (let j = 0; j <= radialSegments; j++) {
      for (let i = 0; i <= tubularSegments; i++) {
        const u = i / tubularSegments * Math.PI / 2;
        const v = j / radialSegments * Math.PI + 3 * Math.PI / 2;

        vertex.x = (radius + tube * Math.cos(v)) * Math.cos(u);
        vertex.y = (radius + tube * Math.cos(v)) * Math.sin(u);
        vertex.z = tube * Math.sin(v);
        vertices.push(vertex.x, vertex.y, vertex.z);

        center.x = radius * Math.cos(u);
        center.y = radius * Math.sin(u);
        normal.subVectors(vertex, center).normalize();
        normals.push(normal.x, normal.y, normal.z);

        uvs.push(i / tubularSegments);
        uvs.push(j / radialSegments);
      }
    }

    for (let j = 1; j <= radialSegments; j++) {
      for (let i = 1; i <= tubularSegments; i++) {
        const a = (tubularSegments + 1) * j + i - 1;
        const b = (tubularSegments + 1) * (j - 1) + i - 1;
        const c = (tubularSegments + 1) * (j - 1) + i;
        const d = (tubularSegments + 1) * j + i;

        indices.push(a, b, d);
        indices.push(b, c, d);
      }
    }

    this.setIndex(indices);
    this.setAttribute(
        'position', new THREE.Float32BufferAttribute(vertices, 3));
    this.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
    this.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  }
}
