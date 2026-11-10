/**
 * TSL (node material) implementations of the XR Blocks panel shaders, used on
 * `THREE.WebGPURenderer`. Registered through `PanelMaterialFactory` when this
 * module is dynamically imported (see `Core.init`), so the base SDK never
 * statically requires `three/tsl` or `three/webgpu`.
 *
 * The materials share the exact uniform maps of their GLSL counterparts
 * (`{value}` entries, mutated in place by `GradientPanelUtils` and friends).
 */
import * as THREE from 'three';
import {MeshBasicNodeMaterial, type Node} from 'three/webgpu';
import {
  Discard,
  Fn,
  If,
  abs,
  atan,
  clamp,
  cos,
  dot,
  exp,
  float,
  fwidth,
  length,
  max,
  min,
  mix,
  normalize,
  pow,
  positionWorld,
  select,
  sin,
  smoothstep,
  sqrt,
  step,
  materialReference,
  uniform,
  uv,
  vec2,
  vec3,
  vec4,
} from 'three/tsl';

import {
  type PanelMaterial,
  type PanelMaterialOptions,
  type PanelUniforms,
  type WebGPUUIHandler,
  setWebGPUUIHandler,
} from './PanelMaterialFactory';
import {
  EDGE_GLOW_FADE_ALPHA,
  EDGE_GLOW_FADE_WIDTH,
  EDGE_GLOW_FLAT_RADIUS,
  EDGE_GLOW_PRESSED_FADE_ALPHA,
  EDGE_GLOW_PRESSED_FADE_LENGTH,
  EDGE_GLOW_PRESSED_FLAT_RADIUS,
  EDGE_GLOW_PRESSED_RADIUS,
  EDGE_GLOW_RADIUS,
  EDGE_GLOW_RIM_ALPHA,
  EDGE_GLOW_RIM_WIDTH,
  RESIZE_CORNER_ARC_GAP,
  RESIZE_CORNER_ARC_LENGTH,
  RESIZE_CORNER_ARC_PRESSED_GAP,
  RESIZE_CORNER_ARC_PRESSED_WIDTH,
  RESIZE_CORNER_ARC_WIDTH,
} from '../constants/UICardEdgeConstants';

// Mechanical GLSL->TSL port. TSL's node generics are invariant in three's
// d.ts (array element nodes and mixed vec constructors do not unify), so the
// few stubborn expressions go through `as never` / `as unknown as ...` casts
// rather than loose typing.
type Num = Node<'float'>;
type V2 = Node<'vec2'>;
type V3 = Node<'vec3'>;

type V4 = Node<'vec4'>;
type PanelUniformNode = Num | V2 | V3 | V4 | Num[] | V4[];
type PanelUniformNodes = Record<string, PanelUniformNode>;

const PI = Math.PI;
const PAINT_TYPE_SOLID = 0;
const PAINT_TYPE_GRADIENT = 1;
const GRADIENT_TYPE_RADIAL = 1;

/**
 * Maps a raw uniform value to its WGSL uniform type, mirroring what
 * `uniform(value)` infers, so `materialReference` can declare the same type.
 */
function inferUniformType(value: unknown): string {
  const v = value as {
    isVector2?: boolean;
    isVector3?: boolean;
    isVector4?: boolean;
    isColor?: boolean;
    isMatrix4?: boolean;
    isEuler?: boolean;
  };
  if (typeof value === 'boolean') return 'bool';
  if (typeof value === 'number') return 'float';
  if (v?.isVector2) return 'vec2';
  if (v?.isVector4) return 'vec4';
  if (v?.isColor) return 'vec3';
  if (v?.isVector3) return 'vec3';
  if (v?.isEuler) return 'vec3';
  if (v?.isMatrix4) return 'mat4';
  return 'float';
}

/**
 * Builds the per-material uniform bindings and returns the *graph* nodes to
 * feed the shader, without touching the source `{value}` entries on
 * `material.uniforms` (so `GradientPanelUtils` keeps mutating them in place).
 *
 * All scalars, vectors, and fixed-length gradient stop/color array elements go
 * through `materialReference('uniforms.<name>.value...', …)`, which re-reads
 * `state.material.uniforms[name].value` on every object render. That is what
 * makes structurally identical materials safe to share one node-builder state
 * (one shader build): each still draws its own values without bleeding across
 * panels.
 */
function bindUniformNodes(uniforms: PanelUniforms): PanelUniformNodes {
  const nodes: PanelUniformNodes = {};
  for (const [name, entry] of Object.entries(uniforms)) {
    const value = entry.value;
    if (Array.isArray(value)) {
      nodes[name] = value.map(
        (item, index) =>
          materialReference(
            `uniforms.${name}.value.${index}`,
            inferUniformType(item)
          ) as unknown as Num & V4
      );
    } else {
      nodes[name] = materialReference(
        'uniforms.' + name + '.value',
        inferUniformType(value)
      ) as unknown as PanelUniformNode;
    }
  }
  return nodes;
}

