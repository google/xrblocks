/** Attempts every release before reporting the first failure to the lifecycle. */
export function runCleanupSteps(steps: Array<() => void>): void {
  let firstError: unknown;
  for (const step of steps) {
    try {
      step();
    } catch (error) {
      console.error('[generative_object] cleanup failed', error);
      firstError ??= error;
    }
  }
  if (firstError !== undefined) throw firstError;
}
