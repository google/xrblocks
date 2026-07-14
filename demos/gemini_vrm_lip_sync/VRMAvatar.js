/**
 * VRMAvatar.js
 *
 * Utility class that wraps VRM loading, per-frame update, and Mesh2Motion GLB
 * animation retargeting. Designed as a proto-addon following the RainParticles pattern:
 * plain JS class, no XRBlocks lifecycle dependencies, fully reusable.
 *
 * Usage:
 *   const avatar = new VRMAvatar();
 *   await avatar.load(url, renderer);
 *   scene.add(avatar.root);            // add the VRM scene graph
 *   // in render loop:
 *   avatar.update(delta);
 */

import * as THREE from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {VRMLoaderPlugin, VRMUtils} from '@pixiv/three-vrm';

// ---------------------------------------------------------------------------
// Mesh2Motion → VRM HumanoidBone name map
// Fully populated for CC0 Mesh2Motion humanoid bone naming conventions.
// ---------------------------------------------------------------------------
const MESH2MOTION_VRM_RIG_MAP = {
  pelvis: 'hips',
  spine_01: 'spine',
  spine_02: 'chest',
  spine_03: 'upperChest',
  neck_01: 'neck',
  head: 'head',

  clavicle_l: 'leftShoulder',
  upperarm_l: 'leftUpperArm',
  lowerarm_l: 'leftLowerArm',
  hand_l: 'leftHand',
  thumb_01_l: 'leftThumbMetacarpal',
  thumb_02_l: 'leftThumbProximal',
  thumb_03_l: 'leftThumbDistal',
  index_01_l: 'leftIndexProximal',
  index_02_l: 'leftIndexIntermediate',
  index_03_l: 'leftIndexDistal',
  middle_01_l: 'leftMiddleProximal',
  middle_02_l: 'leftMiddleIntermediate',
  middle_03_l: 'leftMiddleDistal',
  ring_01_l: 'leftRingProximal',
  ring_02_l: 'leftRingIntermediate',
  ring_03_l: 'leftRingDistal',
  pinky_01_l: 'leftLittleProximal',
  pinky_02_l: 'leftLittleIntermediate',
  pinky_03_l: 'leftLittleDistal',

  clavicle_r: 'rightShoulder',
  upperarm_r: 'rightUpperArm',
  lowerarm_r: 'rightLowerArm',
  hand_r: 'rightHand',
  thumb_01_r: 'rightThumbMetacarpal',
  thumb_02_r: 'rightThumbProximal',
  thumb_03_r: 'rightThumbDistal',
  index_01_r: 'rightIndexProximal',
  index_02_r: 'rightIndexIntermediate',
  index_03_r: 'rightIndexDistal',
  middle_01_r: 'rightMiddleProximal',
  middle_02_r: 'rightMiddleIntermediate',
  middle_03_r: 'rightMiddleDistal',
  ring_01_r: 'rightRingProximal',
  ring_02_r: 'rightRingIntermediate',
  ring_03_r: 'rightRingDistal',
  pinky_01_r: 'rightLittleProximal',
  pinky_02_r: 'rightLittleIntermediate',
  pinky_03_r: 'rightLittleDistal',

  thigh_l: 'leftUpperLeg',
  calf_l: 'leftLowerLeg',
  foot_l: 'leftFoot',
  ball_l: 'leftToes',

  thigh_r: 'rightUpperLeg',
  calf_r: 'rightLowerLeg',
  foot_r: 'rightFoot',
  ball_r: 'rightToes',
};

// ---------------------------------------------------------------------------
// Retarget a GLB AnimationClip onto a loaded VRM's humanoid skeleton.
// Returns a new AnimationClip compatible with the VRM's bone names.
// ---------------------------------------------------------------------------
/**
 * Retargets a GLB AnimationClip onto a loaded VRM's humanoid skeleton.
 * Returns a new AnimationClip compatible with the VRM's bone names.
 * @param {THREE.AnimationClip} clip The source GLB animation clip.
 * @param {THREE.Group} gltfScene The loaded GLTF scene containing the rig.
 * @param {object} vrm The loaded VRM instance.
 * @param {string} [rootBoneName=null] Optional specific root/hips bone name.
 * @returns {THREE.AnimationClip} A new AnimationClip compatible with the VRM's bone names.
 */
