import * as THREE from 'three';
import {
  DEFAULT_GRADIENT_PANEL_PROPS,
  MAX_GRADIENT_STOPS,
} from '../constants/GradientPanelConstants';
import {
  GradientPaint,
  GradientTypeIds,
  Paint,
  PaintTypeIds,
  ShaderUniforms,
  StrokeAlign,
} from '../types/ShaderTypes';
import {parseColorWithAlpha} from './ColorUtils';
import {getU} from './ShaderUtils';

/**
 * Type guard to check if a Paint is a GradientPaint.
 */
function _isGradient(paint: Paint): paint is GradientPaint {
  return typeof paint === 'object' && paint !== null && 'stops' in paint;
}

/**
 * Sets a solid color into ShaderUniforms.
 */
function _setSolid(
  uniforms: ShaderUniforms,
  prefix: string,
  color: THREE.ColorRepresentation,
  opacity: number
) {
  const paintTypeU = getU(uniforms, prefix, 'paintType');
  if (paintTypeU) paintTypeU.value = PaintTypeIds.Solid;

  const solidColorU = getU(uniforms, prefix, 'solidColor');
  if (solidColorU) {
    const {color: c} = parseColorWithAlpha(color);
    const cObj = new THREE.Color(c);
    solidColorU.value.set(cObj.r, cObj.g, cObj.b, opacity);
  }
}

// ==========================================
// 2. Paint Uniforms (Fill / Stroke)
// ==========================================

/**
 * Creates a set of uniforms for a Paint structure.
 * @param prefix - The prefix for uniform names (e.g., 'u_fill_', 'u_stroke_').
 * @returns An object containing initialized ShaderUniforms sets.
 */
export function createPaintUniforms(prefix: string): ShaderUniforms {
  return {
    // 0 for Solid, 1 for Gradient. See PaintTypeIds.
    [`${prefix}paintType`]: {value: 0},
    // RGBA vector supporting solid color maps.
    [`${prefix}solidColor`]: {value: new THREE.Vector4(0, 0, 0, 1)},
    // 0 for Linear, 1 for Radial, etc. See GradientTypeIds.
    [`${prefix}gradientType`]: {value: 0},
    // Center anchor coordinate offset mapped from [0, 1].
    [`${prefix}center`]: {value: new THREE.Vector2(0.5, 0.5)},
    // Scalar multipliers scaling the bounding box stretch.
    [`${prefix}scale`]: {value: new THREE.Vector2(1, 1)},
    // Rotation scalar mapped in radians.
    [`${prefix}rotation`]: {value: 0},
    // Array containing positional steps floats.
    [`${prefix}gradientStops`]: {value: new Array(MAX_GRADIENT_STOPS).fill(0)},
    // Array containing keyed color nodes mapped concurrently with stops.
    [`${prefix}gradientColors`]: {
      value: new Array(MAX_GRADIENT_STOPS)
        .fill(null)
        .map(() => new THREE.Vector4(0, 0, 0, 1)),
    },
    // Total count of verified stops mapped inside arrays.
    [`${prefix}numStops`]: {value: 0},
  };
}

/**
 * Updates ShaderUniforms based on a Paint definition.
 * @param uniforms - The uniforms object to update.
 * @param input - The Paint definition (color or gradient) to apply.
 * @param prefix - The uniform name prefix.
 */
