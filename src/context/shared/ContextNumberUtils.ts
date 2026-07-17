const CONTEXT_NUMBER_SCALE = 10_000;

export function roundContextNumber(value: number): number {
  const rounded =
    Math.round(value * CONTEXT_NUMBER_SCALE) / CONTEXT_NUMBER_SCALE;
  return Object.is(rounded, -0) ? 0 : rounded;
}
