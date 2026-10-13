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
  distance,
  exp,
  float,
  fwidth,
  length,
  max,
  min,
  mix,
  pow,
  sin,
  smoothstep,
  materialReference,
  uniformArray,
  uv,
  vec2,
  vec3,
  vec4,
} from 'three/tsl';

import {
  type PanelMaterial,
  type PanelMaterialOptions,
  type PanelUniformEntry,
  type PanelUniforms,
  type WebGPUUIHandler,
  setWebGPUUIHandler,
} from './PanelMaterialFactory';
import {
  MAX_RESIZE_CORNER_FRACTION,
  RESIZE_CORNER_SIDE_MARGINS,
  RESIZE_CORNER_EDGE_WIDTH_SCALE,
} from '../constants/UICardEdgeConstants';

// Mechanical GLSL->TSL port. TSL's node generics are invariant in three's
// d.ts (array element nodes and mixed vec constructors do not unify), so the
// few stubborn expressions go through `as never` / `as unknown as ...` casts
// rather than loose typing.
type Num = Node<'float'>;
type V2 = Node<'vec2'>;
type V3 = Node<'vec3'>;

type V4 = Node<'vec4'>;
type Arr = ReturnType<typeof uniformArray>;

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
 * Scalars/vectors go through `materialReference('uniforms.<name>.value', …)`,
 * which re-reads `state.material.uniforms[name].value` on every render. That is
 * what makes structurally identical materials safe to share one node-builder
 * state (one shader build): each still draws its own values. A plain
 * `uniform(value)` node holds a single value slot, so when the build is shared
 * every material reads whichever material compiled first — the value bleed.
 * Arrays stay on `UniformArrayNode` (mutated in place, re-uploaded per render).
 */
function bindUniformNodes(uniforms: PanelUniforms): PanelUniforms {
  const nodes: PanelUniforms = {};
  for (const [name, entry] of Object.entries(uniforms)) {
    const value = entry.value;
    if (Array.isArray(value)) {
      const node = uniformArray(value as never) as unknown as PanelUniformEntry;
      // Alias for the {value} contract used by GradientPanelUtils.
      node.value = value;
      uniforms[name] = node;
      nodes[name] = node;
    } else {
      nodes[name] = materialReference(
        'uniforms.' + name + '.value',
        inferUniformType(value)
      ) as unknown as PanelUniformEntry;
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

/**
 * The GLSL panel shaders write `gl_FragColor` raw (no `<colorspace_fragment>`)
 * and blend in byte space; WebGPU blends inside an sRGB framebuffer, i.e. in
 * linear space. Decoding the output with the exact sRGB EOTF makes the covered
 * fraction match exactly (EOTF then OETF is identity) and approximates the
 * byte-space blend well where the fill is close to what it covers — the common
 * glass-over-panel case. Over a very different backdrop the two blend spaces
 * still differ slightly; that residual is a WebGPU platform difference.
 */
const rawOutput = (c: V3): V3 => {
  const decode = (x: Num): Num =>
    mix(
      x.div(12.92),
      pow(x.add(0.055).div(1.055), 2.4),
      float(x.greaterThanEqual(0.04045))
    ) as unknown as Num;
  return vec3(decode(c.x), decode(c.y), decode(c.z)) as unknown as V3;
};

// Port of GradientFunctions.glsl.ts.
const mixGradientStops = Fn(
  ([t, numStops, stops, colors]: [Num, Num, Arr, Arr]) => {
    const stop = (i: number | Num): Num => stops.element(i) as unknown as Num;
    const colorOf = (i: number | Num): V4 => colors.element(i) as unknown as V4;
    const finalT = clamp(t, 0, 1) as unknown as Num;
    const color = vec4(0, 0, 0, 0).toVar();
    If(numStops.greaterThanEqual(1), () => {
      color.assign(colorOf(0) as never);
      If(numStops.greaterThanEqual(2), () => {
        const matched = float(0).toVar();
        for (let i = 0; i < 3; i++) {
          If(
            matched
              .equal(0)
              .and(finalT.greaterThanEqual(stop(i)))
              .and(finalT.lessThanEqual(stop(i + 1))),
            () => {
              const range = stop(i + 1).sub(stop(i));
              const localT = finalT.sub(stop(i)).div(max(0.0001, range));
              color.assign(mix(colorOf(i), colorOf(i + 1), localT) as never);
              matched.assign(1);
            }
          );
        }
        If(finalT.lessThan(stop(0)), () => {
          color.assign(colorOf(0) as never);
        });
        If(finalT.greaterThan(stop(numStops.sub(1))), () => {
          color.assign(colorOf(numStops.sub(1)) as never);
        });
      });
    });
    return color as unknown as V4;
  }
);

const getGradientColor = Fn(
  ([uvValue, type, center, scaleValue, rotation, numStops, stops, colors]: [
    V2,
    Num,
    V2,
    V2,
    Num,
    Num,
    Arr,
    Arr,
  ]) => {
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
      clamp(t, 0, 1),
      numStops,
      stops,
      colors
    ) as unknown as V4;
  }
);

function asNum(entry: PanelUniformEntry): Num {
  return entry as unknown as Num;
}
function asV2(entry: PanelUniformEntry): V2 {
  return entry as unknown as V2;
}
function asV4(entry: PanelUniformEntry): V4 {
  return entry as unknown as V4;
}
function asArr(entry: PanelUniformEntry): Arr {
  return entry as unknown as Arr;
}

function paintColor(
  uniforms: PanelUniforms,
  prefix: string,
  uvValue: V2,
  radialScale: Num
): V4 {
  const result = vec4(0, 0, 0, 0).toVar();
  const paintType = asNum(uniforms[`${prefix}paintType`]);
  If(paintType.equal(PAINT_TYPE_SOLID), () => {
    result.assign(asV4(uniforms[`${prefix}solidColor`]));
  });
  If(paintType.equal(PAINT_TYPE_GRADIENT), () => {
    const gradientType = asNum(uniforms[`${prefix}gradientType`]);
    If(gradientType.equal(GRADIENT_TYPE_RADIAL), () => {
      const t = clamp(radialScale, 0, 1);
      result.assign(
        mixGradientStops(
          t,
          asNum(uniforms[`${prefix}numStops`]),
          asArr(uniforms[`${prefix}gradientStops`]),
          asArr(uniforms[`${prefix}gradientColors`])
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
          asArr(uniforms[`${prefix}gradientStops`]),
          asArr(uniforms[`${prefix}gradientColors`])
        ) as unknown as V4
      );
    });
  });
  return result;
}

/**
 * Port of `UnifiedGradientPanel.frag.ts`: drop shadow, fill with inner shadow,
 * stroke, and the un-premultiplied over composite.
 */
function buildUnifiedPanelMain(uniforms: PanelUniforms) {
  const resolution = asV2(uniforms.u_resolution);
  const uOpacity = asNum(uniforms.u_opacity);
  const cornerRadius = asNum(uniforms.u_corner_radius);
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

    const casterHalfSize = contentHalfSize.add(vec2(strokeShift));
    const baseEffR = min(
      cornerRadius,
      min(contentHalfSize.x, contentHalfSize.y)
    );
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
      const fillColor = paintColor(uniforms, 'u_fill_', uv(), float(0)).toVar();

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
          max(0, cornerRadius.sub(strokeInset)),
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
          );
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
        const strokeColor = paintColor(uniforms, 'u_stroke_', uv(), float(0));
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
    return vec4(rawOutput(color.rgb), color.a) as unknown as V4;
  });
}

