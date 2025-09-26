import * as THREE from 'three';

/**
 * SimpleDecalGeometry is a custom geometry class used to project decals onto
 * a 3D mesh, based on a position, orientation, and scale.
 */
class SimpleDecalGeometry extends THREE.BufferGeometry {
    /**
     * @param mesh - The mesh on which the decal will be projected.
     * @param position - The position of the decal in world space.
     * @param orientation - The orientation of the decal as a
     *     quaternion.
     * @param scale - The scale of the decal.
     */
    constructor(mesh, position, orientation, scale) {
        super();
        // Copies the geometry from the mesh and applies the world matrix of the
        // mesh.
        this.copy(mesh.geometry);
        this.applyMatrix4(mesh.matrixWorld);
        // Creates a projector matrix for the decal using the given orientation,
        // position, and scale.
        const projectorMatrix = new THREE.Matrix4();
        projectorMatrix.makeRotationFromQuaternion(orientation);
        projectorMatrix.setPosition(position);
        projectorMatrix.scale(scale);
        projectorMatrix
            .invert(); // Inverts the matrix for projection calculations.
        // Accesses the vertices, UVs, and indices from the geometry attributes.
        const vertices = this.attributes.position.array;
        const uvs = this.attributes.uv.array;
        const indices = this.index.array;
        // Creates an array to store whether each vertex is bounded within the
        // projection volume.
        const vertexBounded = new Uint8Array(vertices.length);
        const vector4 = new THREE.Vector4();
        // Loops over all vertices to transform them using the projector matrix.
        for (let i = 0; i < vertices.length / 3; ++i) {
            // Sets the vector with the current vertex position and applies the
            // projector matrix.
            vector4.set(vertices[3 * i], vertices[3 * i + 1], vertices[3 * i + 2], 1.0);
            vector4.applyMatrix4(projectorMatrix);
            // Performs perspective divide by w component.
            vector4.multiplyScalar(1 / vector4.w);
            // Updates UV coordinates based on the projected position.
            uvs[2 * i] = vector4.x + 0.5;
            uvs[2 * i + 1] = vector4.y + 0.5;
            // Checks if the vertex is within the -0.5 to 0.5 range in all dimensions.
            vertexBounded[i] = Number(vector4.x >= -0.5 && vector4.x <= 0.5 && vector4.y >= -0.5 &&
                vector4.y <= 0.5 && vector4.z >= -0.5 && vector4.z <= 0.5);
        }
        // Creates a list of indices that correspond to bounded vertices only.
        const goodIndices = [];
        for (let i = 0; i < indices.length / 3; ++i) {
            // Adds the triangle indices if any of its vertices are inside the
            // bounding box.
            if (vertexBounded[indices[3 * i]] || vertexBounded[indices[3 * i + 1]] ||
                vertexBounded[indices[3 * i + 2]]) {
                goodIndices.push(indices[3 * i]);
                goodIndices.push(indices[3 * i + 1]);
                goodIndices.push(indices[3 * i + 2]);
            }
        }
        // Updates the geometry's index attribute to only include the valid
        // triangles.
        this.setIndex(goodIndices);
    }
}

export { SimpleDecalGeometry };
