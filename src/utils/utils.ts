import * as THREE from 'three';

/**
 * Clamps a value between a minimum and maximum value.
 */
export function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

/**
 * Linearly interpolates between two numbers `x` and `y` by a given amount `t`.
 */
export function lerp(x: number, y: number, t: number) {
  return x + (y - x) * t;
}

/**
 * Python-style print function for debugging.
 */
export function print(...args: unknown[]) {
  console.log('*', ...args);
}

// Parses URL parameters using the URLSearchParams API.
export const urlParams = new URLSearchParams(window.location.search);

/**
 * Function to get the value of a URL parameter.
 * @param name - The name of the URL parameter.
 * @returns The value of the URL parameter or null if not found.
 */
export function getUrlParameter(name: string) {
  const urlParams = new URLSearchParams(window.location.search);
  return urlParams.get(name);
}

/**
 * Retrieves a boolean URL parameter. Returns true for 'true' or '1', false for
 * 'false' or '0'. If the parameter is not found, returns the specified default
 * boolean value.
 * @param name - The name of the URL parameter.
 * @param defaultBool - The default boolean value if the
 *     parameter is not present.
 * @returns The boolean value of the URL parameter.
 */
export function getUrlParamBool(name: string, defaultBool = false) {
  const inputString = urlParams.get(name)?.toLowerCase();
  // Convert the parameter value to a boolean. Returns true for 'true' or '1'.
  if (inputString === 'true' || inputString === '1') {
    return true;
  }
  // Returns false for 'false' or '0'.
  if (inputString === 'false' || inputString === '0') {
    return false;
  }
  // If the parameter is not found, returns the default boolean value.
  return defaultBool;
}

/**
 * Retrieves an integer URL parameter. If the parameter is not found or is not a
 * valid number, returns the specified default integer value.
 * @param name - The name of the URL parameter.
 * @param defaultNumber - The default integer value if the
 *     parameter is not present.
 * @returns The integer value of the URL parameter.
 */
export function getUrlParamInt(name: string, defaultNumber = 0) {
  const inputNumber = urlParams.get(name);
  if (inputNumber) {
    // Convert the parameter value to an integer. If valid, returns it.
    const num = parseInt(inputNumber, 10);
    if (!isNaN(num)) {
      return num;
    }
  }
  // If the parameter is not found or invalid, returns the default integer
  // value.
  return defaultNumber;
}

/**
 * Retrieves a float URL parameter. If the parameter is not found or is not a
 * valid number, returns the specified default float value.
 * @param name - The name of the URL parameter.
 * @param defaultNumber - The default float value if the parameter
 *     is not present.
 * @returns The float value of the URL parameter.
 */
export function getUrlParamFloat(name: string, defaultNumber = 0) {
  const inputNumber = urlParams.get(name);
  if (inputNumber) {
    // Convert the parameter value to a float. If valid, returns it.
    const num = parseFloat(inputNumber);
    if (!isNaN(num)) {
      return num;
    }
  }
  // If the parameter is not found or invalid, returns the default float value.
  return defaultNumber;
}

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
export function getVec4ByColorString(colorString: string) {
  if (typeof colorString !== 'string') {
    throw new Error('colorString must be a string');
  }

  // Remove the '#' if it exists.
  const hex = colorString.startsWith('#') ? colorString.slice(1) : colorString;
  const len = hex.length;
  let alpha = 1.0;  // Default alpha to 1

  let expandedHex = hex;
  if (len === 3 || len === 4) {
    // Expand shorthand: rgb -> rrgbbaa or rgba -> rrggbbaa
    expandedHex = hex.split('').map((char) => char + char).join('');
  }

  if (expandedHex.length === 8) {
    alpha = parseInt(expandedHex.slice(6, 8), 16) / 255;
    expandedHex = expandedHex.slice(0, 6);
  } else if (expandedHex.length === 6) {
    // Alpha is already 1.0
  } else {
    throw new Error(`Invalid hex color string format: ${colorString}`);
  }

  const r = parseInt(expandedHex.slice(0, 2), 16) / 255;
  const g = parseInt(expandedHex.slice(2, 4), 16) / 255;
  const b = parseInt(expandedHex.slice(4, 6), 16) / 255;

  if (isNaN(r) || isNaN(g) || isNaN(b) || isNaN(alpha)) {
    throw new Error(`Invalid hex values in color string: ${colorString}`);
  }

  return new THREE.Vector4(r, g, b, alpha);
}

export function getColorHex(fontColor: string|number) {
  if (typeof fontColor === 'string') {
    const vec4 = getVec4ByColorString(fontColor);
    const r = Math.round(vec4.x * 255);
    const g = Math.round(vec4.y * 255);
    const b = Math.round(vec4.z * 255);
    return (r << 16) + (g << 8) + b;
  } else if (typeof fontColor === 'number') {
    return fontColor;
  } else {
    // Default to white if fontColor is invalid.
    return 0xffffff;
  }
}

/**
 * Parses a data URL (e.g., "data:image/png;base64,...") into its
 * stripped base64 string and MIME type.
 * This function handles common image MIME types.
 * @param dataURL - The data URL string.
 * @returns An object containing the stripped base64 string and the extracted
 *     MIME type.
 */
export function parseBase64DataURL(dataURL: string) {
  const mimeTypeRegex = /^data:(image\/[a-zA-Z0-9\-+.]+);base64,/;
  const match = dataURL.match(mimeTypeRegex);

  if (match) {
    const mimeType = match[1];
    const strippedBase64 = dataURL.substring(match[0].length);
    return {strippedBase64, mimeType};
  } else {
    return {strippedBase64: dataURL, mimeType: null};
  }
}
