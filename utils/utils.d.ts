import * as THREE from 'three';
/**
 * Clamps a value between a minimum and maximum value.
 */
export declare function clamp(value: number, min: number, max: number): number;
/**
 * Linearly interpolates between two numbers `x` and `y` by a given amount `t`.
 */
export declare function lerp(x: number, y: number, t: number): number;
/**
 * Python-style print function for debugging.
 */
export declare function print(...args: unknown[]): void;
export declare const urlParams: URLSearchParams;
/**
 * Function to get the value of a URL parameter.
 * @param name - The name of the URL parameter.
 * @returns The value of the URL parameter or null if not found.
 */
export declare function getUrlParameter(name: string): string | null;
/**
 * Retrieves a boolean URL parameter. Returns true for 'true' or '1', false for
 * 'false' or '0'. If the parameter is not found, returns the specified default
 * boolean value.
 * @param name - The name of the URL parameter.
 * @param defaultBool - The default boolean value if the
 *     parameter is not present.
 * @returns The boolean value of the URL parameter.
 */
export declare function getUrlParamBool(name: string, defaultBool?: boolean): boolean;
/**
 * Retrieves an integer URL parameter. If the parameter is not found or is not a
 * valid number, returns the specified default integer value.
 * @param name - The name of the URL parameter.
 * @param defaultNumber - The default integer value if the
 *     parameter is not present.
 * @returns The integer value of the URL parameter.
 */
export declare function getUrlParamInt(name: string, defaultNumber?: number): number;
/**
 * Retrieves a float URL parameter. If the parameter is not found or is not a
 * valid number, returns the specified default float value.
 * @param name - The name of the URL parameter.
 * @param defaultNumber - The default float value if the parameter
 *     is not present.
 * @returns The float value of the URL parameter.
 */
export declare function getUrlParamFloat(name: string, defaultNumber?: number): number;
/**
 * Parses a color string (hexadecimal with optional alpha) into a THREE.Vector4.
 * Supports:
 * - #rgb (shorthand, alpha defaults to 1)
 * - #rrggbb (alpha defaults to 1)
 * - #rgba (shorthand)
 * - #rrggbbaa
 *
 * @param colorString - The color string to parse (e.g., '#66ccff',
 *     '#6cf5', '#66ccff55', '#6cf').
 * @returns The parsed color as a THREE.Vector4 (r, g, b, a), with components in
 *     the 0-1 range.
 * @throws If the input is not a string or if the hex string is invalid.
 */
export declare function getVec4ByColorString(colorString: string): THREE.Vector4;
export declare function getColorHex(fontColor: string | number): number;
/**
 * Parses a data URL (e.g., "data:image/png;base64,...") into its
 * stripped base64 string and MIME type.
 * This function handles common image MIME types.
 * @param dataURL - The data URL string.
 * @returns An object containing the stripped base64 string and the extracted
 *     MIME type.
 */
export declare function parseBase64DataURL(dataURL: string): {
    strippedBase64: string;
    mimeType: string;
} | {
    strippedBase64: string;
    mimeType: null;
};
