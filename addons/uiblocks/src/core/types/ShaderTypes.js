/**
 * Numeric IDs mapped to `GradientType` for shader uniforms lookup.
 */
const GradientTypeIds = {
    Linear: 0,
    Radial: 1,
    Angular: 2,
    Diamond: 3,
};
/**
 * Numeric IDs indicating solid vs gradient configurations inside uniform structures.
 */
const PaintTypeIds = {
    Solid: 0,
    Gradient: 1,
};

export { GradientTypeIds, PaintTypeIds };
