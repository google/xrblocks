//#region src/addons/phone-companion/ScreenWakeLock.d.ts
/** Best-effort phone screen ownership, including cancellation of pending grants. */
export declare class ScreenWakeLock {
  private readonly wakeLock;
  private sentinel?;
  private pending;
  private active;
  private disposed;
  private generation;
  constructor(wakeLock?: WakeLock);
  setActive(active: boolean): void;
  dispose(): void;
  private release;
  private acquire;
}
//#endregion