/**
 * three's `Node.customCacheKey()` returns `this.id`, so every distinct node
 * instance forks `material.customProgramCacheKey()`'s graph hash. Two
 * structurally identical panel materials therefore each trigger a full
 * node-graph -> WGSL build (~0.9 s each — 58 builds / 20 s in the UI sample).
 * Only nodes without a meaningful `customCacheKey` override use the id default
 * (PropertyNode/ToneMappingNode/LightsNode/RotateNode carry structural keys);
 * the graph structure is already hashed recursively by `Node.getCacheKey()`,
 * so those per-instance ids are pure noise. Rewriting them to a constant makes
 * structurally identical materials share one node-builder state (one build),
 * while named nodes keep their discriminating keys. Per-material uniform
 * values still live in each material's own uniform buffer, which three binds
 * per render object (see `objectGroup`).
 */
function structuralizeNodeKeys(root: unknown): void {
  const seen = new Set<unknown>();
  const isDefaultKey = (fn: unknown): boolean =>
    typeof fn === 'function' && String(fn).includes('this.id');
  const walk = (node: unknown): void => {
    if (!node || typeof node !== 'object' || seen.has(node)) return;
    seen.add(node);
    const n = node as {
      customCacheKey?: unknown;
      _getChildren?: (ignores: Set<unknown>) => Array<{childNode: unknown}>;
    };
    if (isDefaultKey(n.customCacheKey)) n.customCacheKey = () => '';
    let children: Array<{childNode: unknown}> = [];
    if (typeof n._getChildren === 'function') {
      children = n._getChildren(new Set()) ?? [];
    }
    for (const {childNode} of children) walk(childNode);
  };
  walk(root);
  (root as {getCacheKey?: (force?: boolean) => unknown}).getCacheKey?.(true);
}

// SDF for a rounded box in 2D (port of CommonFunctions.glsl.ts).
const sdRoundedBox = Fn(([p, b, r]: [V2, V2, Num]) => {
  const d = abs(p).sub(b.sub(r)) as unknown as V2;
  return length(max(d, 0))
    .add(min(max(d.x, d.y), 0))
    .sub(r);
});

// Port of GradientFunctions.glsl.ts.
function mixGradientStops(
  t: Num,
  numStops: Num,
  stops: Num[],
  colors: V4[]
): V4 {
  const finalT = clamp(t, 0, 1) as unknown as Num;
  const color = vec4(0, 0, 0, 0).toVar();
  If(numStops.greaterThanEqual(1), () => {
    color.assign(colors[0] as never);
    If(numStops.greaterThanEqual(2), () => {
      const matched = float(0).toVar();
      for (let i = 0; i < stops.length - 1; i++) {
        If(
          matched
            .equal(0)
            .and(float(i).lessThan(numStops.sub(1)))
            .and(finalT.greaterThanEqual(stops[i]))
            .and(finalT.lessThanEqual(stops[i + 1])),
          () => {
            const range = stops[i + 1].sub(stops[i]);
            const localT = finalT.sub(stops[i]).div(max(0.0001, range));
            color.assign(mix(colors[i], colors[i + 1], localT) as never);
            matched.assign(1);
          }
        );
      }
      If(finalT.lessThan(stops[0]), () => {
        color.assign(colors[0] as never);
      });
      for (let i = 1; i < stops.length; i++) {
        If(numStops.equal(i + 1).and(finalT.greaterThan(stops[i])), () => {
          color.assign(colors[i] as never);
        });
      }
    });
  });
  return color as unknown as V4;
}

function getGradientColor(
  uvValue: V2,
  type: Num,
  center: V2,
  scaleValue: V2,
  rotation: Num,
  numStops: Num,
  stops: Num[],
  colors: V4[]
): V4 {
  // NOTE: the GLSL early-returns (numStops < 1 / < 2) are folded into
  // mixGradientStops, which returns the same values for those cases.
  // A `return` inside `If()` in an inline Fn() is dropped by three's
  // codegen (THREE.TSL warning), so the flow must stay assignment-based.

  // Transform UV: center to origin, rotate, then scale.
  const p = uvValue.sub(center).toVar();
  const c = cos(rotation.negate());
  const s = sin(rotation.negate());
  // GLSL mat2(c, -s, s, c) is column-major.
  const px = c.mul(p.x).add(s.mul(p.y));
  const py = s.mul(p.x).negate().add(c.mul(p.y));
  p.assign(vec2(px as never, py as never) as never);

  const sx = float(0.001).toVar();
  If(abs(scaleValue.x).greaterThan(0.001), () => {
    sx.assign(scaleValue.x);
  });
  const sy = float(0.001).toVar();
  If(abs(scaleValue.y).greaterThan(0.001), () => {
    sy.assign(scaleValue.y);
  });
  p.assign(p.div(vec2(sx, sy)));

  const t = float(0).toVar();
  If(type.equal(0), () => {
    t.assign(p.x.add(0.5));
  });
  If(type.equal(1), () => {
    t.assign(length(p).mul(2));
  });
  If(type.equal(2), () => {
    t.assign(
      atan(p.y.negate(), p.x)
        .div(2 * PI)
        .add(0.5)
    );
  });
  If(type.equal(3), () => {
    t.assign(abs(p.x).add(abs(p.y)).mul(2));
  });

  return mixGradientStops(
    clamp(t, 0, 1) as unknown as Num,
    numStops,
    stops,
    colors
  );
}

function asNum(entry: PanelUniformNode): Num {
  return entry as unknown as Num;
}
function asV2(entry: PanelUniformNode): V2 {
  return entry as unknown as V2;
}
function asV4(entry: PanelUniformNode): V4 {
  return entry as unknown as V4;
}
function asNumArr(entry: PanelUniformNode): Num[] {
  return entry as unknown as Num[];
}
function asV4Arr(entry: PanelUniformNode): V4[] {
  return entry as unknown as V4[];
}

