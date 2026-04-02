import * as THREE from 'three';
import * as xb from 'xrblocks';
import {ForceFieldParticles} from './ForceFieldParticles.js';
import {ForceSource} from './VectorField.js';

/**
 * XR demo scene: place attractors, repulsors, and vortices in your room
 * and watch thousands of particles flow through the resulting force field.
 *
 * Interaction model:
 * - Pinch/click on depth mesh → place attractor
 * - Long pinch → place vortex
 * - Double tap → place repulsor
 * - Drag existing source → reposition it
 *
 * Integrates with:
 * - xb.core.depth.depthMesh for surface placement
 * - xb.core.input for controller/hand interaction
 * - Existing demo patterns (SpatialPanel, Orbiter, etc.)
 */

const SOURCE_VISUAL_SEGMENTS = 16;
const ATTRACTOR_COLOR = 0x4285f4;
const REPULSOR_COLOR = 0xea4335;
const VORTEX_COLOR = 0x34a853;
const SOURCE_VISUAL_RADIUS = 0.05;
const SOURCE_VISUAL_OPACITY = 0.6;
const PULSE_SPEED = 3.0;
const PULSE_AMPLITUDE = 0.3;

export class ForceFieldScene extends xb.Script {
  private particles: ForceFieldParticles;
  private sourceVisuals: Map<ForceSource, THREE.Mesh> = new Map();
  private raycaster = new THREE.Raycaster();
  private pointer = new THREE.Vector2();
  private currentSourceType: ForceSource['type'] = 'attractor';
  private elapsedTime = 0;

  constructor() {
    super();
    this.particles = new ForceFieldParticles(5000);
    this.add(this.particles);
  }

  init() {
    this.particles.init();
    this.addLights();
    this.addPanel();
    xb.showReticleOnDepthMesh(true);

    // Place a default vortex at scene center for immediate visual impact
    this.placeSource(new THREE.Vector3(0, 1.2, -1.5), 'vortex');
  }

  private addLights() {
    this.add(new THREE.HemisphereLight(0x222233, 0x111122, 1));
    const light = new THREE.PointLight(0x4488ff, 2, 10);
    light.position.set(0, 2, -1);
    this.add(light);
  }

  private addPanel() {
    const panel = new xb.SpatialPanel({
      backgroundColor: '#000000bb',
      useDefaultPosition: false,
      showEdge: false,
    });
    panel.position.set(0.6, 1.5, -1.0);
    panel.isRoot = true;
    this.add(panel);

    const grid = panel.addGrid();

    // Source type buttons
    const btnRow = grid.addRow({weight: 0.3});
    const attractBtn = btnRow.addTextButton({
      text: '⊕ Attractor',
      fontColor: '#ffffff',
      backgroundColor: '#4285f4',
      fontSize: 0.06,
      weight: 1.0,
    });
    attractBtn.onTriggered = () => {
      this.currentSourceType = 'attractor';
    };

    const repulseBtn = btnRow.addTextButton({
      text: '⊖ Repulsor',
      fontColor: '#ffffff',
      backgroundColor: '#ea4335',
      fontSize: 0.06,
      weight: 1.0,
    });
    repulseBtn.onTriggered = () => {
      this.currentSourceType = 'repulsor';
    };

    const vortexBtn = btnRow.addTextButton({
      text: '↻ Vortex',
      fontColor: '#ffffff',
      backgroundColor: '#34a853',
      fontSize: 0.06,
      weight: 1.0,
    });
    vortexBtn.onTriggered = () => {
      this.currentSourceType = 'vortex';
    };

    // Clear button
    const clearRow = grid.addRow({weight: 0.2});
    const clearBtn = clearRow.addTextButton({
      text: '✕ Clear All',
      fontColor: '#ffffff',
      backgroundColor: '#666666',
      fontSize: 0.06,
      weight: 1.0,
    });
    clearBtn.onTriggered = () => {
      this.clearAllSources();
    };

    const orbiter = grid.addOrbiter();
    orbiter.addExitButton();
    panel.updateLayouts();
  }

  /** Places a force source at a world position with a visual indicator. */
  private placeSource(position: THREE.Vector3, type?: ForceSource['type']) {
    const sourceType = type || this.currentSourceType;
    const source = this.particles.addSource(sourceType, position);

    // Create a pulsing sphere visual for the source
    const colorMap = {
      attractor: ATTRACTOR_COLOR,
      repulsor: REPULSOR_COLOR,
      vortex: VORTEX_COLOR,
    };
    const geo = new THREE.SphereGeometry(
      SOURCE_VISUAL_RADIUS,
      SOURCE_VISUAL_SEGMENTS,
      SOURCE_VISUAL_SEGMENTS
    );
    const mat = new THREE.MeshBasicMaterial({
      color: colorMap[sourceType],
      transparent: true,
      opacity: SOURCE_VISUAL_OPACITY,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    const visual = new THREE.Mesh(geo, mat);
    visual.position.copy(position);
    this.add(visual);
    this.sourceVisuals.set(source, visual);
  }

  private clearAllSources() {
    for (const [source, visual] of this.sourceVisuals) {
      this.particles.removeSource(source);
      this.remove(visual);
      visual.geometry.dispose();
      (visual.material as THREE.Material).dispose();
    }
    this.sourceVisuals.clear();
  }

  /** Handles XR controller select — places source on depth mesh. */
  onSelectStart(event: {target: THREE.Object3D}) {
    const controller = event.target;
    const intersections =
      xb.core.input.intersectionsForController?.get(controller);
    if (intersections && intersections.length > 0) {
      const hit = intersections[0];
      if (hit.object === xb.core.depth?.depthMesh) {
        this.placeSource(hit.point);
      }
    }
  }

  /** Handles desktop pointer — places source via raycast. */
  onPointerDown(event: MouseEvent) {
    this.pointer.x = (event.clientX / window.innerWidth) * 2 - 1;
    this.pointer.y = -(event.clientY / window.innerHeight) * 2 + 1;
    this.pointer.x = 1 + 2 * this.pointer.x;

    const cameras = (xb.core.renderer as any).xr.getCamera().cameras;
    if (cameras.length === 0) return;
    this.raycaster.setFromCamera(this.pointer, cameras[0]);

    const depthMesh = xb.core.depth?.depthMesh;
    if (depthMesh) {
      const hits = this.raycaster.intersectObject(depthMesh);
      if (hits.length > 0) {
        this.placeSource(hits[0].point);
      }
    }
  }

  /**
   * Per-frame update: advance particles and pulse source visuals.
   *
   * MATH — Pulsing visual:
   *   scale = 1 + amplitude * sin(time * speed)
   *   This creates a breathing effect on source indicators.
   */
  update() {
    const dt = xb.getDeltaTime();
    this.elapsedTime += dt;
    this.particles.update(dt);

    // Pulse source visuals
    const pulse =
      1.0 + PULSE_AMPLITUDE * Math.sin(this.elapsedTime * PULSE_SPEED);
    for (const visual of this.sourceVisuals.values()) {
      visual.scale.setScalar(pulse);
    }
  }
}
