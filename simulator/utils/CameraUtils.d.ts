export declare enum ConstrainDomStringMatch {
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
export declare function evaluateConstrainDOMString(constraint: ConstrainDOMString, value: string): ConstrainDomStringMatch;
