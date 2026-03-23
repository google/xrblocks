/**
 * Helper to get a uniform by name or prefix+name.
 * @param uniforms - The uniforms object.
 * @param arg1 - Name of uniform, or prefix if arg2 is provided.
 * @param arg2 - Optional name of uniform if arg1 is prefix.
 */
function getU(uniforms, arg1, arg2) {
    const key = arg2 ? `${arg1}${arg2}` : arg1;
    return uniforms[key];
}

export { getU };
