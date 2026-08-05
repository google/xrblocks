/**
 * Label categorisation helpers for the objects3d addon.
 *
 * All exports are pure (no DOM, no xb.core dependencies) and are safe to
 * unit-test in a Node / jsdom environment.
 */
/** Flat wall-mounted items: paintings, TVs, windows, mirrors, switches, etc. */
export declare const FLAT_LABEL_RE: RegExp;
/** Hanging / ceiling light fixtures. */
export declare const LIGHT_LABEL_RE: RegExp;
/** Small tabletop objects where depth-mesh coverage is typically coarser than
 * the object itself. */
export declare const SMALL_LABEL_RE: RegExp;
/** Tiny flat wall items (electrical switches, outlets, thermostats, etc.) that
 * need special projection-based fitting. */
export declare const TINY_FLAT_LABEL_RE: RegExp;
/**
 * Architectural surfaces — walls, floors, ceilings — that should not receive
 * bounding boxes. Recognised object categories take priority over the surface
 * match so "wall-mounted lamp" is not skipped.
 */
export declare const SURFACE_LABEL_RE: RegExp;
/**
 * Category bucket that drives which OBB fitting strategy is applied.
 *
 * - `flat` — wall-mounted planar objects (paintings, TVs, windows)
 * - `light` — hanging / ceiling fixtures
 * - `small` — small tabletop items with limited depth coverage
 * - `furniture` — general floor-standing furniture (default)
 */
export type ObjectCategory = 'flat' | 'light' | 'small' | 'furniture';
/**
 * Returns `true` when the label matches an architectural surface that should be
 * skipped. Recognised object categories (flat / light / small) take priority so
 * compound labels like "wall-mounted lamp" produce a box rather than being
 * silently discarded.
 *
 * @param label - The detected object label.
 * @returns Whether the label describes an architectural surface.
 */
export declare function isSurfaceLabel(label: string | null | undefined): boolean;
/**
 * Returns `true` when the label matches a flat, wall-mounted object.
 *
 * @param label - The detected object label.
 * @returns Whether the label describes a flat object.
 */
export declare function isFlatLabel(label: string | null | undefined): boolean;
/**
 * Returns `true` when the label matches a tiny flat wall-mounted item (switch,
 * outlet, thermostat, vent, etc.) that requires projection-based OBB sizing
 * rather than depth sampling.
 *
 * @param label - The detected object label.
 * @returns Whether the label describes a tiny flat object.
 */
export declare function isTinyFlatLabel(label: string | null | undefined): boolean;
/**
 * Returns the {@link ObjectCategory} bucket for the given label. The category
 * selects the OBB fitting strategy most likely to produce a tight, stable
 * result for that class of object.
 *
 * @param label - The detected object label.
 * @returns The most appropriate {@link ObjectCategory} for this label.
 */
export declare function categorize(label: string | null | undefined): ObjectCategory;
