export type UIAppearance = 'surface' | 'none';

export function validateUIAppearance(
  value: unknown
): asserts value is UIAppearance {
  if (value !== 'surface' && value !== 'none') {
    throw new Error(`Invalid UI appearance "${String(value)}".`);
  }
}