function retargetGLBClip(
  clip,
  gltfScene,
  vrm,
  restGlbScene = null,
  rootBoneName = null
) {
  const tracks = [];
  const restRotationInverse = new THREE.Quaternion();
  const parentRestWorldRotation = new THREE.Quaternion();
  const _quatA = new THREE.Quaternion();

  // Use the shared rest scene (Idle) if available to guarantee a perfectly symmetric rest pose evaluation.
  // This prevents the asymmetric split-step pose of Walking.glb Frame 0 from causing limping.
  const referenceScene = restGlbScene || gltfScene;

  // Locate hips node specifically
  let hipsNode = null;
  referenceScene.traverse((obj) => {
    if (!hipsNode) {
      if (rootBoneName && obj.name === rootBoneName) {
        hipsNode = obj;
      } else if (!rootBoneName && obj.name.match(/^(pelvis|Hips|hips)$/i)) {
        hipsNode = obj;
      }
    }
  });

  const motionHipsHeight = Math.max(0.1, hipsNode?.position.z || 1);
  const vrmHipsHeight = vrm.humanoid.normalizedRestPose.hips.position[1];
  const hipsPositionScale = vrmHipsHeight / motionHipsHeight;

  // VRM 0.x is mirrored about the YZ plane vs VRM 1.0, so retargeted rotations
  // need their x/z quaternion components negated (the w/y are left alone).
  const isVrm0 = vrm.meta?.metaVersion === '0';

  referenceScene.updateMatrixWorld(true);

  for (const track of clip.tracks) {
    const nameParts = track.name.split('.');
    const nodeNameOrUuid = nameParts[0];
    const propertyName = nameParts[1];

    // Look up the node in the symmetric reference scene to compute correct rest quaternions
    let sourceNode = referenceScene.getObjectByName(nodeNameOrUuid);
    if (!sourceNode) {
      sourceNode = referenceScene.getObjectByProperty('uuid', nodeNameOrUuid);
    }
    if (!sourceNode) continue;

    const vrmBoneName = MESH2MOTION_VRM_RIG_MAP[sourceNode.name];
    if (!vrmBoneName) continue;

    const vrmNode = vrm.humanoid?.getNormalizedBoneNode(vrmBoneName);
    if (!vrmNode) continue;
    const vrmNodeName = vrmNode.name;

    // Store rotations of the proven rest-pose using world quaternions (exactly as in Test 1 & 3 when the avatar looked normal)
    sourceNode.getWorldQuaternion(restRotationInverse).invert();
    sourceNode.parent.getWorldQuaternion(parentRestWorldRotation);

    if (track instanceof THREE.QuaternionKeyframeTrack) {
      const values = new Float32Array(track.values.length);
      for (let i = 0; i < track.values.length; i += 4) {
        _quatA.fromArray(track.values, i);

        // Transform rotation using proven premultiply/multiply math
        _quatA
          .premultiply(parentRestWorldRotation)
          .multiply(restRotationInverse);

        _quatA.toArray(values, i);
      }

      // VRM0: negate x and z (even indices within each xyzw quad) to un-mirror.
      const outValues = isVrm0
        ? values.map((v, i) => (i % 2 === 0 ? -v : v))
        : values;

      tracks.push(
        new THREE.QuaternionKeyframeTrack(
          `${vrmNodeName}.${propertyName}`,
          track.times,
          outValues
        )
      );
    } else if (track instanceof THREE.VectorKeyframeTrack) {
      const values = [];
      for (let i = 0; i < track.values.length; i += 3) {
        const z = track.values[i + 2];
        // Map GLB Z to VRM Y, and add 0.25m (25cm) adjustment to keep feet perfectly on the floor
        values.push(0, z * hipsPositionScale + 0.25, 0);
      }

      tracks.push(
        new THREE.VectorKeyframeTrack(
          `${vrmNodeName}.${propertyName}`,
          track.times,
          values
        )
      );
    }
  }

  return new THREE.AnimationClip('vrmAnimation', clip.duration, tracks);
}

// ---------------------------------------------------------------------------
// VRMAvatar
// ---------------------------------------------------------------------------
export class VRMAvatar {
  /**
   * Constructs a new VRMAvatar.
   * @param {object} [opts={}] Initialization options.
   * @param {number} [opts.blinkIntervalMin=3] Seconds between blinks (min).
   * @param {number} [opts.blinkIntervalMax=6] Seconds between blinks (max).
   */
  constructor(opts = {}) {
    /** The root Three.js object to add to the scene. */
    this.root = new THREE.Object3D();

    /** Loaded VRM instance, set after load(). */
    this.vrm = null;

    /** AnimationMixer for the VRM skeleton. */
    this.mixer = null;

    /** Currently active AnimationAction. */
    this._currentAction = null;

    /** Map of clip name → AnimationAction. */
    this._actions = {};

    // Blink state
    this._blinkIntervalMin = opts.blinkIntervalMin ?? 3;
    this._blinkIntervalMax = opts.blinkIntervalMax ?? 6;
    this._nextBlinkAt = this._randomBlinkDelay();
    this._blinkTimer = 0;
    this._blinking = false;
    this._blinkPhase = 0; // 0 = closing, 1 = opening

    // Spring-bone (hair/cloth) physics throttle. The full sim runs every frame
    // inside vrm.update(); stepping it at ~30 Hz cuts the per-frame CPU cost with
    // a barely-perceptible motion difference.
    this._springStep = 1 / 30;
    this._springAccum = 0;
  }