function paintColor(
  uniforms: PanelUniformNodes,
  prefix: string,
  uvValue: V2,
  radialScale?: Num
): V4 {
  const result = vec4(0, 0, 0, 0).toVar();
  const paintType = asNum(uniforms[`${prefix}paintType`]);
  If(paintType.equal(PAINT_TYPE_SOLID), () => {
    result.assign(asV4(uniforms[`${prefix}solidColor`]));
  });
  If(paintType.equal(PAINT_TYPE_GRADIENT), () => {
    const gradientType = asNum(uniforms[`${prefix}gradientType`]);
    if (radialScale !== undefined) {
      If(gradientType.equal(GRADIENT_TYPE_RADIAL), () => {
        const t = clamp(radialScale, 0, 1) as unknown as Num;
        result.assign(
          mixGradientStops(
            t,
            asNum(uniforms[`${prefix}numStops`]),
            asNumArr(uniforms[`${prefix}gradientStops`]),
            asV4Arr(uniforms[`${prefix}gradientColors`])
          )
        );
      });
      If(gradientType.notEqual(GRADIENT_TYPE_RADIAL), () => {
        result.assign(
          getGradientColor(
            uvValue,
            gradientType,
            asV2(uniforms[`${prefix}center`]),
            asV2(uniforms[`${prefix}scale`]),
            asNum(uniforms[`${prefix}rotation`]),
            asNum(uniforms[`${prefix}numStops`]),
            asNumArr(uniforms[`${prefix}gradientStops`]),
            asV4Arr(uniforms[`${prefix}gradientColors`])
          )
        );
      });
    } else {
      result.assign(
        getGradientColor(
          uvValue,
          gradientType,
          asV2(uniforms[`${prefix}center`]),
          asV2(uniforms[`${prefix}scale`]),
          asNum(uniforms[`${prefix}rotation`]),
          asNum(uniforms[`${prefix}numStops`]),
          asNumArr(uniforms[`${prefix}gradientStops`]),
          asV4Arr(uniforms[`${prefix}gradientColors`])
        )
      );
    }
  });
  return result;
}

/**
 * Port of `UnifiedGradientPanel.frag.ts`: drop shadow, fill with inner shadow,
 * stroke, and the un-premultiplied over composite.
 */
