/**
 * Tracks elapsed simulation time independently from browser wall time.
 */
export class SimulationTimer {
  private elapsedMs = 0;
  private previousFrameTimeMs?: number;

  getElapsedMs() {
    return this.elapsedMs;
  }

  update(frameTimeMs: number, timescale: number) {
    if (this.previousFrameTimeMs !== undefined) {
      this.elapsedMs +=
        Math.max(0, frameTimeMs - this.previousFrameTimeMs) * timescale;
    }
    this.previousFrameTimeMs = frameTimeMs;
  }

  step(dtMs: number, timescale: number) {
    this.elapsedMs += dtMs * timescale;
    this.previousFrameTimeMs = undefined;
  }

  pause() {
    this.previousFrameTimeMs = undefined;
  }
}