  // -------------------------------------------------------------------------
  // Load
  // -------------------------------------------------------------------------

  /**
   * Loads a VRM model from a URL. Must be called before update().
   * @param {string} vrmUrl The URL to the VRM file.
   * @returns {Promise<void>}
   */
  async load(vrmUrl) {
    const loader = new GLTFLoader();
    loader.register((parser) => new VRMLoaderPlugin(parser));

    const gltf = await loader.loadAsync(vrmUrl);
    const vrm = gltf.userData.vrm;

    if (!vrm) {
      throw new Error('VRMLoaderPlugin did not find a VRM in the loaded file.');
    }

    this.vrm = vrm;

    // VRM spec version: '0' for VRM 0.x, '1' for VRM 1.0. Drives two
    // version-specific fixups: facing (here) and a quaternion sign flip in the
    // retargeter, because VRM 0.x faces +Z and is mirrored relative to VRM 1.0.
    this.vrmVersion = vrm.meta?.metaVersion ?? '1';
    console.log(`[VRMAvatar] VRM spec version: ${this.vrmVersion}`);

    // VRM 0.x avatars face +Z; VRM 1.0 avatars face -Z. rotateVRM0() spins a 0.x
    // model 180° so it faces -Z like a 1.0 model (it no-ops for 1.0), keeping the
    // rest of the pipeline — placement, lookAt, facing — version-agnostic.
    VRMUtils.rotateVRM0(vrm);

    // Reduce avatar rendering cost before it ever hits the scene. Order matters
    // (see three-vrm docs): drop unused verts, merge skeletons, then bake morphs.
    //   - removeUnnecessaryVertices: trims vertices no morph/skin references.
    //   - combineSkeletons: merges the model's separate skins into shared
    //     skeletons → fewer draw calls and skinning state changes.
    //   - combineMorphs: bakes the face's many morph targets into a single
    //     managed morph → much cheaper per-frame morph upload. It rewires the
    //     expressionManager, so lipsync visemes + blink keep working.
    VRMUtils.removeUnnecessaryVertices(vrm.scene);
    VRMUtils.combineSkeletons(vrm.scene);
    VRMUtils.combineMorphs(vrm);

    // Run AFTER the mergers above so flags land on the final (possibly replaced)
    // meshes/materials.
    vrm.scene.traverse((obj) => {
      if (obj.isMesh) {
        obj.frustumCulled = false;
        obj.castShadow = false;
        obj.receiveShadow = false;

        // Exclude from pointer/reticle raycasts. SkinnedMesh.raycast() CPU-skins
        // every vertex and tests all triangles per ray — pointing at (or standing
        // near) the avatar tanks the frame rate. This only disables ray PICKING;
        // physics collisions use separate Rapier colliders and are unaffected, so
        // dropping/colliding items onto the avatar later still works. If ray
        // picking is needed, raycast a cheap proxy (bbox/capsule) instead.
        obj.raycast = () => {};

        // Disable MToon ink outlines — each outlined material is otherwise drawn
        // a second time (and again per eye in XR). Small look change, real GPU win.
        const mats = Array.isArray(obj.material)
          ? obj.material
          : [obj.material];
        for (const m of mats) {
          if (m && 'outlineWidthMode' in m) {
            m.outlineWidthMode = 0; // 0 = none
            m.outlineWidthFactor = 0;
            m.needsUpdate = true;
          }
        }
      }
    });

    // Bind the mixer to the normalized humanoid rig root, not the whole vrm.scene.
    // Retargeted clips address bones by name (e.g. 'Normalized_Avatar_LeftArm').
    // Some exports (seen on a UniVRM 0.x model) carry duplicate node names in the
    // wider scene graph, so THREE.PropertyBinding can resolve a track to the wrong
    // same-named node — one the humanoid's normalized→raw sync never reads, leaving
    // the mesh frozen in its bind (T) pose. The normalized rig subtree has unique
    // bone names, so binding here drives exactly the nodes humanoid.update() reads.
    const mixerRoot = this.vrm.humanoid?.normalizedHumanBonesRoot ?? vrm.scene;
    this.mixer = new THREE.AnimationMixer(mixerRoot);
    this.root.add(vrm.scene);

    console.log('[VRMAvatar] VRM loaded:', vrmUrl);
  }