function buildUnifiedPanelMain(uniforms: PanelUniformNodes) {
  const resolution = asV2(uniforms.u_resolution);
  const uOpacity = asNum(uniforms.u_opacity);
  const cornerRadius = asNum(uniforms.u_corner_radius);
  const cornerRadii = uniforms.u_corner_radii
    ? asV4(uniforms.u_corner_radii)
    : undefined;
  const dropShadowMargin = asNum(uniforms.u_drop_shadow_margin);
  const hasFill = asNum(uniforms.u_has_fill);
  const hasStroke = asNum(uniforms.u_has_stroke);
  const hasInner = asNum(uniforms.u_has_inner_shadow);
  const hasDrop = asNum(uniforms.u_has_drop_shadow);
  const strokeWidth = asNum(uniforms.u_stroke_width);
  const strokeAlign = asNum(uniforms.u_stroke_align);

  return Fn(() => {
    const pos = uv().mul(resolution);
    const size = resolution;
    const p = pos.sub(size.mul(0.5)).toVar();
    const contentSize = size.sub(dropShadowMargin.mul(2));
    const contentHalfSize = contentSize.mul(0.5);

    const strokeShift = float(0).toVar();
    If(hasStroke.notEqual(0).and(strokeWidth.greaterThan(0.001)), () => {
      If(strokeAlign.greaterThan(0), () => {
        strokeShift.assign(strokeWidth);
      });
      If(
        strokeAlign.lessThanEqual(0).and(strokeAlign.greaterThan(-0.5)),
        () => {
          strokeShift.assign(strokeWidth.mul(0.5));
        }
      );
    });

    const rawCornerR = float(cornerRadius).toVar();
    if (cornerRadii !== undefined) {
      const pickedCornerR = float(-1).toVar();
      If(p.x.greaterThan(0), () => {
        If(p.y.greaterThan(0), () => {
          pickedCornerR.assign(cornerRadii.x);
        });
        If(p.y.lessThanEqual(0), () => {
          pickedCornerR.assign(cornerRadii.y);
        });
      });
      If(p.x.lessThanEqual(0), () => {
        If(p.y.greaterThan(0), () => {
          pickedCornerR.assign(cornerRadii.z);
        });
        If(p.y.lessThanEqual(0), () => {
          pickedCornerR.assign(cornerRadii.w);
        });
      });
      If(pickedCornerR.greaterThanEqual(0), () => {
        rawCornerR.assign(pickedCornerR);
      });
    }

    const casterHalfSize = contentHalfSize.add(vec2(strokeShift));
    const baseEffR = min(rawCornerR, min(contentHalfSize.x, contentHalfSize.y));
    const casterEffR = baseEffR.add(strokeShift);

    // 1. Drop shadow pass.
    const dropColor = vec4(0, 0, 0, 0).toVar();
    If(hasDrop.notEqual(0), () => {
      const casterDist = sdRoundedBox(p, casterHalfSize, casterEffR) as Num;
      const casterAA = fwidth(casterDist);
      const cutoutAlpha = smoothstep(
        casterAA.mul(-0.5),
        casterAA.mul(0.5),
        casterDist
      );
      If(cutoutAlpha.greaterThan(0.001), () => {
        const shadowPos = p.sub(asV2(uniforms.u_drop_position));
        const shadowDist = (
          sdRoundedBox(shadowPos, casterHalfSize, casterEffR) as Num
        ).sub(asNum(uniforms.u_drop_spread));
        const blur = max(1, asNum(uniforms.u_drop_blur));
        const shadowAlpha = float(1).sub(smoothstep(0, blur, shadowDist));
        const shadowStrength = pow(
          max(0, shadowAlpha),
          max(0.001, asNum(uniforms.u_drop_falloff))
        );
        const dc = paintColor(
          uniforms,
          'u_drop_',
          uv(),
          (
            sdRoundedBox(
              p.sub(asV2(uniforms.u_drop_position)),
              casterHalfSize,
              casterEffR
            ) as Num
          ).div(max(0.001, asNum(uniforms.u_drop_blur)))
        );
        dropColor.assign(
          vec4(dc.rgb, dc.a.mul(shadowStrength).mul(cutoutAlpha).mul(uOpacity))
        );
      });
    });

    // 2. Base fill pass + 3. inner shadow composite.
    const surfaceColor = vec4(0, 0, 0, 0).toVar();
    const dist = sdRoundedBox(p, contentHalfSize, baseEffR) as Num;
    const aa = fwidth(dist);
    const fillAlphaMask = float(1).sub(
      smoothstep(aa.mul(-0.5), aa.mul(0.5), dist)
    );
    If(fillAlphaMask.greaterThan(0.001).and(hasFill.notEqual(0)), () => {
      const fillColor = paintColor(uniforms, 'u_fill_', uv()).toVar();

      If(hasInner.notEqual(0), () => {
        const strokeInset = float(0).toVar();
        If(
          hasStroke
            .notEqual(0)
            .and(strokeWidth.greaterThan(0.001))
            .and(strokeAlign.lessThan(0.5)),
          () => {
            If(strokeAlign.lessThan(-0.5), () => {
              strokeInset.assign(strokeWidth);
            });
            If(strokeAlign.greaterThanEqual(-0.5), () => {
              strokeInset.assign(strokeWidth.mul(0.5));
            });
          }
        );

        const shadowZoneHalfSize = max(
          vec2(0, 0),
          contentHalfSize.sub(vec2(strokeInset))
        );
        const innerEffR = min(
          max(0, rawCornerR.sub(strokeInset)),
          min(shadowZoneHalfSize.x, shadowZoneHalfSize.y)
        );

        const innerDist = sdRoundedBox(p, shadowZoneHalfSize, innerEffR) as Num;
        const innerAA = fwidth(innerDist);
        const innerAlphaMask = float(1).sub(
          smoothstep(innerAA.mul(-0.5), innerAA.mul(0.5), innerDist)
        );
        If(innerAlphaMask.greaterThan(0.001), () => {
          const blur = max(0.001, asNum(uniforms.u_inner_blur));
          const totalInset = asNum(uniforms.u_inner_spread).add(blur);
          const bSmall = shadowZoneHalfSize.sub(vec2(totalInset));
          const rSmall = max(0, innerEffR.sub(totalInset));
          const pRel = p.sub(asV2(uniforms.u_inner_position));
          const dSmall = sdRoundedBox(pRel, bSmall, rSmall) as Num;
          const shadowVal = smoothstep(0, blur, dSmall);
          const shadowStrength = pow(
            clamp(shadowVal, 0, 1),
            max(0.001, asNum(uniforms.u_inner_falloff))
          );

          const innerRadialT = clamp(
            (
              sdRoundedBox(
                p.sub(asV2(uniforms.u_inner_position)),
                contentHalfSize,
                baseEffR
              ) as Num
            )
              .negate()
              .div(max(0.001, asNum(uniforms.u_inner_blur))),
            0,
            1
          ) as unknown as Num;
          const innerColor = paintColor(
            uniforms,
            'u_inner_',
            uv(),
            innerRadialT
          );

          const innerFinalA = innerColor.a
            .mul(shadowStrength)
            .mul(innerAlphaMask);
          fillColor.assign(
            vec4(
              mix(fillColor.rgb, innerColor.rgb, innerFinalA),
              max(fillColor.a, innerFinalA)
            )
          );
        });
      });

      surfaceColor.assign(
        vec4(fillColor.rgb, fillColor.a.mul(fillAlphaMask).mul(uOpacity))
      );
    });

    // 4. Stroke pass.
    const strokeResult = vec4(0, 0, 0, 0).toVar();
    If(hasStroke.notEqual(0).and(strokeWidth.greaterThan(0.001)), () => {
      const shift = strokeAlign.mul(strokeWidth.mul(0.5));
      const dStroke = dist.sub(shift);
      const strokeDist = abs(dStroke).sub(strokeWidth.mul(0.5));
      const strokeAA = fwidth(dist);
      const strokeMask = float(1).sub(
        smoothstep(strokeAA.mul(-0.5), strokeAA.mul(0.5), strokeDist)
      );
      If(strokeMask.greaterThan(0.001), () => {
        const strokeColor = paintColor(uniforms, 'u_stroke_', uv());
        strokeResult.assign(
          vec4(strokeColor.rgb, strokeColor.a.mul(strokeMask).mul(uOpacity))
        );
      });
    });

    // 5. Final un-premultiplied over composite.
    const color = vec4(0, 0, 0, 0).toVar();
    const surfaceOverDropA = surfaceColor.a.add(
      dropColor.a.mul(float(1).sub(surfaceColor.a))
    );
    If(surfaceOverDropA.greaterThan(0.0001), () => {
      color.assign(
        vec4(
          surfaceColor.rgb
            .mul(surfaceColor.a)
            .add(
              dropColor.rgb.mul(dropColor.a).mul(float(1).sub(surfaceColor.a))
            )
            .div(surfaceOverDropA),
          surfaceOverDropA
        )
      );
    });

    If(strokeResult.a.greaterThan(0.0001), () => {
      const finalA = strokeResult.a.add(
        color.a.mul(float(1).sub(strokeResult.a))
      );
      If(finalA.greaterThan(0.0001), () => {
        color.assign(
          vec4(
            strokeResult.rgb
              .mul(strokeResult.a)
              .add(color.rgb.mul(color.a).mul(float(1).sub(strokeResult.a)))
              .div(finalA),
            finalA
          )
        );
      });
    });

    If(color.a.lessThan(0.001), () => {
      Discard();
    });
    return color as unknown as V4;
  });
}

