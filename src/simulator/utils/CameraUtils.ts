export enum ConstrainDomStringMatch {
  EXACT = 0,
  IDEAL = 1,
  ACCEPTABLE = 2,
  UNACCEPTABLE = 3
}

/**
 * Evaluates how a string value satisfies a ConstrainDOMString constraint.
 *
 * @param constraint - The ConstrainDOMString to check against.
 * @param value - The string value to test.
 * @returns A `ConstrainDomStringMatch` enum indicating the match level.
 */
export function evaluateConstrainDOMString(
    constraint: ConstrainDOMString, value: string): ConstrainDomStringMatch {
  // Helper to check for a match against a string or string array.
  const matches = (c: string|string[], v: string): boolean => {
    return typeof c === 'string' ? v === c : c.includes(v);
  };

  // If no constraint is given, the value is simply acceptable.
  if (constraint == null) {
    return ConstrainDomStringMatch.ACCEPTABLE;
  }

  // A standalone string or array is treated as an implicit 'exact' requirement.
  if (typeof constraint === 'string' || Array.isArray(constraint)) {
    return matches(constraint, value) ? ConstrainDomStringMatch.EXACT :
                                        ConstrainDomStringMatch.UNACCEPTABLE;
  }

  // Handle the object-based constraint.
  if (typeof constraint === 'object') {
    // The 'exact' property is a hard requirement that overrides all others.
    if (constraint.exact !== undefined) {
      return matches(constraint.exact, value) ?
          ConstrainDomStringMatch.EXACT :
          ConstrainDomStringMatch.UNACCEPTABLE;
    }

    // If there's no 'exact' constraint, check 'ideal'.
    if (constraint.ideal !== undefined) {
      if (matches(constraint.ideal, value)) {
        return ConstrainDomStringMatch.IDEAL;
      }
    }

    // If the value doesn't match 'ideal' (or if 'ideal' wasn't specified),
    // it's still acceptable because 'ideal' is only a preference.
    return ConstrainDomStringMatch.ACCEPTABLE;
  }

  // Fallback for any unknown constraint types.
  return ConstrainDomStringMatch.UNACCEPTABLE;
}
