export class WaitFrame {
  private callbacks: (() => void)[] = [];

  /**
   * Executes all registered callbacks and clears the list.
   */
  onFrame() {
    this.callbacks.forEach((callback) => {
      try {
        callback();
      } catch (e) {
        console.error(e);
      }
    });
    this.callbacks.length = 0;
  }

  /**
   * Wait for the next frame.
   */
  async waitFrame() {
    return new Promise<void>((resolve) => {
      this.callbacks.push(resolve);
    });
  }
}
