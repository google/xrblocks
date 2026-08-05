/**
 * Label categorisation helpers for the objects3d addon.
 *
 * All exports are pure (no DOM, no xb.core dependencies) and are safe to
 * unit-test in a Node / jsdom environment.
 */
/** Flat wall-mounted items: paintings, TVs, windows, mirrors, switches, etc. */
const FLAT_LABEL_RE = /\b(art|artwork|painting|picture|poster|photo|photograph|mirror|frame|window|whiteboard|screen|monitor|tv|television|display|door|switch|outlet|socket|thermostat|plug|vent|register)\b/i;
/** Hanging / ceiling light fixtures. */
const LIGHT_LABEL_RE = /\b(lamp|lamps|lampshade|light|lightbulb|fixture|chandelier|sconce|pendant|lantern|bulb)\b/i;
/** Small tabletop objects where depth-mesh coverage is typically coarser than
 * the object itself. */
const SMALL_LABEL_RE = /\b(cup|mug|glass|bottle|book|magazine|remote|phone|pen|pencil|bowl|plate|coaster|candle|vase|pot|toy|tissue|controller|keys|wallet|clock)\b/i;
/** Tiny flat wall items (electrical switches, outlets, thermostats, etc.) that
 * need special projection-based fitting. */
const TINY_FLAT_LABEL_RE = /\b(switch|outlet|socket|thermostat|plug|vent|register|knob|handle|doorknob)\b/i;
/**
 * Architectural surfaces — walls, floors, ceilings — that should not receive
 * bounding boxes. Recognised object categories take priority over the surface
 * match so "wall-mounted lamp" is not skipped.
 */
const SURFACE_LABEL_RE = /\b(walls?|floors?|floorboards?|ceilings?|ground|background|surface|stud|studs|panel|panels|panelling|paneling|board|boards|cladding|baseboard|baseboards|skirting|trim|moulding|molding)\b/i;
/**
 * Returns `true` when the label matches an architectural surface that should be
 * skipped. Recognised object categories (flat / light / small) take priority so
 * compound labels like "wall-mounted lamp" produce a box rather than being
 * silently discarded.
 *
 * @param label - The detected object label.
 * @returns Whether the label describes an architectural surface.
 */
function isSurfaceLabel(label) {
    if (!label)
        return false;
    if (FLAT_LABEL_RE.test(label) ||
        LIGHT_LABEL_RE.test(label) ||
        SMALL_LABEL_RE.test(label)) {
        return false;
    }
    return SURFACE_LABEL_RE.test(label);
}
/**
 * Returns `true` when the label matches a flat, wall-mounted object.
 *
 * @param label - The detected object label.
 * @returns Whether the label describes a flat object.
 */
function isFlatLabel(label) {
    return !!label && FLAT_LABEL_RE.test(label);
}
/**
 * Returns `true` when the label matches a tiny flat wall-mounted item (switch,
 * outlet, thermostat, vent, etc.) that requires projection-based OBB sizing
 * rather than depth sampling.
 *
 * @param label - The detected object label.
 * @returns Whether the label describes a tiny flat object.
 */
function isTinyFlatLabel(label) {
    return !!label && TINY_FLAT_LABEL_RE.test(label);
}
/**
 * Returns the {@link ObjectCategory} bucket for the given label. The category
 * selects the OBB fitting strategy most likely to produce a tight, stable
 * result for that class of object.
 *
 * @param label - The detected object label.
 * @returns The most appropriate {@link ObjectCategory} for this label.
 */
function categorize(label) {
    if (!label)
        return 'furniture';
    if (FLAT_LABEL_RE.test(label))
        return 'flat';
    if (LIGHT_LABEL_RE.test(label))
        return 'light';
    if (SMALL_LABEL_RE.test(label))
        return 'small';
    return 'furniture';
}

export { FLAT_LABEL_RE, LIGHT_LABEL_RE, SMALL_LABEL_RE, SURFACE_LABEL_RE, TINY_FLAT_LABEL_RE, categorize, isFlatLabel, isSurfaceLabel, isTinyFlatLabel };
