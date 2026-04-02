import * as THREE from 'three';
import {VectorField, ForceSource} from './VectorField.js';

/**
 * GPU-instanced particle system driven by a vector field.
 *
 * Each particle's position is integrated using Symplectic Euler:
 *   velocity += field(position) * dt
 *   velocity *= damping
 *   position += velocity * dt
 *
 * Symplectic Euler is chosen over standard Euler because it conserves
 * energy better in oscillatory systems (particles orbiting attractors).
 *
 * Particles that exceed the boundary sphere are respawned near a random
 * source or at the origin, keeping the visual density consistent.
 */

const PARTICLE_COUNT = 5000;
const BOUNDARY_RADIUS = 5.0;
const DAMPING = 0.98;
const MAX_SPEED = 8.0;
const RESPAWN_RADIUS = 0.3;
const BASE_PARTICLE_SIZE = 0.012;
const SPEED_SCALE_FACTOR = 0.15;

/** Reusable objects for matrix composition without GC overhead. */
const _obj = new THREE.Object3D();
const _force = new THREE.Vector3();
const _color = new THREE.Color();

/** Per-particle state stored in flat arrays for cache-friendly access. */
interface ParticleState {
  positions: Float32Array; // x,y,z per particle (3 * count)
  velocities: Float32Array; // vx,vy,vz per particle (3 * count)
  lifetimes: Float32Array; // remaining life per particle
  maxLifetimes: Float32Array;
}

export class ForceFieldParticles extends THREE.Object3D {
  public field: VectorField;
  public mesh: THREE.InstancedMesh | null = null;
  private state: ParticleState;
  private particleCount: number;

  constructor(particleCount: number = PARTICLE_COUNT) {
    super();
    this.particleCount = particleCount;
    this.field = new VectorField();

    this.state = {
      positions: new Float32Array(particleCount * 3),
      velocities: new Float32Array(particleCount * 3),
      lifetimes: new Float32Array(particleCount),
      maxLifetimes: new Float32Array(particleCount),
    };
  }

