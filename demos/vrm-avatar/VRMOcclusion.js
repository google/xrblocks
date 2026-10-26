/**
 * VRMOcclusion.js
 *
 * Opts a loaded VRM avatar into XR Blocks' pixel-level passthrough occlusion
 * (the screen-space occlusion map built by xb.OcclusionPass and sampled
 * per-material as an alpha multiply).
 *
 * The occlusion contract has four steps (see src/ui/model/ModelViewer.ts
 * in xrblocks for the canonical rigid-mesh version):
 *   1. mesh.layers.enable(xb.OCCLUDABLE_ITEMS_LAYER) — render into the map.
 *   2. material.transparent = true — occlusion multiplies fragment alpha.
 *   3. Inject GLSL that projects the fragment into the occlusion map and
 *      multiplies diffuseColor.a by the sampled visibility.
 *   4. Register the shader's uniforms in xb.core.depth.occludableShaders so
 *      tOcclusionMap / uOcclusionClipFromWorld are refreshed every frame.
 *
 * VRM avatars need a custom step 3 for MToon materials:
 * xb.OcclusionUtils.addOcclusionToShader only works on built-in three.js
 * materials (it anchors on `uniform vec3 diffuse;`), while @pixiv/three-vrm's
 * MToonMaterial is a ShaderMaterial whose fragment shader renames `diffuse` to
 * `litFactor`. We patch MToon's shader source directly with equivalent GLSL.
 * Non-MToon materials (PBR VRMs load as MeshStandardMaterial) go through the
 * stock helper.
 *
 * Requires options.depth.enabled + options.depth.depthTexture.enabled +
 * options.depth.occlusion.enabled; inert (safe to skip) otherwise.
 */

import * as THREE from 'three';
import * as xb from 'xrblocks';

/** Fragment-side occlusion sample, shared by both material paths. */
const OCCLUSION_FRAGMENT_SNIPPET = [
  'vec2 occlusion_coordinates = 0.5 + 0.5 * vOcclusionScreenCoord.xy / vOcclusionScreenCoord.w;',
  'vec2 occlusion_sample = texture2D(tOcclusionMap, occlusion_coordinates.xy).rg;',
  'occlusion_sample = occlusion_sample / max(0.0001, occlusion_sample.g);',
  'float occlusion_value = clamp(occlusion_sample.r, 0.0, 1.0);',
  // Sharpen the blurred occlusion-map edge: the Kawase pyramid in
  // OcclusionPass produces a wide 0..1 gradient at occlusion boundaries,
  // which reads as the avatar ghosting through real geometry. Collapsing
  // the response around 0.5 keeps anti-aliased edges but removes the halo.
  'occlusion_value = smoothstep(0.35, 0.65, occlusion_value);',
  'diffuseColor.a *= occlusionEnabled ? occlusion_value : 1.0;',
].join('\n');

/**
 * Replaces `anchor` with `anchor + injected code` in `source`.
 * @param {string} source GLSL source.
 * @param {string} anchor Exact line to anchor on.
 * @param {string} injection Code to insert after the anchor.
 * @returns {string|null} Patched source, or null if the anchor was not found.
 */
function injectAfter(source, anchor, injection) {
  if (!source.includes(anchor)) return null;
  return source.replace(anchor, anchor + '\n' + injection);
}

/**
 * Patches an MToonMaterial's shader source in place for occlusion.
 *
 * MToon anchors (verified against three-vrm v3 mtoon.vert / mtoon.frag):
 *   - vertex keeps the standard chunks, so `transformed` (post-skinning,
 *     post-morph) is in scope by `#include <fog_vertex>`.
 *   - fragment declares `uniform vec3 litFactor;` and assigns
 *     `vec4 diffuseColor = vec4( litFactor, opacity );`, and its final
 *     `gl_FragColor = vec4( col, diffuseColor.a );` carries alpha through.
 *
 * As a ShaderMaterial, its `uniforms` object is handed to the program by
 * reference, so we can add uniforms directly — no onBeforeCompile needed.
 * @param {THREE.ShaderMaterial} material The MToon material to patch.
 * @returns {boolean} True if the patch was fully applied.
 */