/**
 * Port of `UICardEdge.frag.ts`: the hover-lit manipulation edge around a card.
 */
function buildCardEdgeMain(uniforms: PanelUniformNodes) {
  const resolution = asV2(uniforms.u_resolution);
  const uOpacity = asNum(uniforms.u_opacity);
  const cardCornerRadius = asNum(uniforms.u_card_corner_radius);
  const edgeMargin = asNum(uniforms.u_edge_margin);
  const spotlightColor = asV4(uniforms.u_cursor_spotlight_color);
  const cursorUv = asV2(uniforms.u_cursor_uv);
  const showGlow = asNum(uniforms.u_show_glow);
  const glowPressLength = asNum(uniforms.u_glow_press_length);
  const glowPressFillValue = asNum(uniforms.u_glow_press_fill);
  const cursorUv2 = asV2(uniforms.u_cursor_uv_2);
  const showGlow2 = asNum(uniforms.u_show_glow_2);
  const glowPressLength2 = asNum(uniforms.u_glow_press_length_2);
  const glowPressFillValue2 = asNum(uniforms.u_glow_press_fill_2);
  const pressedRimColor = asV4(uniforms.u_glow_pressed_rim_color);
  const pressedFillColor = asV4(uniforms.u_glow_pressed_fill_color);
  const uDebug = asNum(uniforms.u_debug);
  const cornerColor = asV4(uniforms.u_corner_color);
  const cornerSign = asV2(uniforms.u_corner_sign);
  const cornerAlpha = asNum(uniforms.u_corner_alpha);
  const cornerPress = asNum(uniforms.u_corner_press);
  const cornerSign2 = asV2(uniforms.u_corner_sign_2);
  const cornerAlpha2 = asNum(uniforms.u_corner_alpha_2);
  const cornerPress2 = asNum(uniforms.u_corner_press_2);

  // Matches cornerArc in UICardEdge.frag.ts.
  const cornerArc = Fn(
    ([p, corner, alpha, press, innerHalfSize, innerRadius, aa]: [
      V2,
      V2,
      Num,
      Num,
      V2,
      Num,
      Num,
    ]) => {
      const result = float(0).toVar();
      If(
        alpha
          .greaterThan(0)
          .and(p.x.mul(corner.x).greaterThanEqual(0))
          .and(p.y.mul(corner.y).greaterThanEqual(0)),
        () => {
          const halfAngle = min(
            Math.PI / 4,
            float(0.5 * RESIZE_CORNER_ARC_LENGTH).div(
              innerRadius.add(RESIZE_CORNER_ARC_GAP)
            )
          );
          const radius = innerRadius.add(
            mix(
              float(RESIZE_CORNER_ARC_GAP),
              float(RESIZE_CORNER_ARC_PRESSED_GAP),
              press
            )
          );
          const q = abs(p).sub(innerHalfSize.sub(vec2(innerRadius)));
          const angle = clamp(
            atan(q.y, q.x),
            float(Math.PI / 4).sub(halfAngle),
            float(Math.PI / 4).add(halfAngle)
          );
          const d = length(q.sub(vec2(cos(angle), sin(angle)).mul(radius)));
          const halfWidth = mix(
            float(RESIZE_CORNER_ARC_WIDTH),
            float(RESIZE_CORNER_ARC_PRESSED_WIDTH),
            press
          ).mul(0.5);
          result.assign(
            alpha.mul(
              float(1).sub(smoothstep(halfWidth.sub(aa), halfWidth.add(aa), d))
            )
          );
        }
      );
      return result;
    }
  );

  // Matches edgeRimPoint in UICardEdge.frag.ts.
  const edgeRimPoint = Fn(
    ([p, innerHalfSize, innerRadius, halfSize, outerRadius]: [
      V2,
      V2,
      Num,
      V2,
      Num,
    ]) => {
      const a = abs(p) as unknown as V2;
      const v = a.sub(innerHalfSize.sub(innerRadius)) as unknown as V2;
      const n = select(
        min(v.x, v.y).greaterThan(0),
        normalize(v),
        select(v.x.greaterThan(v.y), vec2(1, 0), vec2(0, 1))
      ) as unknown as V2;
      const center = halfSize.sub(outerRadius) as unknown as V2;
      const toLine = halfSize
        .sub(a)
        .div(max(n, vec2(0.0001, 0.0001))) as unknown as V2;
      const w = a.sub(center);
      const b = dot(w, n);
      const toCircle = sqrt(
        max(0, b.mul(b).sub(dot(w, w)).add(outerRadius.mul(outerRadius)))
      ).sub(b);
      const t = select(
        a.x.add(n.x.mul(toLine.y)).lessThanEqual(center.x),
        toLine.y,
        select(
          a.y.add(n.y.mul(toLine.x)).lessThanEqual(center.y),
          toLine.x,
          toCircle
        )
      );
      return step(0, p)
        .mul(2)
        .sub(1)
        .mul(a.add(n.mul(t)));
    }
  );

  // Matches edgeGlowWindow in UICardEdge.frag.ts.
  const edgeGlowWindow = Fn(
    ([p, cursorP, innerHalfSize, innerRadius, halfSize, outerRadius, press]: [
      V2,
      V2,
      V2,
      Num,
      V2,
      Num,
      Num,
    ]) => {
      const rimP = edgeRimPoint(
        p,
        innerHalfSize,
        innerRadius,
        halfSize,
        outerRadius
      ) as V2;
      const dist = length(rimP.sub(cursorP));
      const flatRadius = mix(
        float(EDGE_GLOW_FLAT_RADIUS),
        float(EDGE_GLOW_PRESSED_FLAT_RADIUS),
        press
      );
      const glowRadius = mix(
        float(EDGE_GLOW_RADIUS),
        float(EDGE_GLOW_PRESSED_RADIUS),
        press
      );
      return float(1).sub(
        clamp(dist.sub(flatRadius).div(glowRadius.sub(flatRadius)), 0, 1)
      );
    }
  );

  return Fn(() => {
    const pixelRes = resolution;
    const pos = uv().mul(pixelRes);
    const sizeValue = pixelRes;
    const p = pos.sub(sizeValue.mul(0.5));
    const halfSize = sizeValue.mul(0.5);

    const margin = max(0, edgeMargin);
    const innerHalfSize = max(vec2(0, 0), halfSize.sub(vec2(margin)));
    const innerRadius = min(
      max(0, cardCornerRadius),
      min(innerHalfSize.x, innerHalfSize.y)
    );
    // Like Android XR, the band's outer corners are centred on the card's
    // sharp corners rather than on its rounded ones.
    const outerRadius = min(margin, min(halfSize.x, halfSize.y));
    const distToEdge = sdRoundedBox(p, halfSize, outerRadius) as Num;

    const aa = fwidth(distToEdge);
    const alphaMask = float(1).sub(
      smoothstep(aa.mul(-0.5), aa.mul(0.5), distToEdge)
    );
    If(alphaMask.lessThan(0.001), () => {
      Discard();
    });

    const debugColor = vec4(0, 0, 0, 0).toVar();

    const distToInner = sdRoundedBox(p, innerHalfSize, innerRadius) as Num;
    const innerAA = fwidth(distToInner);
    const edgeBandMask = smoothstep(
      innerAA.mul(-0.5),
      innerAA.mul(0.5),
      distToInner
    );

    If(uDebug.greaterThan(0.5), () => {
      If(distToInner.lessThan(0), () => {
        debugColor.assign(vec4(0, 1, 0, 0.4));
      });
      If(distToInner.greaterThanEqual(0).and(distToEdge.lessThan(0)), () => {
        debugColor.assign(vec4(1, 0, 0, 0.4));
      });
      debugColor.assign(vec4(debugColor.rgb, debugColor.a.mul(alphaMask)));
    });

    const accumColor = vec4(0, 0, 0, 0).toVar();
    const glowWindow = float(0).toVar();
    const glowWeight = float(0).toVar();
    const glowPressFill = float(0).toVar();

    If(showGlow.greaterThan(0), () => {
      const slotWindow = showGlow
        .mul(
          edgeGlowWindow(
            p,
            cursorUv.mul(sizeValue).sub(halfSize),
            innerHalfSize,
            innerRadius,
            halfSize,
            outerRadius,
            glowPressLength
          ) as Num
        )
        .toVar();
      glowWindow.assign(max(glowWindow, slotWindow));
      glowWeight.addAssign(slotWindow);
      glowPressFill.addAssign(slotWindow.mul(glowPressFillValue));
    });
    If(showGlow2.greaterThan(0), () => {
      const slotWindow = showGlow2
        .mul(
          edgeGlowWindow(
            p,
            cursorUv2.mul(sizeValue).sub(halfSize),
            innerHalfSize,
            innerRadius,
            halfSize,
            outerRadius,
            glowPressLength2
          ) as Num
        )
        .toVar();
      glowWindow.assign(max(glowWindow, slotWindow));
      glowWeight.addAssign(slotWindow);
      glowPressFill.addAssign(slotWindow.mul(glowPressFillValue2));
    });

    // Where two glows overlap, blend their press states by window strength.
    glowPressFill.divAssign(max(glowWeight, 0.001));

    // A thin rim on the band's outer border over a fill toward the card: a
    // quadratic fade while hovered, an exponential one reaching the card when
    // pressed.
    const rimCoverage = smoothstep(
      float(-EDGE_GLOW_RIM_WIDTH).sub(aa),
      -EDGE_GLOW_RIM_WIDTH,
      distToEdge
    );
    const rim = rimCoverage.mul(EDGE_GLOW_RIM_ALPHA);
    const inward = max(0, distToEdge.negate().sub(EDGE_GLOW_RIM_WIDTH));
    const hoverFade = max(0, float(1).sub(inward.div(EDGE_GLOW_FADE_WIDTH)));
    const fade = mix(
      hoverFade.mul(hoverFade).mul(EDGE_GLOW_FADE_ALPHA),
      exp(inward.negate().div(EDGE_GLOW_PRESSED_FADE_LENGTH)).mul(
        EDGE_GLOW_PRESSED_FADE_ALPHA
      ),
      glowPressFill
    );
    const glowAlpha = glowWindow.mul(max(rim, fade)).mul(edgeBandMask);

    const corner = max(
      cornerArc(
        p,
        cornerSign,
        cornerAlpha,
        cornerPress,
        innerHalfSize,
        innerRadius,
        aa
      ) as Num,
      cornerArc(
        p,
        cornerSign2,
        cornerAlpha2,
        cornerPress2,
        innerHalfSize,
        innerRadius,
        aa
      ) as Num
    );

    If(glowAlpha.greaterThan(0.001).or(corner.greaterThan(0)), () => {
      const hoverRGB = spotlightColor.rgb;
      const glow = vec4(
        mix(
          mix(hoverRGB, pressedFillColor.rgb, glowPressFill),
          mix(hoverRGB, pressedRimColor.rgb, glowPressFill),
          rimCoverage
        ),
        spotlightColor.a.mul(glowAlpha)
      ).toVar();

      If(glow.a.greaterThan(0), () => {
        const dstA = accumColor.a;
        const srcA = glow.a;
        const outA = srcA.add(dstA.mul(float(1).sub(srcA)));
        const outRGB = vec3(0, 0, 0).toVar();
        If(outA.greaterThan(0.001), () => {
          outRGB.assign(
            glow.rgb
              .mul(srcA)
              .add(accumColor.rgb.mul(dstA).mul(float(1).sub(srcA)))
              .div(outA)
          );
        });
        accumColor.assign(vec4(outRGB, outA));
      });

      const edgeResult = vec4(0, 0, 0, 0).toVar();

      // The hovered resize corner's arc, drawn over the glow.
      If(corner.greaterThan(0), () => {
        const arcA = cornerColor.a.mul(corner);
        const dstA = edgeResult.a;
        const outA = arcA.add(dstA.mul(float(1).sub(arcA)));
        edgeResult.assign(
          vec4(
            cornerColor.rgb
              .mul(arcA)
              .add(edgeResult.rgb.mul(dstA).mul(float(1).sub(arcA)))
              .div(max(outA, 0.001)),
            outA
          )
        );
      });

      If(edgeResult.a.greaterThan(0), () => {
        const dstA = accumColor.a;
        const srcA = edgeResult.a;
        const outA = srcA.add(dstA.mul(float(1).sub(srcA)));
        const outRGB = vec3(0, 0, 0).toVar();
        If(outA.greaterThan(0.001), () => {
          outRGB.assign(
            edgeResult.rgb
              .mul(srcA)
              .add(accumColor.rgb.mul(dstA).mul(float(1).sub(srcA)))
              .div(outA)
          );
        });
        accumColor.assign(vec4(outRGB, outA));
      });
    });

    accumColor.assign(vec4(accumColor.rgb, accumColor.a.mul(alphaMask)));

    If(uDebug.greaterThan(0.5), () => {
      accumColor.assign(
        mix(accumColor, debugColor, debugColor.a) as unknown as V4
      );
      accumColor.assign(vec4(accumColor.rgb, max(accumColor.a, debugColor.a)));
    });

    accumColor.assign(vec4(accumColor.rgb, accumColor.a.mul(uOpacity)));
    return accumColor as unknown as V4;
  });
}

