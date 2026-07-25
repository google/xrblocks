export type TimedMotionTick = (
  elapsedMs: number,
  tickMs: number,
  durationMs: number
) => void;

function nextAnimationFrame() {
  return new Promise<void>((resolve) => {
    if (typeof requestAnimationFrame === 'function') {
      requestAnimationFrame(() => resolve());
    } else {
      setTimeout(resolve, 0);
    }
  });
}

export async function runTimedMotion(options: {
  requestedDurationMs: number;
  tickMs: number;
  realTime: boolean;
  applyTick: TimedMotionTick;
}) {
  const {requestedDurationMs, tickMs, realTime, applyTick} = options;
  const durationMs = requestedDurationMs > 0 ? requestedDurationMs : tickMs;
  let elapsedMs = 0;

  const advanceTo = (targetElapsedMs: number) => {
    while (elapsedMs < targetElapsedMs) {
      const currentTickMs = Math.min(
        tickMs,
        targetElapsedMs - elapsedMs,
        durationMs - elapsedMs
      );
      elapsedMs += currentTickMs;
      applyTick(elapsedMs, currentTickMs, durationMs);
    }
  };

  if (!realTime) {
    advanceTo(durationMs);
    return;
  }

  const startedAt = performance.now();
  while (elapsedMs < durationMs) {
    await nextAnimationFrame();
    advanceTo(Math.min(durationMs, Math.max(0, performance.now() - startedAt)));
  }
}
