import * as THREE from 'three';
import {MeshBasicNodeMaterial} from 'three/webgpu';
import {
  Break,
  Discard,
  Fn,
  If,
  Loop,
  float,
  hash,
  positionLocal,
  screenUV,
  smoothstep,
  texture3D,
  uniform,
  varying,
  vec2,
  vec3,
  vec4,
} from 'three/tsl';

export interface CloudNodeRig {
  material: MeshBasicNodeMaterial;
  /** Camera position in the cloud mesh's local space (the GLSL `vOrigin`). */
  originUniform: {value: THREE.Vector3};
  /** Monotonic frame counter driving the per-fragment jitter. */
  frameUniform: {value: number};
}

/**
 * TSL port of the raymarching shader in VolumetricCloud.glsl.ts. Only used on
 * `THREE.WebGPURenderer`, whose backend cannot run `RawShaderMaterial`; the
 * WebGL path keeps the original GLSL verbatim.
 *
 * Differences from the GLSL are limited to pipeline plumbing: the per-fragment
 * jitter uses TSL's `hash` instead of the GLSL wang hash (it is only a dither
 * source), and the linear-to-sRGB output conversion is left to the node
 * pipeline's output transform instead of being applied manually.
 */
export function createCloudNodeMaterial(
  base: THREE.Color,
  texture: THREE.Data3DTexture
): CloudNodeRig {
  const origin = uniform(new THREE.Vector3());
  const frame = uniform(0);
  const threshold = uniform(0.2);
  const opacity = uniform(0.4);
  const range = uniform(0.1);
  const steps = uniform(50);
  const baseColor = uniform(new THREE.Vector3(base.r, base.g, base.b));

  const vDirection = varying(vec3(0), 'vDirection');

  // sample1(p) reads the noise volume at p + 0.5, as in the GLSL.
  const sample1 = Fn(
    ([p]: [typeof origin]) => texture3D(texture, p.add(0.5)).r
  );

  const shading = Fn(([coord]: [typeof origin]) =>
    sample1(coord.sub(0.01)).sub(sample1(coord.add(0.01)))
  );

  const hitBox = Fn(([orig, dir]: [typeof origin, typeof origin]) => {
    const invDir = dir.reciprocal();
    const tminTmp = vec3(-0.5).sub(orig).mul(invDir);
    const tmaxTmp = vec3(0.5).sub(orig).mul(invDir);
    const tmin = tminTmp.min(tmaxTmp);
    const tmax = tminTmp.max(tmaxTmp);
    return vec2(tmin.x.max(tmin.y).max(tmin.z), tmax.x.min(tmax.y).min(tmax.z));
  });

  const main = Fn(() => {
    const rayDir = vDirection.normalize();
    const bounds = hitBox(origin, rayDir);
    If(bounds.x.greaterThan(bounds.y), () => {
      Discard();
    });

    const tStart = bounds.x.max(0);
    const p = origin.add(rayDir.mul(tStart)).toVar();
    const inc = rayDir.abs().reciprocal();
    const delta = inc.x.min(inc.y).min(inc.z).div(steps);

    // Jitter the ray start per fragment to hide banding.
    const randNum = hash(vec3(screenUV.mul(vec2(1234.5, 5678.9)), frame))
      .mul(2)
      .sub(1);
    p.addAssign(rayDir.mul(randNum).div(128));

    const ac = vec4(baseColor, 0).toVar();
    const t = tStart.toVar();
    // While-form of TSL Loop (documented in three's LoopNode.js); missing from
    // the LoopNodeObjectParameter d.ts overloads.
    Loop(t.lessThan(bounds.y) as never, () => {
      const density = smoothstep(
        threshold.sub(range),
        threshold.add(range),
        sample1(p)
      ).mul(opacity);
      const col = shading(p).mul(3).add(p.x.add(p.y).mul(0.25)).add(0.2);
      const oneMinusA = float(1).sub(ac.a);
      ac.assign(
        vec4(
          ac.rgb.add(oneMinusA.mul(density).mul(col)),
          ac.a.add(oneMinusA.mul(density))
        )
      );
      If(ac.a.greaterThanEqual(0.95), () => {
        Break();
      });
      p.addAssign(rayDir.mul(delta));
      t.addAssign(delta);
    });

    If(ac.a.equal(0), () => {
      Discard();
    });
    return ac;
  });

  const material = new MeshBasicNodeMaterial({
    transparent: true,
    side: THREE.BackSide,
  });
  material.positionNode = Fn(() => {
    vDirection.assign(positionLocal.sub(origin));
    return positionLocal;
  })();
  material.colorNode = main();

  return {
    material,
    originUniform: origin,
    frameUniform: frame,
  };
}