function createNodeMaterial(
  main: V4,
  options: PanelMaterialOptions,
  kind: 'unified' | 'edge'
): PanelMaterial {
  const material = new MeshBasicNodeMaterial({
    transparent: true,
    side: options.side ?? THREE.FrontSide,
    fog: false,
  });
  // r186 node materials only consume renderer/ClippingGroup planes. UIKit's
  // Custom supplies four live world-space planes on the material instead.
  // Read the rendered material, not this closure's material: panels share a
  // node-builder state. Snapshot each plane because UIKit's RelativePlane
  // getters reuse a scratch Vector3 across all four normals.
  const planes = Array.from({length: 4}, (_, i) =>
    uniform(new THREE.Vector4(0, 0, 0, 1))
      .setName(`xbPanelClip${i}`)
      .onObjectUpdate(({material: renderedMaterial}, node) => {
        const plane = renderedMaterial?.clippingPlanes?.[i];
        if (!plane) return node.value.set(0, 0, 0, 1);
        const {x, y, z} = plane.normal;
        return node.value.set(x, y, z, plane.constant);
      })
  );
  material.colorNode = Fn(() => {
    for (const plane of planes) {
      // Same retained half-space as GLSL clipping_planes_fragment.
      Discard(positionWorld.dot(plane.xyz).add(plane.w).lessThan(0));
    }
    return main;
  })();
  structuralizeNodeKeys(material.colorNode);
  // The clipping wrapper's lazy Fn captures `main`; that closure is not part
  // of three's graph hash. Keep fills and edges in distinct cache entries.
  const nodeCacheKey = material.customProgramCacheKey.bind(material);
  material.customProgramCacheKey = () => `xbPanel:${kind}:v1:${nodeCacheKey()}`;
  material.depthWrite = options.depthWrite ?? true;
  material.forceSinglePass = true;
  material.dithering = true;
  material.toneMapped = false;
  (material as unknown as {uniforms: PanelUniforms}).uniforms =
    options.uniforms;
  return material as unknown as PanelMaterial;
}

