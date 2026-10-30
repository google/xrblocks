/** Best-effort phone screen ownership, including cancellation of pending grants. */
export class ScreenWakeLock {
  private sentinel?: WakeLockSentinel;
  private pending = false;
  private active = false;
  private disposed = false;
  private generation = 0;

  constructor(private readonly wakeLock = navigator.wakeLock) {}

  setActive(active: boolean): void {
    if (this.disposed) return;
    if (this.active !== active) this.generation++;
    this.active = active;
    if (!active) this.release();
    else void this.acquire();
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.active = false;
    this.generation++;
    this.release();
  }

  private release(): void {
    const sentinel = this.sentinel;
    this.sentinel = undefined;
    void sentinel?.release().catch(() => {});
  }

  private async acquire(): Promise<void> {
    if (
      !this.wakeLock ||
      this.pending ||
      this.sentinel ||
      !this.active ||
      this.disposed
    )
      return;
    const generation = this.generation;
    this.pending = true;
    try {
      const sentinel = await this.wakeLock.request('screen');
      if (!this.active || this.disposed || generation !== this.generation) {
        await sentinel.release();
      } else {
        this.sentinel = sentinel;
        sentinel.addEventListener(
          'release',
          () => {
            if (this.sentinel === sentinel) this.sentinel = undefined;
          },
          {once: true}
        );
      }
    } catch {
      // Unsupported, denied, or low-power devices can still use the controller.
    } finally {
      this.pending = false;
      if (generation !== this.generation && this.active && !this.disposed)
        void this.acquire();
    }
  }
}
