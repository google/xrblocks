function nextAnimationFrame() {
    return new Promise((resolve) => {
        if (typeof requestAnimationFrame === 'function') {
            requestAnimationFrame(() => resolve());
        }
        else {
            setTimeout(resolve, 0);
        }
    });
}
async function runTimedMotion(options) {
    const { requestedDurationMs, tickMs, realTime, applyTick } = options;
    const durationMs = requestedDurationMs;
    let elapsedMs = 0;
    const advanceTo = (targetElapsedMs) => {
        while (elapsedMs < targetElapsedMs) {
            const currentTickMs = Math.min(tickMs, targetElapsedMs - elapsedMs, durationMs - elapsedMs);
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

export { runTimedMotion };