  public init() {
    const geo = new THREE.IcosahedronGeometry(BASE_PARTICLE_SIZE, 1);
    const mat = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0.9,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });

    this.mesh = new THREE.InstancedMesh(geo, mat, this.particleCount);
    this.mesh.frustumCulled = false;
    this.add(this.mesh);

    // Initialize all particles
    for (let i = 0; i < this.particleCount; i++) {
      this.respawnParticle(i);
    }
    this.updateInstanceMatrices();
  }

  /** Spawns a particle near a random force source or at origin. */
  private respawnParticle(index: number) {
    const i3 = index * 3;
    const sources = this.field.sources;

    let cx = 0,
      cy = 0,
      cz = 0;
    if (sources.length > 0) {
      const src = sources[Math.floor(Math.random() * sources.length)];
      cx = src.position.x;
      cy = src.position.y;
      cz = src.position.z;
    }

    // Spawn in a sphere around the chosen center
    const theta = Math.random() * Math.PI * 2;
    const phi = Math.acos(2 * Math.random() - 1);
    const r = RESPAWN_RADIUS * Math.cbrt(Math.random()); // cube root for uniform volume distribution

    /**
     * MATH: Spherical to Cartesian conversion with uniform volume sampling.
     * Using Math.cbrt(random) ensures uniform distribution within the sphere
     * (not clustered at center). Without cbrt, density ∝ 1/r².
     */
    this.state.positions[i3] = cx + r * Math.sin(phi) * Math.cos(theta);
    this.state.positions[i3 + 1] = cy + r * Math.cos(phi);
    this.state.positions[i3 + 2] = cz + r * Math.sin(phi) * Math.sin(theta);

    this.state.velocities[i3] = 0;
    this.state.velocities[i3 + 1] = 0;
    this.state.velocities[i3 + 2] = 0;

    const life = 3.0 + Math.random() * 4.0;
    this.state.lifetimes[index] = life;
    this.state.maxLifetimes[index] = life;
  }

  /**
   * Steps the simulation forward.
   *
   * MATH — Symplectic Euler Integration:
   *   v(t+dt) = v(t) + F(x(t)) * dt
   *   x(t+dt) = x(t) + v(t+dt) * dt    ← note: uses NEW velocity
   *
   * This is more stable than standard Euler (which uses old velocity)
   * for conservative force fields. It's a symplectic integrator, meaning
   * it preserves the phase-space volume (Liouville's theorem), which
   * prevents particles from spiraling inward or outward over time.
   */
  public update(deltaTime: number) {
    if (!this.mesh) return;

    this.field.timeOffset += deltaTime * 0.3;
    const {positions, velocities, lifetimes, maxLifetimes} = this.state;
    const _pos = new THREE.Vector3();

    for (let i = 0; i < this.particleCount; i++) {
      const i3 = i * 3;

      lifetimes[i] -= deltaTime;
      if (lifetimes[i] <= 0 || this.isOutOfBounds(i)) {
        this.respawnParticle(i);
        continue;
      }

      _pos.set(positions[i3], positions[i3 + 1], positions[i3 + 2]);
      this.field.evaluate(_pos, _force);

      // Symplectic Euler: update velocity first, then position
      velocities[i3] = (velocities[i3] + _force.x * deltaTime) * DAMPING;
      velocities[i3 + 1] =
        (velocities[i3 + 1] + _force.y * deltaTime) * DAMPING;
      velocities[i3 + 2] =
        (velocities[i3 + 2] + _force.z * deltaTime) * DAMPING;

      // Clamp speed to prevent instability
      const speedSq =
        velocities[i3] ** 2 + velocities[i3 + 1] ** 2 + velocities[i3 + 2] ** 2;
      if (speedSq > MAX_SPEED * MAX_SPEED) {
        const scale = MAX_SPEED / Math.sqrt(speedSq);
        velocities[i3] *= scale;
        velocities[i3 + 1] *= scale;
        velocities[i3 + 2] *= scale;
      }

      positions[i3] += velocities[i3] * deltaTime;
      positions[i3 + 1] += velocities[i3 + 1] * deltaTime;
      positions[i3 + 2] += velocities[i3 + 2] * deltaTime;
    }

    this.updateInstanceMatrices();
  }

  private isOutOfBounds(index: number): boolean {
    const i3 = index * 3;
    const {positions} = this.state;
    const distSq =
      positions[i3] ** 2 + positions[i3 + 1] ** 2 + positions[i3 + 2] ** 2;
    return distSq > BOUNDARY_RADIUS * BOUNDARY_RADIUS;
  }

  /**
   * Rebuilds all instance matrices and colors.
   *
   * MATH — Speed-based visual mapping:
   *   - Scale: baseSize * (1 + speed * factor) — faster = larger
   *   - Color: HSL hue mapped from speed — slow=blue(0.6), fast=red(0.0)
   *   - Opacity: lifetime ratio — fades out as particle dies
   */
  private updateInstanceMatrices() {
    if (!this.mesh) return;
    const {positions, velocities, lifetimes, maxLifetimes} = this.state;

    for (let i = 0; i < this.particleCount; i++) {
      const i3 = i * 3;

      const speed = Math.sqrt(
        velocities[i3] ** 2 + velocities[i3 + 1] ** 2 + velocities[i3 + 2] ** 2
      );

      const scale = 1.0 + speed * SPEED_SCALE_FACTOR;
      const lifeRatio = lifetimes[i] / maxLifetimes[i];

      _obj.position.set(positions[i3], positions[i3 + 1], positions[i3 + 2]);
      _obj.scale.setScalar(scale);
      _obj.updateMatrix();
      this.mesh.setMatrixAt(i, _obj.matrix);

      // Hue: 0.6 (blue) at rest → 0.0 (red) at max speed
      const hue = THREE.MathUtils.lerp(
        0.6,
        0.0,
        Math.min(speed / MAX_SPEED, 1.0)
      );
      _color.setHSL(hue, 1.0, 0.5 + 0.3 * lifeRatio);
      this.mesh.setColorAt(i, _color);
    }

    this.mesh.instanceMatrix.needsUpdate = true;
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
  }

  /** Adds a force source to the field. Returns the source for later manipulation. */
  public addSource(
    type: ForceSource['type'],
    position: THREE.Vector3,
    strength: number = 5.0,
    radius: number = 0.3
  ): ForceSource {
    const source: ForceSource = {
      type,
      position: position.clone(),
      strength,
      radius,
    };
    this.field.sources.push(source);
    return source;
  }

  /** Removes a force source from the field. */
  public removeSource(source: ForceSource) {
    const idx = this.field.sources.indexOf(source);
    if (idx !== -1) this.field.sources.splice(idx, 1);
  }
}
