import * as THREE from 'three';

import type {Options} from '../Options';

const NAME = 'XR Blocks additive display simulation';
const RADIUS = 1;
const WIDTH_SEGMENTS = 8;
const HEIGHT_SEGMENTS = 4;
const RENDER_ORDER = Number.MAX_SAFE_INTEGER;
const MIN_DIMMING = 0;
const MAX_DIMMING = 1;

function isValidDimming(dimming: number): boolean {
  return (
    Number.isFinite(dimming) && dimming >= MIN_DIMMING && dimming <= MAX_DIMMING
  );
}

/** Simulates additive output while an alpha-blend XR session is presenting. */
export class AdditiveDisplaySimulation extends THREE.Mesh<
  THREE.SphereGeometry,
  THREE.MeshBasicMaterial
> {
  constructor(
    private readonly scene: THREE.Scene,
    private readonly camera: THREE.Camera,
    private readonly options: Options
  ) {
    const initialDimming = options.simulatedDimming;
    if (options.simulateAdditiveDisplay && !isValidDimming(initialDimming)) {
      throw new RangeError(
        `Options.simulatedDimming must be between ${MIN_DIMMING} and ${MAX_DIMMING}.`
      );
    }

    super(
      new THREE.SphereGeometry(RADIUS, WIDTH_SEGMENTS, HEIGHT_SEGMENTS),
      new THREE.MeshBasicMaterial({
        transparent: true,
        premultipliedAlpha: true,
        blending: THREE.CustomBlending,
        blendEquation: THREE.AddEquation,
        blendSrc: THREE.ZeroFactor,
        blendDst: THREE.OneFactor,
        blendEquationAlpha: THREE.AddEquation,
        blendSrcAlpha: THREE.OneFactor,
        blendDstAlpha: THREE.ZeroFactor,
        depthTest: false,
        depthWrite: false,
        side: THREE.BackSide,
        toneMapped: false,
      })
    );
    this.name = NAME;
    this.renderOrder = RENDER_ORDER;
    this.frustumCulled = false;
    this.userData.xrblocksPrivate = true;
    this.userData.xrblocksAdditiveDisplaySimulation = true;
    this.raycast = () => {};

    this.lastValidDimming = isValidDimming(initialDimming)
      ? initialDimming
      : MIN_DIMMING;
  }

  private lastValidDimming = MIN_DIMMING;
  private warnedInvalidDimming = false;

  onXRSessionStarted(session: XRSession): void {
    this.onXRSessionEnded();
    if (
      !this.options.simulateAdditiveDisplay ||
      session.environmentBlendMode !== 'alpha-blend'
    ) {
      return;
    }
    this.material.opacity = this.readDimming();
    this.position.setFromMatrixPosition(this.camera.matrixWorld);
    this.scene.add(this);
  }

  onXRSessionEnded(): void {
    this.removeFromParent();
  }

  update(): void {
    if (!this.parent) return;
    this.material.opacity = this.readDimming();
    this.position.setFromMatrixPosition(this.camera.matrixWorld);
  }

  private readDimming(): number {
    const dimming = this.options.simulatedDimming;
    if (!isValidDimming(dimming)) {
      if (!this.warnedInvalidDimming) {
        this.warnedInvalidDimming = true;
        console.warn(
          `Options.simulatedDimming must be between ${MIN_DIMMING} and ${MAX_DIMMING}; keeping the last valid value.`
        );
      }
      return this.lastValidDimming;
    }
    this.lastValidDimming = dimming;
    return dimming;
  }

  dispose(): void {
    this.onXRSessionEnded();
    this.geometry.dispose();
    this.material.dispose();
  }
}