/**
 * Port of `UICardEdge.frag.ts`: the hover-lit manipulation edge around a card.
 */
function buildCardEdgeMain(uniforms: PanelUniforms) {
  const resolution = asV2(uniforms.u_resolution);
  const uOpacity = asNum(uniforms.u_opacity);
  const cardCornerRadius = asNum(uniforms.u_card_corner_radius);
  const edgeMargin = asNum(uniforms.u_edge_margin);
  const edgeWidth = asNum(uniforms.u_edge_width);
  const spotlightColor = asV4(uniforms.u_cursor_spotlight_color);
  const cursorRadius = asNum(uniforms.u_cursor_radius);
  const spotlightBlur = asNum(uniforms.u_cursor_spotlight_blur);
  const cursorUv = asV2(uniforms.u_cursor_uv);
  const showGlow = asNum(uniforms.u_show_glow);
  const cursorUv2 = asV2(uniforms.u_cursor_uv_2);
  const showGlow2 = asNum(uniforms.u_show_glow_2);
  const uDebug = asNum(uniforms.u_debug);
  const uResizable = asNum(uniforms.u_resizable);

  const cornerHighlight = Fn(
    ([
      p,
      cursorUvValue,
      showCursor,
      sizeValue,
      cornerStart,
      innerHalfSize,
      innerRadius,
    ]: [V2, V2, Num, V2, V2, V2, Num]) => {
      const result = float(0).toVar();
      If(showCursor.greaterThanEqual(0.5), () => {
        const cursor = cursorUvValue.mul(sizeValue).sub(sizeValue.mul(0.5));
        If(
          (
            sdRoundedBox(cursor, innerHalfSize, innerRadius) as Num
          ).greaterThanEqual(0),
          () => {
            const ap = abs(p);
            const ac = abs(cursor);
            const fragmentInCorner = ap.x
              .greaterThanEqual(cornerStart.x)
              .and(ap.y.greaterThanEqual(cornerStart.y));
            const cursorInCorner = ac.x
              .greaterThanEqual(cornerStart.x)
              .and(ac.y.greaterThanEqual(cornerStart.y));
            const signX = float(0).toVar();
            If(p.x.greaterThan(0), () => {
              signX.assign(1);
            });
            If(p.x.lessThan(0), () => {
              signX.assign(-1);
            });
            const signY = float(0).toVar();
            If(p.y.greaterThan(0), () => {
              signY.assign(1);
            });
            If(p.y.lessThan(0), () => {
              signY.assign(-1);
            });
            const csX = float(0).toVar();
            If(cursor.x.greaterThan(0), () => {
              csX.assign(1);
            });
            If(cursor.x.lessThan(0), () => {
              csX.assign(-1);
            });
            const csY = float(0).toVar();
            If(cursor.y.greaterThan(0), () => {
              csY.assign(1);
            });
            If(cursor.y.lessThan(0), () => {
              csY.assign(-1);
            });
            const sameCorner = signX.equal(csX).and(signY.equal(csY));
            If(fragmentInCorner.and(cursorInCorner).and(sameCorner), () => {
              result.assign(1);
            });
          }
        );
      });
      return result;
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
    const outerRadius = min(
      innerRadius.add(margin),
      min(halfSize.x, halfSize.y)
    );
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
    const glowAlpha = float(0).toVar();

    If(showGlow.greaterThan(0.5), () => {
      const cursorPos = cursorUv.mul(sizeValue);
      const distToCursor = distance(pos, cursorPos);
      const sigma = max(10, cursorRadius.add(spotlightBlur));
      const d2 = distToCursor.mul(distToCursor);
      glowAlpha.assign(max(glowAlpha, exp(d2.mul(-0.5).div(sigma.mul(sigma)))));
    });
    If(showGlow2.greaterThan(0.5), () => {
      const cursorPos2 = cursorUv2.mul(sizeValue);
      const distToCursor2 = distance(pos, cursorPos2);
      const sigma = max(10, cursorRadius.add(spotlightBlur));
      const d2 = distToCursor2.mul(distToCursor2);
      glowAlpha.assign(max(glowAlpha, exp(d2.mul(-0.5).div(sigma.mul(sigma)))));
    });

    glowAlpha.assign(glowAlpha.mul(edgeBandMask));

    const corner = float(0).toVar();
    If(uResizable.greaterThan(0.5), () => {
      const cornerExtent = min(
        vec2(innerRadius.add(float(RESIZE_CORNER_SIDE_MARGINS).mul(margin))),
        halfSize.mul(MAX_RESIZE_CORNER_FRACTION)
      );
      const cornerStart = halfSize.sub(cornerExtent);
      corner.assign(
        max(
          cornerHighlight(
            p,
            cursorUv,
            showGlow,
            sizeValue,
            cornerStart,
            innerHalfSize,
            innerRadius
          ) as Num,
          cornerHighlight(
            p,
            cursorUv2,
            showGlow2,
            sizeValue,
            cornerStart,
            innerHalfSize,
            innerRadius
          ) as Num
        )
      );
    });

    If(glowAlpha.greaterThan(0.001).or(corner.greaterThan(0)), () => {
      const glow = vec4(spotlightColor).toVar();
      glow.assign(vec4(glow.rgb, glow.a.mul(glowAlpha)));

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

      const width = edgeWidth.mul(
        mix(1, RESIZE_CORNER_EDGE_WIDTH_SCALE, corner)
      );
      const edgeMask = smoothstep(
        width.negate().sub(aa),
        width.negate(),
        distToEdge
      );
      const edgeOpacity = max(glowAlpha, corner);

      const edgeResult = vec4(0, 0, 0, 0).toVar();
      If(edgeMask.greaterThan(0).and(edgeOpacity.greaterThan(0)), () => {
        const edgeColor = vec4(spotlightColor);
        edgeResult.assign(
          vec4(edgeColor.rgb, edgeColor.a.mul(edgeOpacity).mul(edgeMask))
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
    return vec4(rawOutput(accumColor.rgb), accumColor.a) as unknown as V4;
  });
}

function createNodeMaterial(
  main: unknown,
  options: PanelMaterialOptions
): PanelMaterial {
  const material = new MeshBasicNodeMaterial({
    transparent: true,
    side: options.side ?? THREE.FrontSide,
  });
  material.colorNode = main as never;
  structuralizeNodeKeys(main);
  // `clipping` exists on THREE.Material at runtime; the node material d.ts
  // omits it.
  (material as unknown as {clipping: boolean}).clipping = true;
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
    return createNodeMaterial(buildUnifiedPanelMain(nodes)(), options);
  },
  createCardEdgeMaterial(options) {
    const nodes = bindUniformNodes(options.uniforms);
    return createNodeMaterial(buildCardEdgeMain(nodes)(), options);
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
  __xbTslCacheSalt?: number;
}

let cacheSalt = 0;

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
        const originalKey = material.customProgramCacheKey?.bind(material);
        if (originalKey) material.customProgramCacheKey = originalKey;
        applyPanelMaterial(material, info);
        const key = originalKey ? originalKey() : '';
        // Textured panels keep a per-material cache-key salt: three's
        // material key fingerprints textures by sampler params only, so two
        // images with equal sampler settings would otherwise share bindings
        // and sample whichever texture compiled first.
        if ((material as {map?: unknown}).map) {
          material.__xbTslCacheSalt ??= ++cacheSalt;
          material.customProgramCacheKey = () =>
            `${key}|xbTsl#${material.__xbTslCacheSalt}`;
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