export const webgpuUIHandler: WebGPUUIHandler = {
  createUnifiedPanelMaterial(options) {
    const nodes = bindUniformNodes(options.uniforms);
    // Fn(...) returns a factory; invoke it to build the node graph.
    return createNodeMaterial(
      buildUnifiedPanelMain(nodes)(),
      options,
      'unified'
    );
  },
  createCardEdgeMaterial(options) {
    const nodes = bindUniformNodes(options.uniforms);
    return createNodeMaterial(
      buildCardEdgeMain(nodes)(),
      {
        ...options,
        side: options.side ?? THREE.DoubleSide,
        depthWrite: options.depthWrite ?? false,
      },
      'edge'
    );
  },
};

/**
 * The uikit WebGPU registry's panel conversion treats `material.colorNode` as
 * the diffuse *source*, and uikit's Image component re-runs `applyPanelMaterial`
 * whenever its texture updates. On that second pass the source is the previous
 * conversion's own `res.rgb` — a vec3 swizzle without alpha — so the texture's
 * alpha is lost and transparent canvas textures render as solid black bars.
 * Re-running with the map as the source restores the alpha. Installed here so
 * any app that enables WebGPU UI gets the fix; harmless without the registry.
 */
interface UikitWebGPURegistry {
  getWebGPUHandlers?: () => Record<string, unknown> | undefined;
  setWebGPUHandlers?: (handlers: Record<string, unknown>) => void;
}

