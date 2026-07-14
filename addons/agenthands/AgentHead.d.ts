import * as THREE from 'three';
/**
 * An abstract, glowing orb that stands in for the agent's head/presence. It is
 * deliberately not a literal face: a luminous core, a translucent halo, and a
 * field of drifting points. It breathes while idle, pulses while the agent
 * speaks, and can gently gaze toward whatever the agent points at.
 */
export declare class AgentHead {
    private radius;
    /** Container to position/orient the orb in the scene. */
    readonly root: THREE.Group<THREE.Object3DEventMap>;
    private core;
    private halo;
    private points;
    private gaze;
    /** Smoothed speaking energy in [0, 1]; drives the pulse amplitude. */
    private speaking;
    private speakingTarget;
    private clock;
    private gazeTarget;
    /**
     * @param radius - Core radius in metres.
     */
    constructor(radius?: number);
    private build_;
    /**
     * Sets how strongly the orb should pulse, e.g. `1` while speaking and `0`
     * when quiet. The value is smoothed internally.
     * @param level - Target speaking energy in [0, 1].
     */
    setSpeaking(level: number): void;
    /**
     * Makes the orb gaze toward a world-space point (e.g. the object the agent is
     * pointing at). Pass `null` to look forward again.
     * @param worldTarget - The point to look at, or `null` to reset.
     */
    lookAt(worldTarget: THREE.Vector3 | null): void;
    /**
     * Advances the orb's idle breathing, speaking pulse, point drift, and gaze.
     * @param dt - Delta time in seconds.
     */
    update(dt: number): void;
}
