import * as THREE from 'three';
import type {GLTF} from 'three/addons/loaders/GLTFLoader.js';

import type {WebGLOrWebGPURenderer} from '../../core/RendererTypes';
import type {ModelLoader} from '../../utils/ModelLoader';
import {disposeObjectTree} from '../../utils/ThreeDisposal';
import type {SimulatorDayNightLightingDefinition} from '../scene/SimulatorEnvironmentManifest';
import {
  BlindCluster,
  clusterBlinds,
  collectMeshEntries,
  MeshEntry,
  pairMeshesByBounds,
  smoothNormalsByPosition,
  splitNightStateMesh,
} from './bakePairing';
import {dayNightSchedule} from './dayNightSchedule';

interface BlendShader {
  uniforms: {mixU: {value: number}};
}

interface RestoreState {
  mesh: THREE.Mesh;
  geometry: THREE.BufferGeometry;
  material: THREE.Material | THREE.Material[];
}

let warnedNonWebGL = false;

/**
 * Removes the hemisphere-light accumulation from three's `lights_fragment_begin`
 * chunk so only directional lights (the rig's sun and window bounce) shade the
 * additive overlay - scene lights are gathered per scene, so without this the
 * simulator's own hemisphere fill washes over the additive layer. Returns null
 * when the chunk does not have the expected shape (fail safe: the overlay then
 * keeps the stock shader).
 */
export function stripHemisphereIrradiance(chunk: string): string | null {
  const start = chunk.indexOf('#if ( NUM_HEMI_LIGHTS > 0 )');
  if (start === -1) return null;
  const end = chunk.indexOf('#endif', start);
  if (end === -1) return null;
  return chunk.slice(0, start) + chunk.slice(end + '#endif'.length);
}

const LIGHTS_BEGIN_WITHOUT_HEMISPHERE = stripHemisphereIrradiance(
  THREE.ShaderChunk.lights_fragment_begin
);

export interface DayNightCycleOptions {
  renderer: unknown;
  root: THREE.Object3D;
  dayScene: THREE.Object3D;
  loader: ModelLoader;
  lighting: SimulatorDayNightLightingDefinition;
}

/**
 * Lazily-loaded day/night lighting for environments whose manifest declares a
 * paired night bake. The base is the day/night bake crossfade (per-mesh
 * texture blend, endpoint-exact) and the moving sun lives in an additive
 * overlay layer on top whose intensity is ZERO at both endpoints, so t=0 and
 * t=1 render the raw bakes pixel-identically.
 *
 * Nothing is loaded or allocated until {@link DayNightCycle.preload} (or the
 * first {@link DayNightCycle.setTimeOfDay}) runs.
 */
export class DayNightCycle {
  private timeOfDayValue = 0;
  private preloadPromise?: Promise<void>;
  private built = false;
  private disposed = false;
  private generation = 0;

  private nightScene?: THREE.Object3D;
  /** Day meshes whose material/geometry were replaced and must be restored. */
  private restores: RestoreState[] = [];
  /** Baked clones + split/cluster geometries owned by this cycle. */
  private ownedGeometries = new Set<THREE.BufferGeometry>();
  /** Replaced day materials (blend + day-only clones) to dispose. */
  private replacedMaterials: THREE.Material[] = [];
  private blendMaterials: THREE.MeshBasicMaterial[] = [];
  private overlays: THREE.Mesh[] = [];
  private shadeGroups: {mesh: THREE.Mesh; topY: number}[] = [];
  private dayOnlyMeshes: THREE.Mesh[] = [];
  private createdMeshes: THREE.Mesh[] = [];
  private createdMaterials: THREE.Material[] = [];
  /** Shared sky blend uniform. */
  private skyMix = {value: 0};
  private sun?: THREE.DirectionalLight;
  private sunTarget?: THREE.Object3D;
  private bounce?: THREE.DirectionalLight;
  private bounceTarget?: THREE.Object3D;
  private skyFill?: THREE.HemisphereLight;
  private savedShadowMap?: {
    enabled: boolean;
    type: THREE.ShadowMapType;
  };

  private constructor(private options: DayNightCycleOptions) {}

  /**
   * Creates a cycle for a WebGL renderer. Returns null (day-only, no overhead)
   * on WebGPU: the blend shader uses onBeforeCompile, which the WebGPU
   * backend does not support.
   */
  static async create(
    options: DayNightCycleOptions
  ): Promise<DayNightCycle | null> {
    const renderer = options.renderer as {isWebGLRenderer?: boolean} | null;
    if (!renderer?.isWebGLRenderer) {
      if (!warnedNonWebGL) {
        warnedNonWebGL = true;
        console.warn(
          'DayNightCycle: day/night lighting requires a WebGL renderer; ' +
            'this environment stays day-only.'
        );
      }
      return null;
    }
    return new DayNightCycle(options);
  }