export function updatePaintUniforms(
  uniforms: ShaderUniforms,
  input: Paint | undefined,
  prefix: string
) {
  if (input === undefined) {
    let defColor: number | string | THREE.ColorRepresentation = 0x000000;
    let defOpacity = 0.0;

    if (prefix === 'u_fill_') {
      defColor = DEFAULT_GRADIENT_PANEL_PROPS.fillColor;
      defOpacity = 1.0;
    } else if (prefix === 'u_stroke_') {
      defColor = DEFAULT_GRADIENT_PANEL_PROPS.strokeColor;
      defOpacity = 1.0;
    }

    _setSolid(uniforms, prefix, defColor, defOpacity);
    return;
  }

  if (!_isGradient(input)) {
    const {color, opacity} = parseColorWithAlpha(
      input as THREE.ColorRepresentation
    );
    _setSolid(uniforms, prefix, color, opacity);
    return;
  }

  const gradient = input as GradientPaint;
  const stops = gradient.stops || [];

  const paintTypeU = getU(uniforms, prefix, 'paintType');
  if (paintTypeU) paintTypeU.value = PaintTypeIds.Gradient;

  const gradientTypeU = getU(uniforms, prefix, 'gradientType');
  if (gradientTypeU) {
    const typeName = (gradient.gradientType.charAt(0).toUpperCase() +
      gradient.gradientType.slice(1)) as keyof typeof GradientTypeIds;
    gradientTypeU.value = GradientTypeIds[typeName] ?? 0;
  }

  const rotationU = getU(uniforms, prefix, 'rotation');
  if (rotationU)
    rotationU.value = THREE.MathUtils.degToRad(gradient.rotation ?? 0);

  const centerU = getU(uniforms, prefix, 'center');
  if (centerU) {
    const c = gradient.center ?? [0.5, 0.5];
    if (Array.isArray(c)) centerU.value.set(c[0], c[1]);
    else centerU.value.copy(c);
  }

  const scaleU = getU(uniforms, prefix, 'scale');
  if (scaleU) {
    const s = gradient.scale ?? [1, 1];
    if (Array.isArray(s)) scaleU.value.set(s[0], s[1]);
    else scaleU.value.copy(s);
  }

  const numStops = Math.min(stops.length, MAX_GRADIENT_STOPS);
  const numStopsU = getU(uniforms, prefix, 'numStops');
  if (numStopsU) numStopsU.value = numStops;

  const gradientStopsU = getU(uniforms, prefix, 'gradientStops');
  const gradientColorsU = getU(uniforms, prefix, 'gradientColors');

  const stopPositions = gradientStopsU
    ? (gradientStopsU.value as number[])
    : [];
  const stopColors = gradientColorsU
    ? (gradientColorsU.value as THREE.Vector4[])
    : [];

  for (let i = 0; i < MAX_GRADIENT_STOPS; i++) {
    if (i < numStops) {
      const s = stops[i];
      if (stopPositions[i] !== undefined) stopPositions[i] = s.position;
      const {color, opacity} = parseColorWithAlpha(s.color);
      if (stopColors[i]) stopColors[i].set(color.r, color.g, color.b, opacity);
    } else {
      if (stopPositions[i] !== undefined) stopPositions[i] = 0;
      if (stopColors[i]) stopColors[i].set(0, 0, 0, 0);
    }
  }
}

// ==========================================
// 3. Shadow Uniforms
// ==========================================

/**
 * Creates a set of uniforms for a Shadow structure.
 * @param prefix - The prefix for uniform names (e.g., 'u_inner_shadow_', 'u_outer_shadow_').
 * @returns An object containing ShaderUniforms.
 */
export function createShadowUniforms(prefix: string): ShaderUniforms {
  return {
    ...createPaintUniforms(prefix),
    // Softness radius of the shadow blur.
    [`${prefix}blur`]: {value: 0},
    // Directional offset [x, y] of the shadow cast.
    [`${prefix}position`]: {value: new THREE.Vector2(0, 0)},
    // Scalar expansion of the shadow silhouette before blur.
    [`${prefix}spread`]: {value: 0},
    // Rate of exponential decay from core density to edge.
    [`${prefix}falloff`]: {value: 0},
  };
}

/**
 * Updates ShaderUniforms based on Shadow properties.
 * @param uniforms - The uniforms object to update.
 * @param properties - Shadow properties containing blur, position, spread, falloff.
 * @param prefix - The uniform name prefix.
 */
export function updateShadowUniforms(
  uniforms: ShaderUniforms,
  properties: {
    color?: Paint;
    blur?: number;
    position?: THREE.Vector2 | [number, number];
    spread?: number;
    falloff?: number;
  },
  prefix: string
) {
  if (properties.color !== undefined) {
    updatePaintUniforms(uniforms, properties.color, prefix);
  }

  if (properties.blur !== undefined) {
    const u = getU(uniforms, prefix, 'blur');
    if (u) u.value = properties.blur;
  }
  if (properties.spread !== undefined) {
    const u = getU(uniforms, prefix, 'spread');
    if (u) u.value = properties.spread;
  }
  if (properties.falloff !== undefined) {
    const u = getU(uniforms, prefix, 'falloff');
    if (u) u.value = properties.falloff;
  }
  if (properties.position) {
    const pos = properties.position;
    const u = getU(uniforms, prefix, 'position');
    if (u) {
      if (Array.isArray(pos)) {
        u.value.set(pos[0], pos[1]);
      } else {
        u.value.copy(pos);
      }
    }
  }
}

// ==========================================
// 4. Stroke Uniforms
// ==========================================

/**
 * Updates ShaderUniforms based on Stroke properties.
 * @param uniforms - The uniforms object to update.
 * @param properties - Stroke properties containing width and alignment.
 */
export function updateStrokeUniforms(
  uniforms: ShaderUniforms,
  properties: {
    strokeWidth?: number;
    strokeAlign?: StrokeAlign;
  }
) {
  if (uniforms.u_stroke_width && properties.strokeWidth !== undefined) {
    uniforms.u_stroke_width.value = properties.strokeWidth;
  }

  if (uniforms.u_stroke_align && properties.strokeAlign !== undefined) {
    let shaderAlign = 0.0;
    if (properties.strokeAlign === 'inside') shaderAlign = -1.0;
    else if (properties.strokeAlign === 'outside') shaderAlign = 1.0;
    uniforms.u_stroke_align.value = shaderAlign;
  }
}
