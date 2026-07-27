import * as THREE from 'three';

// Default look of the orb: a soft glowing core wrapped in a translucent halo
// with a sparse field of drifting points, echoing the AgentHands paper's
// abstract "presence" that floats between the hands.
const CORE_COLOR = 0x8fb8ff;
const HALO_COLOR = 0x6aa0ff;
const POINT_COLOR = 0xdfeaff;
const POINT_COUNT = 90;

const scratchTarget = new THREE.Vector3();
const scratchDir = new THREE.Vector3();
const scratchQuat = new THREE.Quaternion();
const UP = new THREE.Vector3(0, 1, 0);

/**
 * An abstract, glowing orb that stands in for the agent's head/presence. It is
 * deliberately not a literal face: a luminous core, a translucent halo, and a
 * field of drifting points. It breathes while idle, pulses while the agent
 * speaks, and can gently gaze toward whatever the agent points at.
 */
export class AgentHead {
  /** Container to position/orient the orb in the scene. */
  readonly root = new THREE.Group();

  private core!: THREE.Mesh;
  private halo!: THREE.Mesh;
  private points!: THREE.Points;
  private gaze = new THREE.Group();

  /** Smoothed speaking energy in [0, 1]; drives the pulse amplitude. */
  private speaking = 0;
  private speakingTarget = 0;
  private clock = 0;
  private gazeTarget: THREE.Vector3 | null = null;

  /**
   * @param radius - Core radius in metres.
   */
  constructor(private radius = 0.09) {
    this.build_();
  }

  private build_() {
    this.root.add(this.gaze);

    this.core = new THREE.Mesh(
      new THREE.SphereGeometry(this.radius, 32, 32),
      new THREE.MeshBasicMaterial({
        color: CORE_COLOR,
        transparent: true,
        opacity: 0.9,
      })
    );
    this.gaze.add(this.core);

    this.halo = new THREE.Mesh(
      new THREE.SphereGeometry(this.radius * 1.7, 32, 32),
      new THREE.MeshBasicMaterial({
        color: HALO_COLOR,
        transparent: true,
        opacity: 0.18,
        side: THREE.BackSide,
        depthWrite: false,
      })
    );
    this.gaze.add(this.halo);

    // A sparse spherical shell of points that drift on their own.
    const positions = new Float32Array(POINT_COUNT * 3);
    for (let i = 0; i < POINT_COUNT; i++) {
      const v = new THREE.Vector3()
        .randomDirection()
        .multiplyScalar(this.radius * (1.3 + Math.random() * 0.6));
      v.toArray(positions, i * 3);
    }
    const geom = new THREE.BufferGeometry();
    geom.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    this.points = new THREE.Points(
      geom,
      new THREE.PointsMaterial({
        color: POINT_COLOR,
        size: 0.006,
        transparent: true,
        opacity: 0.85,
        depthWrite: false,
      })
    );
    this.gaze.add(this.points);

    // The orb is purely decorative presence; it must never intercept the
    // reticle, or its dense point shell steals hover/select from the UI behind
    // it (the points sit a few centimetres apart and win the raycast).
    this.core.raycast = () => {};
    this.halo.raycast = () => {};
    this.points.raycast = () => {};
  }

  /**
   * Sets how strongly the orb should pulse, e.g. `1` while speaking and `0`
   * when quiet. The value is smoothed internally.
   * @param level - Target speaking energy in [0, 1].
   */
  setSpeaking(level: number) {
    this.speakingTarget = THREE.MathUtils.clamp(level, 0, 1);
  }

  /**
   * Makes the orb gaze toward a world-space point (e.g. the object the agent is
   * pointing at). Pass `null` to look forward again.
   * @param worldTarget - The point to look at, or `null` to reset.
   */
  lookAt(worldTarget: THREE.Vector3 | null) {
    this.gazeTarget = worldTarget ? worldTarget.clone() : null;
  }

  /**
   * Advances the orb's idle breathing, speaking pulse, point drift, and gaze.
   * @param dt - Delta time in seconds.
   */
  update(dt: number) {
    this.clock += dt;
    this.speaking +=
      (this.speakingTarget - this.speaking) * Math.min(1, dt * 8);

    // Idle breathing plus a faster flicker that grows while speaking.
    const breathe = 1 + Math.sin(this.clock * 1.6) * 0.03;
    const talk = this.speaking * (0.12 + Math.sin(this.clock * 18) * 0.06);
    this.core.scale.setScalar(breathe + talk);
    this.halo.scale.setScalar(breathe + talk * 1.4);
    const mat = this.halo.material as THREE.MeshBasicMaterial;
    mat.opacity = 0.18 + this.speaking * 0.25;

    // Slowly rotate the point field so it shimmers.
    this.points.rotation.y += dt * 0.4;
    this.points.rotation.x += dt * 0.15;

    // Gaze: turn the orb's local frame toward the target (or back to forward).
    if (this.gazeTarget) {
      this.root.getWorldPosition(scratchTarget);
      scratchDir.copy(this.gazeTarget).sub(scratchTarget);
      if (scratchDir.lengthSq() > 1e-6) {
        scratchDir.normalize();
        scratchQuat.setFromUnitVectors(UP, scratchDir);
        this.gaze.quaternion.slerp(scratchQuat, Math.min(1, dt * 4));
        return;
      }
    }
    this.gaze.quaternion.slerp(scratchQuat.identity(), Math.min(1, dt * 4));
  }
}
