/** Formats a number as a GLSL float literal, which needs a decimal point. */
export const glslFloat = (value: number) =>
  Number.isInteger(value) ? `${value}.0` : `${value}`;