function patchMToonMaterial(material) {
  const vertexShader = injectAfter(
    injectAfter(
      material.vertexShader,
      '#include <common>',
      [
        'uniform mat4 uOcclusionClipFromWorld;',
        'varying vec4 vOcclusionScreenCoord;',
      ].join('\n')
    ),
    '#include <fog_vertex>',
    // World position from `transformed` is skinning- and morph-correct.
    'vOcclusionScreenCoord = uOcclusionClipFromWorld * ( modelMatrix * vec4( transformed, 1.0 ) );'
  );
  const fragmentShader = injectAfter(
    injectAfter(
      material.fragmentShader,
      'uniform vec3 litFactor;',
      [
        'uniform bool occlusionEnabled;',
        'uniform sampler2D tOcclusionMap;',
        'varying vec4 vOcclusionScreenCoord;',
      ].join('\n')
    ),
    'vec4 diffuseColor = vec4( litFactor, opacity );',
    OCCLUSION_FRAGMENT_SNIPPET
  );
  if (vertexShader === null || fragmentShader === null) {
    return false;
  }

  material.vertexShader = vertexShader;
  material.fragmentShader = fragmentShader;
  material.uniforms.occlusionEnabled = {value: true};
  material.uniforms.tOcclusionMap = {value: null};
  material.uniforms.uOcclusionClipFromWorld = {value: new THREE.Matrix4()};
  material.needsUpdate = true;

  // Duck-typed registration: Depth.renderOcclusionPass only touches
  // uniforms.tOcclusionMap and uniforms.uOcclusionClipFromWorld.
  xb.core.depth.occludableShaders.add({uniforms: material.uniforms});
  return true;
}

/**
 * Patches a built-in three.js material (MeshStandardMaterial etc.) using the
 * stock xrblocks helper, mirroring ModelViewer.loadGLTFModel.
 * @param {THREE.Material} material The material to patch.
 */
function patchBuiltinMaterial(material) {
  material.onBeforeCompile = (shader) => {
    xb.OcclusionUtils.addOcclusionToShader(shader);
    // Same edge sharpening as the MToon path (see OCCLUSION_FRAGMENT_SNIPPET).
    shader.fragmentShader = shader.fragmentShader.replace(
      'float occlusion_value = clamp(occlusion_sample.r, 0.0, 1.0);',
      'float occlusion_value = smoothstep(0.35, 0.65, clamp(occlusion_sample.r, 0.0, 1.0));'
    );
    shader.uniforms.occlusionEnabled.value = true;
    xb.core.depth.occludableShaders.add(shader);
  };
}

/**
 * Applies pixel-level passthrough occlusion to every mesh under `root`.
 * Call after the VRM has fully loaded (in particular after
 * VRMUtils.combineSkeletons has replaced meshes).
 * @param {THREE.Object3D} root Root of the loaded avatar scene graph.
 */
export function applyOcclusionToAvatar(root) {
  if (!xb.core.depth || !xb.core.options.depth?.occlusion?.enabled) {
    console.warn(
      '[VRMOcclusion] Occlusion is not enabled ' +
        '(options.depth.occlusion.enabled); skipping.'
    );
    return;
  }

  root.traverse((obj) => {
    if (!obj.isMesh) return;
    obj.layers.enable(xb.OCCLUDABLE_ITEMS_LAYER);

    const materials = Array.isArray(obj.material)
      ? obj.material
      : [obj.material];
    for (const material of materials) {
      if (!material || material.userData.occlusionApplied) continue;
      material.userData.occlusionApplied = true;

      const isMToon =
        material.isMToonMaterial === true ||
        material.uniforms?.litFactor !== undefined;
      if (isMToon) {
        if (!patchMToonMaterial(material)) {
          console.warn(
            `[VRMOcclusion] MToon shader anchors not found on material ` +
              `"${material.name}" — occlusion skipped for it. ` +
              '(three-vrm version change?)'
          );
          continue;
        }
      } else {
        patchBuiltinMaterial(material);
      }
      // Occlusion multiplies alpha, so the material must blend. depthWrite is
      // left as-is to limit self-sorting artifacts on formerly opaque parts.
      material.transparent = true;
    }
  });
}