interface ConvertiblePanelMaterial {
  colorNode?: unknown;
  customProgramCacheKey?: () => string;
  __xbTslPanelApplied?: boolean;
}

let cacheSalt = 0;
const panelCacheKeys = new WeakMap<
  ConvertiblePanelMaterial,
  {source: () => string; salt: number; revision: number}
>();

try {
  const registrySpecifier = '@pmndrs/uikit/webgpu';
  const registry = (await import(
    /* @vite-ignore */ registrySpecifier
  )) as UikitWebGPURegistry;
  const current = registry.getWebGPUHandlers?.();
  const applyPanelMaterial = current?.applyPanelMaterial as
    | ((material: ConvertiblePanelMaterial, info: unknown) => void)
    | undefined;
  if (registry.setWebGPUHandlers && applyPanelMaterial) {
    registry.setWebGPUHandlers({
      ...current,
      applyPanelMaterial: (
        material: ConvertiblePanelMaterial,
        info: unknown
      ): void => {
        // Always rebuild from the current map/gradient: the builder treats
        // material.colorNode as its diffuse *source*, so feeding it the
        // previous conversion's output loses the texture alpha.
        material.colorNode = undefined;
        // The image panels all share one customProgramCacheKey (their
        // onBeforeCompile source), which lets the WebGPU pipeline cache
        // reuse another panel's built bindings — textures then render as
        // whichever panel compiled first. The fork's builder pattern-matches
        // on that key, so show it the pristine value and salt the key that
        // the renderer caches by afterwards.
        let cache = panelCacheKeys.get(material);
        if (!cache) {
          cache = {
            source:
              material.customProgramCacheKey?.bind(material) ?? (() => ''),
            salt: ++cacheSalt,
            revision: 0,
          };
          panelCacheKeys.set(material, cache);
        }
        material.customProgramCacheKey = cache.source;
        applyPanelMaterial(material, info);
        const key = cache.source();
        // Textured panels keep a per-material cache-key salt: three's
        // material key fingerprints textures by sampler params only, so two
        // images with equal sampler settings would otherwise share bindings
        // and sample whichever texture compiled first.
        if ((material as {map?: unknown}).map) {
          // Rebuilt texture nodes need fresh bindings. Replace one revision
          // suffix instead of wrapping yesterday's already-salted key on
          // every src change (which also hid the source key from the builder).
          const revision = ++cache.revision;
          const salt = cache.salt;
          material.customProgramCacheKey = () =>
            `${key}|xbTsl#${salt}:${revision}`;
        }
        material.__xbTslPanelApplied = true;
      },
    });
  }
} catch {
  // uikit without the WebGPU registry: nothing to fix.
}

// Importing this module enables the TSL materials (mirrors the
// `@david18284/uikit/webgpu` enable-module pattern).
setWebGPUUIHandler(webgpuUIHandler);
