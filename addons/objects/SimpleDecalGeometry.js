import * as THREE from "three";
//#region src/addons/objects/SimpleDecalGeometry.ts
/**
* SimpleDecalGeometry is a custom geometry class used to project decals onto
* a 3D mesh, based on a position, orientation, and scale.
*/
var SimpleDecalGeometry = class extends THREE.BufferGeometry {
	/**
	* @param mesh - The mesh on which the decal will be projected.
	* @param position - The position of the decal in world space.
	* @param orientation - The orientation of the decal as a
	*     quaternion.
	* @param scale - The scale of the decal.
	*/
	constructor(mesh, position, orientation, scale) {
		super();
		this.copy(mesh.geometry);
		this.applyMatrix4(mesh.matrixWorld);
		const projectorMatrix = new THREE.Matrix4();
		projectorMatrix.makeRotationFromQuaternion(orientation);
		projectorMatrix.setPosition(position);
		projectorMatrix.scale(scale);
		projectorMatrix.invert();
		const vertices = this.attributes.position.array;
		const uvs = this.attributes.uv.array;
		const indices = this.index.array;
		const vertexBounded = new Uint8Array(vertices.length);
		const vector4 = new THREE.Vector4();
		for (let i = 0; i < vertices.length / 3; ++i) {
			vector4.set(vertices[3 * i], vertices[3 * i + 1], vertices[3 * i + 2], 1);
			vector4.applyMatrix4(projectorMatrix);
			vector4.multiplyScalar(1 / vector4.w);
			uvs[2 * i] = vector4.x + .5;
			uvs[2 * i + 1] = vector4.y + .5;
			vertexBounded[i] = Number(vector4.x >= -.5 && vector4.x <= .5 && vector4.y >= -.5 && vector4.y <= .5 && vector4.z >= -.5 && vector4.z <= .5);
		}
		const goodIndices = [];
		for (let i = 0; i < indices.length / 3; ++i) if (vertexBounded[indices[3 * i]] || vertexBounded[indices[3 * i + 1]] || vertexBounded[indices[3 * i + 2]]) {
			goodIndices.push(indices[3 * i]);
			goodIndices.push(indices[3 * i + 1]);
			goodIndices.push(indices[3 * i + 2]);
		}
		this.setIndex(goodIndices);
	}
};
//#endregion
export { SimpleDecalGeometry };
