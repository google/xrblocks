import * as THREE from 'three';
import {simplex3} from './noise.js';

/**
 * Force source types that can be placed in the scene.
 * Each applies a different mathematical force model.
 */
export interface ForceSource {
  type: 'attractor' | 'repulsor' | 'vortex';
  position: THREE.Vector3;
  strength: number;
  radius: number;
}

/** Epsilon for numerical differentiation in curl computation. */
const CURL_EPS = 0.001;

/** Reusable vectors to avoid GC pressure during per-particle evaluation. */
const _toSource = new THREE.Vector3();
const _curlResult = new THREE.Vector3();
const _forceAccum = new THREE.Vector3();

/**
 * Evaluates a composite vector field at any point in 3D space.
 *
 * The field is the sum of:
 * 1. Curl noise — divergence-free turbulence (incompressible flow)
 * 2. Point attractors/repulsors — inverse-square falloff with soft radius
 * 3. Vortex sources — tangential force around an axis
 *
 * MATH HIGHLIGHT — Curl Noise:
 * Given a potential field Ψ(x,y,z) built from 3 independent noise channels,
 * the curl is:
 *   curl(Ψ) = (∂Ψz/∂y - ∂Ψy/∂z, ∂Ψx/∂z - ∂Ψz/∂x, ∂Ψy/∂x - ∂Ψx/∂y)
 *
 * This produces a divergence-free field (∇·curl = 0), meaning particles
 * never bunch up or create voids — they flow like an incompressible fluid.
 * Partial derivatives are approximated via central differences.
 */
export class VectorField {
  public sources: ForceSource[] = [];
  public noiseScale: number = 0.8;
  public noiseStrength: number = 2.0;
  public timeOffset: number = 0;

  /**
   * Computes curl noise at a point using central-difference approximation.
   *
   * MATH:
   *   ∂Ψz/∂y ≈ (Ψz(x, y+ε, z) - Ψz(x, y-ε, z)) / (2ε)
   *   ... and so on for all 6 partial derivatives.
   *
   * We use 3 offset noise channels (offset by 31.416 and 62.832) to get
   * 3 independent scalar fields for the potential vector Ψ.
   */
  public curlNoise(
    x: number,
    y: number,
    z: number,
    out: THREE.Vector3
  ): THREE.Vector3 {
    const s = this.noiseScale;
    const t = this.timeOffset;
    const e = CURL_EPS;

    // Potential field channels with large offsets for independence
    const psi = (px: number, py: number, pz: number, offset: number) =>
      simplex3(px * s + offset, py * s + t, pz * s);

    // ∂Ψz/∂y - ∂Ψy/∂z
    const dPsi_z_dy =
      (psi(x, y + e, z, 62.832) - psi(x, y - e, z, 62.832)) / (2 * e);
    const dPsi_y_dz =
      (psi(x, y, z + e, 31.416) - psi(x, y, z - e, 31.416)) / (2 * e);

    // ∂Ψx/∂z - ∂Ψz/∂x
    const dPsi_x_dz = (psi(x, y, z + e, 0) - psi(x, y, z - e, 0)) / (2 * e);
    const dPsi_z_dx =
      (psi(x + e, y, z, 62.832) - psi(x - e, y, z, 62.832)) / (2 * e);

    // ∂Ψy/∂x - ∂Ψx/∂y
    const dPsi_y_dx =
      (psi(x + e, y, z, 31.416) - psi(x - e, y, z, 31.416)) / (2 * e);
    const dPsi_x_dy = (psi(x, y + e, z, 0) - psi(x, y - e, z, 0)) / (2 * e);

    return out.set(
      dPsi_z_dy - dPsi_y_dz,
      dPsi_x_dz - dPsi_z_dx,
      dPsi_y_dx - dPsi_x_dy
    );
  }

  /**
   * Evaluates the total force at a world-space position.
   *
   * MATH for each source type:
   *
   * Attractor: F = strength * dir / (dist² + softRadius²)
   *   - Inverse-square law with soft radius to prevent singularity at dist=0
   *
   * Repulsor: F = -strength * dir / (dist² + softRadius²)
   *   - Same as attractor but reversed
   *
   * Vortex: F = strength * cross(up, dir) / (dist + softRadius)
   *   - Tangential force perpendicular to the radial direction
   *   - Creates rotational flow around the source position
   *   - Falls off as 1/r (not 1/r²) to maintain visible rotation at distance
   */
  public evaluate(position: THREE.Vector3, out: THREE.Vector3): THREE.Vector3 {
    // Start with curl noise base flow
    this.curlNoise(position.x, position.y, position.z, _curlResult);
    _forceAccum.copy(_curlResult).multiplyScalar(this.noiseStrength);

    // Accumulate forces from all sources
    for (const source of this.sources) {
      _toSource.subVectors(source.position, position);
      const distSq = _toSource.lengthSq();
      const dist = Math.sqrt(distSq);
      const softRadiusSq = source.radius * source.radius;

      switch (source.type) {
        case 'attractor': {
          // F = S * d̂ / (|d|² + r²)  — inverse-square with soft core
          const forceMag = source.strength / (distSq + softRadiusSq);
          _forceAccum.addScaledVector(_toSource.normalize(), forceMag);
          break;
        }
        case 'repulsor': {
          const forceMag = -source.strength / (distSq + softRadiusSq);
          _forceAccum.addScaledVector(_toSource.normalize(), forceMag);
          break;
        }
        case 'vortex': {
          // Tangential force: cross(up, radialDir) gives perpendicular direction
          const tangent = _toSource
            .normalize()
            .cross(new THREE.Vector3(0, 1, 0));
          const forceMag = source.strength / (dist + source.radius);
          _forceAccum.addScaledVector(tangent, forceMag);
          break;
        }
      }
    }

    return out.copy(_forceAccum);
  }
}