  /**
   * Loads a Mesh2Motion GLB, retargets it onto the VRM skeleton, and registers it
   * as a named action. Call after load().
   * @param {string} name Logical name, e.g., 'idle' or 'walk'.
   * @param {string} glbUrl URL to the Mesh2Motion .glb file.
   * @param {string} tposeUrl URL to the Tpose GLB.
   * @returns {Promise<void>}
   */
  async loadGLBAnimation(name, glbUrl, tposeUrl) {
    if (!this.vrm) throw new Error('Call load() before loadGLBAnimation().');

    const loader = new GLTFLoader();

    // Load the pristine T-pose reference scene exactly once to guarantee perfect rest pose evaluation
    if (!this._restGlbScene) {
      if (!tposeUrl)
        throw new Error('[VRMAvatar] tposeUrl is required to load animations.');
      const tposeGltf = await loader.loadAsync(tposeUrl);
      this._restGlbScene = tposeGltf.scene;
    }

    const gltf = await loader.loadAsync(glbUrl);

    if (!gltf.animations || gltf.animations.length === 0) {
      throw new Error(`No animations found in GLB: ${glbUrl}`);
    }

    const rawClip = gltf.animations[0];
    const retargeted = retargetGLBClip(
      rawClip,
      gltf.scene,
      this.vrm,
      this._restGlbScene
    );
    const action = this.mixer.clipAction(retargeted);

    this._actions[name] = action;
    console.log(`[VRMAvatar] Animation '${name}' loaded and retargeted.`);
  }

  // -------------------------------------------------------------------------
  // Playback
  // -------------------------------------------------------------------------

  /**
   * Crossfades to a named animation.
   * @param {string} name Clip name registered via loadGLBAnimation.
   * @param {number} [fadeDuration=0.3] Duration of the fade in seconds.
   * @returns {void}
   */
  play(name, fadeDuration = 0.3) {
    const next = this._actions[name];
    if (!next) {
      console.warn(`[VRMAvatar] Unknown animation: '${name}'`);
      return;
    }
    if (this._currentAction === next) return;

    next.reset().setEffectiveWeight(1).play();

    if (this._currentAction) {
      this._currentAction.crossFadeTo(next, fadeDuration, true);
    }

    this._currentAction = next;
  }

  // -------------------------------------------------------------------------
  // Per-frame update
  // -------------------------------------------------------------------------

  /**
   * Must be called every frame. Advances the mixer and spring bones.
   * @param {number} delta Time since last frame in seconds.
   * @returns {void}
   */
  update(delta) {
    if (!this.vrm) return;

    // vrm.update() always drives its spring-bone manager. Detach it around the
    // call so spring bones are skipped here (node constraints — e.g. the twist
    // bones — stay on every frame and are cheap), then step spring bones at
    // ~30 Hz with the accumulated delta.
    const sbm = this.vrm.springBoneManager;
    this.vrm.springBoneManager = undefined;

    this.mixer?.update(delta);
    this._updateBlink(delta);
    this.vrm.update(delta);

    this.vrm.springBoneManager = sbm;

    this._springAccum += delta;
    if (sbm && this._springAccum >= this._springStep) {
      sbm.update(this._springAccum); // variable-dt step; three-vrm tolerates it
      this._springAccum = 0;
    }
  }

  // -------------------------------------------------------------------------
  // Expression helpers
  // -------------------------------------------------------------------------

  /**
   * Sets a VRM expression by name (e.g., 'blink', 'happy', 'angry').
   * @param {string} name Expression name.
   * @param {number} weight Weight value from 0.0 to 1.0.
   * @returns {void}
   */
  setExpression(name, weight) {
    this.vrm?.expressionManager?.setValue(name, weight);
  }

  _randomBlinkDelay() {
    return (
      this._blinkIntervalMin +
      Math.random() * (this._blinkIntervalMax - this._blinkIntervalMin)
    );
  }

  _updateBlink(delta) {
    if (!this.vrm?.expressionManager) return;

    this._blinkTimer += delta;

    if (!this._blinking) {
      if (this._blinkTimer >= this._nextBlinkAt) {
        this._blinking = true;
        this._blinkPhase = 0;
        this._blinkTimer = 0;
      }
      return;
    }

    const CLOSE_DURATION = 0.06; // seconds to fully close
    const OPEN_DURATION = 0.1; // seconds to fully open

    if (this._blinkPhase === 0) {
      const t = Math.min(this._blinkTimer / CLOSE_DURATION, 1);
      this.setExpression('blink', t);
      if (t >= 1) {
        this._blinkPhase = 1;
        this._blinkTimer = 0;
      }
    } else {
      const t = Math.min(this._blinkTimer / OPEN_DURATION, 1);
      this.setExpression('blink', 1 - t);
      if (t >= 1) {
        this._blinking = false;
        this._blinkTimer = 0;
        this._nextBlinkAt = this._randomBlinkDelay();
      }
    }
  }
}
