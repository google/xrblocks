import * as THREE from 'three';
import {color, lights, mix, texture, uniform, vec4} from 'three/tsl';
import {MeshBasicNodeMaterial, MeshPhongNodeMaterial} from 'three/webgpu';

/**
 * Node-material rig that replaces the `onBeforeCompile` day/night blend
 * shaders when {@link DayNightCycle} runs on `THREE.WebGPURenderer` (whose
 * backend cannot patch built-in GLSL). One shared {@link mix} uniform drives
 * every blend material, mirroring how the WebGL path pushes one `mixU` value
 * into each patched program.
 */
export class DayNightWebGPURig {
  /** Shared day/night crossfade uniform (0 = day, 1 = night). */
  readonly mixU = uniform(0);

  /**
   * Day/night bake crossfade on one unlit base material: the output is the
   * authored base color multiplied by `mix(day, night, mixU)`, with the base
   * material's opacity folded in afterwards exactly like `MeshBasicMaterial`
   * (`diffuseColor *= sampled` then `a *= opacity`).
   */
  buildBlendMaterial(
    base: THREE.MeshBasicMaterial,
    mapDay: THREE.Texture,
    mapNight: THREE.Texture
  ): THREE.Material {
    const material = new MeshBasicNodeMaterial();
    material.name = base.name;
    material.color.copy(base.color);
    material.opacity = base.opacity;
    material.transparent = base.transparent;
    material.alphaTest = base.alphaTest;
    material.side = base.side;
    material.toneMapped = base.toneMapped;
    material.fog = base.fog;
    material.depthTest = base.depthTest;
    material.depthWrite = base.depthWrite;
    material.blending = base.blending;
    material.map = mapDay;

    const texMix = mix(texture(mapDay), texture(mapNight), this.mixU);
    const tint = color(base.color);
    material.colorNode = vec4(
      tint.x.mul(texMix.x),
      tint.y.mul(texMix.y),
      tint.z.mul(texMix.z),
      texMix.w
    );
    return material;
  }

  /**
   * Additive sun/sky-fill overlay material. The equivalent of the WebGL
   * `stripHemisphereIrradiance` patch is
   * {@link DayNightWebGPURig.restrictOverlayLights}, which pins the material
   * to the rig's directional lights (node materials cannot edit built-in GLSL
   * chunks).
   */
  buildOverlayMaterial(): THREE.Material {
    return new MeshPhongNodeMaterial({
      color: 0xffffff,
      specular: 0x000000,
      shininess: 0,
      blending: THREE.AdditiveBlending,
      transparent: true,
      depthWrite: false,
    });
  }

  /**
   * Restricts overlay materials to the given lights (the rig's sun and window
   * bounce) so hemisphere fill lights — the simulator's own and the rig's
   * skyFill — cannot wash over the additive layer.
   */
  restrictOverlayLights(
    materials: THREE.Material[],
    rigLights: THREE.Light[]
  ): void {
    const lightsNode = lights(rigLights);
    for (const material of materials) {
      (material as THREE.Material & {lightsNode?: unknown}).lightsNode =
        lightsNode;
    }
  }
}