  /** Current time of day (0 = day endpoint, 1 = night endpoint). */
  get timeOfDay(): number {
    return this.timeOfDayValue;
  }

  /** True once the night bake has been fetched and built. */
  get preloaded(): boolean {
    return this.built;
  }

  /**
   * Fetches the night bake once and builds the blend/overlay rig. Idempotent;
   * concurrent callers share one load.
   */
  preload(): Promise<void> {
    if (this.built) return Promise.resolve();
    if (!this.preloadPromise) {
      this.preloadPromise = this.build().catch((error) => {
        console.warn('DayNightCycle: failed to preload the night bake.', error);
      });
    }
    return this.preloadPromise;
  }

  /**
   * Sets the time of day. Fires the preload on first use and applies the
   * stored value as soon as the rig is built.
   */
  setTimeOfDay(t: number): void {
    this.timeOfDayValue = Math.min(1, Math.max(0, t));
    if (!this.built) {
      void this.preload();
      return;
    }
    this.apply();
  }

  /**
   * Restores every replaced day material/geometry, removes the shade/overlay
   * meshes and lights, restores the renderer shadow-map settings, and disposes
   * the night resources. Idempotent.
   */
  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.generation++; // invalidate an in-flight preload
    for (const mesh of this.createdMeshes) {
      mesh.removeFromParent();
    }
    for (const overlay of this.overlays) {
      overlay.removeFromParent();
      (overlay.material as THREE.Material).dispose();
    }
    for (const material of this.createdMaterials) {
      material.dispose();
    }
    this.sunTarget?.removeFromParent();
    this.sun?.removeFromParent();
    this.bounceTarget?.removeFromParent();
    this.bounce?.removeFromParent();
    this.skyFill?.removeFromParent();
    for (const state of this.restores) {
      state.mesh.geometry = state.geometry;
      state.mesh.material = state.material;
    }
    for (const material of this.replacedMaterials) {
      material.dispose();
    }
    for (const geometry of this.ownedGeometries) {
      geometry.dispose();
    }
    if (this.nightScene) {
      disposeObjectTree(this.nightScene);
      this.nightScene = undefined;
    }
    const shadowMap = (this.options.renderer as THREE.WebGLRenderer).shadowMap;
    if (this.savedShadowMap) {
      shadowMap.enabled = this.savedShadowMap.enabled;
      shadowMap.type = this.savedShadowMap.type;
      this.savedShadowMap = undefined;
    }
  }

  private async build(): Promise<void> {
    const generation = this.generation;
    const gltf: GLTF = await this.options.loader.loadGLTF({
      url: this.options.lighting.nightScenePath,
      renderer: this.options.renderer as WebGLOrWebGPURenderer,
    });
    if (this.disposed || generation !== this.generation) return;
    const {root, dayScene} = this.options;
    const nightScene = gltf.scene;
    this.nightScene = nightScene;

    // Bake each mesh's world transform into its geometry so meshes can be
    // re-parented freely (GLTF nodes carry TRS above the meshes).
    this.bakeWorldTransforms(dayScene);
    this.bakeWorldTransforms(nightScene);

    const dayEntries = collectMeshEntries(dayScene);
    const nightEntries = collectMeshEntries(nightScene);
    const pairs = pairMeshesByBounds(nightEntries, dayEntries);

    for (const {night, day} of pairs) {
      const dayMaterial = day.mesh.material as THREE.MeshBasicMaterial;
      // MAIN BODY: day geometry + day/night blended texture. The day bake
      // carries no shade tris, so its geometry is exactly the wall/prop body.
      // Day and night bakes share UVs exactly; sample both at the same uv (an
      // earlier UV-offset experiment measured worse than zero).
      smoothNormalsByPosition(day.mesh.geometry);
      day.mesh.castShadow = true;
      day.mesh.receiveShadow = true;
      const mapDay = dayMaterial.map;
      const mapNight = (night.mesh.material as THREE.MeshBasicMaterial).map;
      if (mapDay && mapNight) {
        const mat = this.buildBlendMaterial(mapDay, mapNight);
        mat.name = dayMaterial.name;
        day.mesh.material = mat;
        this.blendMaterials.push(mat);
        this.replacedMaterials.push(mat);
        // Outdoor stays baked: no additive sun overlay.
        if (/outside|sky/i.test(mat.name)) continue;
        this.addOverlay(day.mesh.geometry);
      }

      // night-only verts = the state geometry (shades). Only the room shells
      // carry window shades; other diffs are moved props that snap to the
      // night state.
      const isRoomShell = /Bake home office|Bake living room bottom/.test(
        (night.mesh.material as THREE.Material).name
      );
      const extra = isRoomShell
        ? new Set([...night.verts].filter((v) => !day.verts.has(v)))
        : new Set<string>();
      if (extra.size < 12) continue;
      const shadeGeo = splitNightStateMesh(night, extra);
      if (shadeGeo.getAttribute('position').count === 0) {
        shadeGeo.dispose();
        continue;
      }
      for (const blind of clusterBlinds(shadeGeo)) {
        this.ownedGeometries.add(blind.geo);
        if (blind.topY < 0.5) {
          // stray night-only floor bits: redundant surface over the blend
          // floor - drop entirely (it z-fought the floor)
          continue;
        }
        this.addShade(night, blind);
      }
      this.ownedGeometries.add(shadeGeo);
    }

    // day-only meshes -> rug-like state meshes (fade out with t)
    for (const day of dayEntries) {
      if (pairs.some((pair) => pair.day === day)) continue;
      const dayMaterial = day.mesh.material as THREE.MeshBasicMaterial;
      smoothNormalsByPosition(day.mesh.geometry);
      day.mesh.castShadow = true;
      day.mesh.receiveShadow = true;
      const mat = dayMaterial.clone();
      mat.transparent = true;
      // the floor surface undulates through the rug's thickness (both sit at
      // y~0.01-0.1) - bias the rug toward the camera so it cannot z-fight the
      // floor while fading
      mat.polygonOffset = true;
      mat.polygonOffsetFactor = -2;
      mat.polygonOffsetUnits = -2;
      day.mesh.material = mat;
      this.replacedMaterials.push(mat);
      this.dayOnlyMeshes.push(day.mesh);
    }

    // sky sphere: biggest box, blend its two textures
    let skyN: MeshEntry | undefined;
    let skyD: MeshEntry | undefined;
    for (const e of nightEntries)
      if (!skyN || e.size.length() > skyN.size.length()) skyN = e;
    for (const e of dayEntries)
      if (!skyD || e.size.length() > skyD.size.length()) skyD = e;
    const skyMapDay = skyD
      ? (skyD.mesh.material as THREE.MeshBasicMaterial).map
      : null;
    const skyMapNight = skyN
      ? (skyN.mesh.material as THREE.MeshBasicMaterial).map
      : null;
    if (skyN && skyD && skyMapDay && skyMapNight) {
      // The night scene owns the sky geometry; render a clone so disposal of
      // the night tree stays symmetric.
      const sky = skyN.mesh.clone();
      const mat = (skyN.mesh.material as THREE.MeshBasicMaterial).clone();
      const skyMix = this.skyMix;
      mat.onBeforeCompile = (shader) => {
        shader.uniforms.mapDay = {value: skyMapDay};
        shader.uniforms.uMix = skyMix;
        shader.fragmentShader =
          'uniform sampler2D mapDay;\nuniform float uMix;\n' +
          shader.fragmentShader.replace(
            '#include <map_fragment>',
            `
            vec4 texelDay = texture2D( mapDay, vMapUv );
            vec4 texelNight = texture2D( map, vMapUv );
            diffuseColor *= mix( texelDay, texelNight, uMix );
            `
          );
      };
      // The sky patch is a different shader patch than the plain mapped
      // materials it shares parameters with; keep its program to itself.
      mat.customProgramCacheKey = () => 'daynight-sky';
      sky.material = mat;
      sky.castShadow = false;
      sky.receiveShadow = false;
      root.add(sky);
      this.createdMeshes.push(sky);
      this.createdMaterials.push(mat);
    }

    // ---- lights: affect ONLY the additive overlay layer (base is unlit) ----
    const sun = new THREE.DirectionalLight(0xffffff, 3);
    sun.castShadow = true;
    sun.shadow.mapSize.set(4096, 4096);
    sun.shadow.camera.near = 20;
    sun.shadow.camera.far = 60;
    sun.shadow.camera.left = -11;
    sun.shadow.camera.right = 11;
    sun.shadow.camera.top = 11;
    sun.shadow.camera.bottom = -11;
    sun.shadow.bias = -0.0005;
    sun.shadow.normalBias = 0.08;
    sun.shadow.radius = 30;
    const sunTarget = new THREE.Object3D();
    sunTarget.position.set(0, 1.5, 0.5);
    root.add(sunTarget);
    sun.target = sunTarget;
    root.add(sun);
    this.sun = sun;
    this.sunTarget = sunTarget;

    // window bounce: light flooding in low from the sun's azimuth (no shadow)
    // - shaped like real light, unlike a flat hemisphere fill
    const bounce = new THREE.DirectionalLight(0xfff3e0, 0);
    const bounceTarget = new THREE.Object3D();
    bounceTarget.position.set(0, 1.0, 0);
    root.add(bounceTarget);
    bounce.target = bounceTarget;
    root.add(bounce);
    this.bounce = bounce;
    this.bounceTarget = bounceTarget;

    // faint sky lift so corners do not crush to pure black
    const skyFill = new THREE.HemisphereLight(0x87b5ff, 0x3a2f28, 0.6);
    root.add(skyFill);
    this.skyFill = skyFill;

    // PCF (not PCFSoft) + radius: PCFSoft ignores shadow.radius; the plain PCF
    // kernel with a radius gives a real penumbra that absorbs the shadow map's
    // texel flips at thin window jambs (the hard-edged patch blinked there).
    // Per-light refresh: the sun's shadow map re-renders only when the time of
    // day changes (see apply()). The global autoUpdate stays on so lights
    // owned by the app keep updating their own shadows; the sun's caster set
    // is the static room + blinds, so scrub-time refreshes are sufficient.
    const shadowMap = (this.options.renderer as THREE.WebGLRenderer).shadowMap;
    this.savedShadowMap = {
      enabled: shadowMap.enabled,
      type: shadowMap.type,
    };
    shadowMap.enabled = true;
    shadowMap.type = THREE.PCFShadowMap;
    sun.shadow.autoUpdate = false;

    this.built = true;
    this.apply();
  }

  /**
   * Bake each mesh's world transform (relative to the scene root, so a night
   * and day scene stay in their shared authored space even under a
   * transformed environment root) into cloned geometry and reset node TRS.
   */
  private bakeWorldTransforms(sceneRoot: THREE.Object3D) {
    sceneRoot.updateMatrixWorld(true);
    const toRoot = new THREE.Matrix4().copy(sceneRoot.matrixWorld).invert();
    sceneRoot.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (!mesh.isMesh) return;
      const matrix = new THREE.Matrix4().multiplyMatrices(
        toRoot,
        mesh.matrixWorld
      );
      const baked = mesh.geometry.clone().applyMatrix4(matrix);
      this.ownedGeometries.add(baked);
      this.restores.push({
        mesh,
        geometry: mesh.geometry,
        material: mesh.material,
      });
      mesh.geometry = baked;
      mesh.position.set(0, 0, 0);
      mesh.rotation.set(0, 0, 0);
      mesh.scale.set(1, 1, 1);
    });
  }

  /**
   * Day/night bake crossfade on one unlit base material. The additive sun
   * layer on top is what moves; the base only crossfades the two bakes so the
   * endpoints stay pixel-faithful to the reference GLBs.
   */
  private buildBlendMaterial(mapDay: THREE.Texture, mapNight: THREE.Texture) {
    const material = new THREE.MeshBasicMaterial({map: mapDay});
    material.userData.pendingMixU = 0;
    material.onBeforeCompile = (shader) => {
      shader.uniforms.mapNight = {value: mapNight};
      shader.uniforms.mixU = {value: material.userData.pendingMixU ?? 0};
      shader.fragmentShader = shader.fragmentShader
        .replace(
          '#include <common>',
          '#include <common>\nuniform sampler2D mapNight;\nuniform float mixU;'
        )
        .replace(
          '#include <map_fragment>',
          `{
          vec4 texDay = texture2D( map, vMapUv );
          vec4 texNight = texture2D( mapNight, vMapUv );
          vec4 sampledDiffuseColor = mix( texDay, texNight, mixU );
          diffuseColor *= sampledDiffuseColor;
        }`
        );
      material.userData.shader = shader;
    };
    // All blend materials share one patched program.
    material.customProgramCacheKey = () => 'daynight-blend';
    return material;
  }

  /**
   * Additive sun/sky-fill overlay sharing the body geometry. Phong (not
   * Lambert): Lambert shades per-vertex, so the GLBs' large triangles showed
   * triangle-shaped gradients on cloth; Phong with no specular is the same
   * flat diffuse but per-fragment. Hidden at both endpoints so the scene
   * renders exactly the raw bake.
   */
  private addOverlay(
    geometry: THREE.BufferGeometry,
    parent: THREE.Object3D = this.options.root
  ) {
    const material = new THREE.MeshPhongMaterial({
      color: 0xffffff,
      specular: 0x000000,
      shininess: 0,
      blending: THREE.AdditiveBlending,
      transparent: true,
      depthWrite: false,
    });
    // Lit only by the rig lights (see stripHemisphereIrradiance).
    if (LIGHTS_BEGIN_WITHOUT_HEMISPHERE) {
      material.onBeforeCompile = (shader) => {
        shader.fragmentShader = shader.fragmentShader.replace(
          '#include <lights_fragment_begin>',
          LIGHTS_BEGIN_WITHOUT_HEMISPHERE
        );
      };
      material.customProgramCacheKey = () => 'daynight-overlay';
    }
    const overlay = new THREE.Mesh(geometry, material);
    overlay.castShadow = false;
    overlay.receiveShadow = true;
    parent.add(overlay);
    this.overlays.push(overlay);
    this.createdMaterials.push(material);
  }

  /** A roller-shade blind rolling about its own housing top edge. */
  private addShade(night: MeshEntry, blind: BlindCluster) {
    const shade = night.mesh.clone();
    shade.geometry = blind.geo;
    const material = (night.mesh.material as THREE.Material).clone();
    material.transparent = true;
    shade.material = material;
    // scale about this blind's own housing top edge
    blind.geo.translate(0, -blind.topY, 0);
    shade.position.y = blind.topY;
    shade.castShadow = true;
    shade.receiveShadow = true;
    this.options.root.add(shade);
    this.createdMeshes.push(shade);
    this.createdMaterials.push(material);
    this.shadeGroups.push({mesh: shade, topY: blind.topY});
    // Parent the overlay under the blind so it shares the rolling scale.
    this.addOverlay(blind.geo, shade);
  }

  private apply(): void {
    const values = dayNightSchedule(this.timeOfDayValue);
    for (const material of this.blendMaterials) {
      // The shader may not exist before the first compile; keep the pending
      // value on the material and push it in on compile.
      const shader = material.userData.shader as BlendShader | undefined;
      if (shader) shader.uniforms.mixU.value = values.mixU;
      material.userData.pendingMixU = values.mixU;
    }
    this.skyMix.value = values.mixU;
    this.sun?.position.set(...values.sunPosition);
    if (this.sun) {
      this.sun.intensity = values.sunIntensity;
      this.sun.color.setRGB(...values.sunColor);
    }
    this.bounce?.position.set(...values.bouncePosition);
    if (this.bounce) {
      this.bounce.intensity = values.bounceIntensity;
      this.bounce.color.setRGB(...values.bounceColor);
    }
    if (this.skyFill) {
      this.skyFill.intensity = values.skyFillIntensity;
      this.skyFill.color.setRGB(...values.skyFillColor);
    }
    const overlayActive =
      Math.max(
        values.sunIntensity,
        values.bounceIntensity,
        values.skyFillIntensity
      ) > 0.001;
    for (const overlay of this.overlays) {
      overlay.visible = overlayActive;
      // Constant approximation of the spike's faint hemisphere sky-lift
      // (hemisphere lighting is stripped from the overlay shader so the
      // simulator's own fill light cannot wash over the additive layer).
      const overlayMaterial = overlay.material as THREE.MeshPhongMaterial;
      overlayMaterial.emissive.setRGB(
        (values.skyFillColor[0] * values.skyFillIntensity) / Math.PI,
        (values.skyFillColor[1] * values.skyFillIntensity) / Math.PI,
        (values.skyFillColor[2] * values.skyFillIntensity) / Math.PI
      );
    }
    // rolling blinds: hardware fades in just as the roll starts
    for (const s of this.shadeGroups) {
      s.mesh.visible = values.blindsHardware > 0.01;
      (s.mesh.material as THREE.Material).opacity = values.blindsHardware;
      s.mesh.scale.y = 0.04 + 0.96 * values.blindsRoll;
    }
    // day-only rug fades out before the night half
    for (const mesh of this.dayOnlyMeshes) {
      const material = mesh.material as THREE.Material;
      material.opacity = values.rugOpacity;
      mesh.visible = values.rugOpacity > 0.01;
    }
    // Refresh the sun's shadow map for the new arc before the next render.
    if (this.sun) this.sun.shadow.needsUpdate = true;
  }
}
