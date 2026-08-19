import * as THREE from 'three';
import * as xb from 'xrblocks';

/**
 * GNMScene — renders the GNM parametric head and animates it.
 *
 * Owns the Three.js mesh (positions streamed from GNMHeadModel), the material
 * modes, wireframe / landmark / skeleton overlays, per-component visibility,
 * gaze tracking, and the animation drivers (expression tour, identity morph,
 * component pulse, idle sway, turntable).
 */

const WORLD_HEAD_Y = 1.35; // where to place the head center in world space
const WORLD_HEAD_Z = -0.62;

// Per-vertex material palette (indexed by material_id from the exporter:
// skin, teeth, gums, tongue, scleras, irises, pupils).
const MATERIAL_COLORS = [
  '#d9a183',
  '#f2eddc',
  '#c4726b',
  '#b44f48',
  '#f4f2ec',
  '#5d4630',
  '#100e0d',
];

const JOINT_LABELS = ['neck', 'head', 'left eye', 'right eye'];

// Indices into JOINT_LABELS, used by the face tracker to drive head and gaze.
const HEAD_JOINT = 1;
const EYE_JOINTS = [2, 3];

// How often a tracked face refreshes the control panel's sliders.
const TRACKED_SYNC_INTERVAL_MS = 250;

const TOUR_FADE_SECONDS = 0.9;
const TOUR_HOLD_SECONDS = 1.3;
const MORPH_FADE_SECONDS = 1.6;
const MORPH_HOLD_SECONDS = 0.9;

export class GNMScene extends xb.Script {
  constructor(model, samplers) {
    super();
    this.model = model;
    this.samplers = samplers;

    // View state.
    this.materialMode = 'studio';
    this.visibleComponents = new Array(model.meta.componentNames.length).fill(
      true
    );

    // Tracking / animation state.
    this.eyesFollowCamera = true;
    this.headFollowsCamera = false;
    this.idleSway = false;
    this.turntable = false;
    this.animationSpeed = 1;
    this.tour = null; // {phase, t, classIndex}
    this.morph = null; // {phase, t}
    this.pulse = null; // {kind: 'identity'|'expression', index, base}
    this.pulseEnabled = false;
    this._pulseTime = 0;
    this._time = 0;
    this._smoothedRotations = new Float32Array(model.numJoints * 3);

    this.lastComputeMs = 0;
    /** Called when identity/expression change from inside the scene. */
    this.onModelChanged = null;
    /** Called with a status string (e.g. current tour expression). */
    this.onStatus = null;

    // The entry point owns the UI. This keeps the model scene independent of
    // one UI renderer and lets the same head run in focused samples.
    this.spatialUI = null;

    // Set by the entry point when photo / webcam fitting is wired up. Ticked
    // from `update` rather than its own rAF so it survives entering XR.
    this.faceFitter = null;
    this.faceTracking = false;
    this._preTrackingState = null;
    this._lastTrackedNotify = 0;
  }

  init() {
    const model = this.model;

    // The head + overlays live under `anchor`, which is presented by the
    // current ModelViewer API after the first geometry update.
    this.anchor = new THREE.Group();
    // Match the original GNM viewer: the invisible cylinder rotates the model
    // and the pedestal translates it. The head itself is not a hit surface.
    this.anchor.xb = {pointerEvents: 'none'};
    this.modelViewer = new xb.ModelViewer({
      origin: 'center',
      platformMargin: new THREE.Vector2(0.12, 0.12),
    });
    this.add(this.modelViewer);

    // GNM geometry.
    const geometry = new THREE.BufferGeometry();
    this.positionAttribute = new THREE.BufferAttribute(
      new Float32Array(model.numVertices * 3),
      3
    );
    this.positionAttribute.setUsage(THREE.DynamicDrawUsage);
    geometry.setAttribute('position', this.positionAttribute);
    geometry.setAttribute(
      'color',
      new THREE.BufferAttribute(this._buildMaterialColors(), 3)
    );
    this._regionColors = null; // built lazily for the regions mode
    this.fullIndex = new THREE.BufferAttribute(model.triangles, 1);
    geometry.setIndex(this.fullIndex);
    this.geometry = geometry;

    this.materials = {
      studio: new THREE.MeshStandardMaterial({
        vertexColors: true,
        roughness: 0.58,
        metalness: 0.02,
        polygonOffset: true,
        polygonOffsetFactor: 1,
        polygonOffsetUnits: 1,
      }),
      clay: new THREE.MeshStandardMaterial({
        color: 0xb9b2aa,
        roughness: 0.82,
        metalness: 0.0,
        polygonOffset: true,
        polygonOffsetFactor: 1,
        polygonOffsetUnits: 1,
      }),
      normals: new THREE.MeshNormalMaterial({
        polygonOffset: true,
        polygonOffsetFactor: 1,
        polygonOffsetUnits: 1,
      }),
      regions: new THREE.MeshStandardMaterial({
        vertexColors: true,
        roughness: 0.75,
        metalness: 0.0,
        polygonOffset: true,
        polygonOffsetFactor: 1,
        polygonOffsetUnits: 1,
      }),
    };
    this.mesh = new THREE.Mesh(geometry, this.materials.studio);
    this.mesh.frustumCulled = false;
    this.mesh.name = 'GNM Head';
    this.anchor.add(this.mesh);

    // Wireframe mode.
    const wireGeometry = new THREE.BufferGeometry();
    wireGeometry.setAttribute('position', this.positionAttribute);
    wireGeometry.setIndex(
      new THREE.BufferAttribute(this._buildQuadEdgeIndex(), 1)
    );
    this.wireframe = new THREE.LineSegments(
      wireGeometry,
      new THREE.LineBasicMaterial({
        color: 0x30343c,
        transparent: true,
        opacity: 0.45,
      })
    );
    this.wireframe.frustumCulled = false;
    this.wireframe.visible = false;
    // Overlay: never a pointer target — lines return no surface normal, which
    // would otherwise trap the reticle at the origin.
    this.wireframe.xb = {pointerEvents: 'none'};
    this.anchor.add(this.wireframe);

    const landmarkCount = model.landmarkIndices.length / 3;
    this.landmarkPoints = new Float32Array(landmarkCount * 3);
    this.landmarkMesh = new THREE.InstancedMesh(
      new THREE.SphereGeometry(0.0021, 10, 8),
      new THREE.MeshBasicMaterial({color: 0x2fe3a8}),
      landmarkCount
    );
    this.landmarkMesh.frustumCulled = false;
    this.landmarkMesh.visible = false;
    this.landmarkMesh.xb = {pointerEvents: 'none'}; // overlay, not a target
    this.anchor.add(this.landmarkMesh);

    this.jointMesh = new THREE.InstancedMesh(
      new THREE.SphereGeometry(0.0055, 12, 10),
      new THREE.MeshBasicMaterial({color: 0xffb037, depthTest: false}),
      model.numJoints
    );
    this.jointMesh.renderOrder = 10;
    this.jointMesh.frustumCulled = false;
    const bonePositions = new Float32Array((model.numJoints - 1) * 2 * 3);
    this.boneAttribute = new THREE.BufferAttribute(bonePositions, 3);
    this.boneAttribute.setUsage(THREE.DynamicDrawUsage);
    const boneGeometry = new THREE.BufferGeometry();
    boneGeometry.setAttribute('position', this.boneAttribute);
    this.boneLines = new THREE.LineSegments(
      boneGeometry,
      new THREE.LineBasicMaterial({color: 0xffb037, depthTest: false})
    );
    this.boneLines.renderOrder = 10;
    this.boneLines.frustumCulled = false;
    this.skeletonGroup = new THREE.Group();
    this.skeletonGroup.add(this.jointMesh, this.boneLines);
    this.skeletonGroup.visible = false;
    this.skeletonGroup.xb = {pointerEvents: 'none'}; // overlay, not a target
    this.anchor.add(this.skeletonGroup);

    const key = new THREE.DirectionalLight(0xfff1e0, 2.6);
    key.position.set(0.7, 2.3, 0.9);
    const fill = new THREE.DirectionalLight(0xbdd2ff, 1.0);
    fill.position.set(-1.1, 1.4, 0.4);
    const rim = new THREE.DirectionalLight(0xffffff, 1.6);
    rim.position.set(-0.2, 1.9, -1.4);
    const hemisphere = new THREE.HemisphereLight(0x93a4c0, 0x40382f, 0.9);
    for (const light of [key, fill, rim]) {
      light.target.position.set(0, WORLD_HEAD_Y, WORLD_HEAD_Z);
      this.add(light.target);
      this.add(light);
    }
    this.add(hemisphere);

    // First shape.
    this.model.dirty = true;
    this._refreshGeometry();

    // Now that geometry exists, wrap it in the ModelViewer pedestal.
    this._setupModelViewer();

    // Build controls only after the first valid head geometry exists. A UI
    // setup problem must not leave the model with an empty vertex buffer.
    this.spatialUI?.build();
  }

  /**
   * Presents the generated head through ModelViewer, then places its centered
   * origin at the intended world position. ModelViewer creates its current
   * rotation and translation surfaces from the computed content bounds.
   */
  _setupModelViewer() {
    const viewer = this.modelViewer;
    viewer.setContent(this.anchor);
    viewer.position.set(0, WORLD_HEAD_Y, WORLD_HEAD_Z);
    this._modelViewerHomeY = viewer.position.y;
  }

  _buildMaterialColors() {
    const model = this.model;
    const palette = MATERIAL_COLORS.map((c) => new THREE.Color(c));
    const colors = new Float32Array(model.numVertices * 3);
    for (let v = 0; v < model.numVertices; ++v) {
      const color = palette[model.materialId[v]] ?? palette[0];
      colors[v * 3] = color.r;
      colors[v * 3 + 1] = color.g;
      colors[v * 3 + 2] = color.b;
    }
    return colors;
  }

  _buildRegionColors() {
    const model = this.model;
    const regionCount = model.meta.regionNames.length;
    const palette = [];
    for (let i = 0; i < regionCount; ++i) {
      palette.push(new THREE.Color().setHSL((i * 0.61803) % 1, 0.62, 0.55));
    }
    const neutral = new THREE.Color('#6d6d70');
    const colors = new Float32Array(model.numVertices * 3);
    for (let v = 0; v < model.numVertices; ++v) {
      const id = model.regionId[v];
      const color = id === 255 ? neutral : palette[id];
      colors[v * 3] = color.r;
      colors[v * 3 + 1] = color.g;
      colors[v * 3 + 2] = color.b;
    }
    return colors;
  }

  _buildQuadEdgeIndex() {
    const quads = this.model.quads;
    const V = this.model.numVertices;
    const seen = new Set();
    const edges = [];
    for (let q = 0; q < quads.length; q += 4) {
      for (let k = 0; k < 4; ++k) {
        const a = quads[q + k];
        const b = quads[q + ((k + 1) % 4)];
        const key = a < b ? a * V + b : b * V + a;
        if (seen.has(key)) continue;
        seen.add(key);
        edges.push(a, b);
      }
    }
    return Uint16Array.from(edges);
  }

  /** Sends a status line to both the DOM panel and the spatial panels. */
  _emitStatus(text) {
    this.onStatus?.(text);
    this.spatialUI?.setStatus(text);
  }

  setMaterialMode(mode) {
    if (!this.materials[mode]) return;
    this.materialMode = mode;
    if (mode === 'regions' && !this._regionColors) {
      this._regionColors = new THREE.BufferAttribute(
        this._buildRegionColors(),
        3
      );
    }
    if (mode === 'regions') {
      this.geometry.setAttribute('color', this._regionColors);
    } else if (mode === 'studio') {
      this.geometry.setAttribute(
        'color',
        new THREE.BufferAttribute(this._buildMaterialColors(), 3)
      );
    }
    this.mesh.material = this.materials[mode];
  }

  setWireframeVisible(visible) {
    this.wireframe.visible = visible;
  }

  setLandmarksVisible(visible) {
    this.landmarkMesh.visible = visible;
    if (visible) this._updateLandmarks();
  }

  setSkeletonVisible(visible) {
    this.skeletonGroup.visible = visible;
    if (visible) this._updateSkeleton();
  }

  setComponentVisible(componentIndex, visible) {
    this.visibleComponents[componentIndex] = visible;
    const allVisible = this.visibleComponents.every(Boolean);
    if (allVisible) {
      this.geometry.setIndex(this.fullIndex);
      return;
    }
    const {triangles, componentId} = this.model;
    const filtered = [];
    for (let t = 0; t < triangles.length; t += 3) {
      if (this.visibleComponents[componentId[triangles[t]]]) {
        filtered.push(triangles[t], triangles[t + 1], triangles[t + 2]);
      }
    }
    this.geometry.setIndex(
      new THREE.BufferAttribute(Uint16Array.from(filtered), 1)
    );
  }

  // ------------------------------------------------------------- sampling --

  sampleIdentity(genderWeights, ethnicityWeights, sigma, smooth = true) {
    const target = this.samplers.sampleIdentity(
      genderWeights,
      ethnicityWeights,
      sigma
    );
    this._applyIdentity(target, smooth);
    return target;
  }

  sampleRandomIdentity(sigma = 1) {
    this._applyIdentity(this.samplers.randomIdentity(sigma), true);
  }

  sampleExpression(classWeights, sigma, smooth = true) {
    const target = this.samplers.sampleExpression(classWeights, sigma);
    this._applyExpression(target, smooth);
    return target;
  }

  sampleRandomExpression(sigma = 1) {
    this._applyExpression(this.samplers.randomExpression(sigma), true);
  }

  resetToNeutral() {
    this.setExpressionTour(false);
    this.setIdentityMorph(false);
    this.model.resetExpression();
    this.model.resetPose();
    this._smoothedRotations.fill(0);
    this.onModelChanged?.();
  }

  /** Captures the full parameter state of the current face. */
  capturePreset() {
    const model = this.model;
    return {
      identity: Array.from(model.identity),
      expression: Array.from(model.expression),
      rotations: Array.from(model.rotations),
      translation: Array.from(model.translation),
    };
  }

  /**
   * Applies a captured/loaded preset. Stops any running animation drivers so
   * the loaded pose is not immediately overwritten.
   */
  applyPreset(preset, smooth = true) {
    this.setExpressionTour(false);
    this.setIdentityMorph(false);
    this.setPulseEnabled?.(false);

    const model = this.model;
    this._applyIdentity(Float32Array.from(preset.identity), smooth);
    this._applyExpression(Float32Array.from(preset.expression), smooth);

    const rotations = preset.rotations ?? [];
    for (let j = 0; j < model.numJoints; ++j) {
      const o = j * 3;
      model.setJointRotation(
        j,
        rotations[o] || 0,
        rotations[o + 1] || 0,
        rotations[o + 2] || 0
      );
    }
    this._smoothedRotations.set(model.rotations);
    const t = preset.translation ?? [];
    model.setTranslation(t[0] || 0, t[1] || 0, t[2] || 0);

    this.onModelChanged?.();
  }

  _applyIdentity(target, smooth) {
    this.morph = null;
    if (smooth) {
      this.model.beginIdentityBlend(target);
      this._idFade = {t: 0};
    } else {
      this.model.setIdentityVector(target);
    }
    this.onModelChanged?.();
  }

  _applyExpression(target, smooth) {
    this.tour = null;
    if (smooth) {
      this.model.beginExpressionBlend(target);
      this._exprFade = {t: 0};
    } else {
      this.model.setExpressionVector(target);
    }
    this.onModelChanged?.();
  }

  /**
   * Applies an identity solved from a photo or webcam frame.
   *
   * Stops the identity morph first: it owns the same blend slot, and leaving it
   * running would walk the fitted face back off within a second.
   *
   * @param {!Float32Array} identity Fitted coefficients.
   * @param {boolean=} smooth Crossfade rather than snap.
   */
  applyFittedIdentity(identity, smooth = true) {
    this.setIdentityMorph(false);
    this._applyIdentity(identity, smooth);
  }

  /**
   * Hands the head over to the face tracker.
   *
   * Every driver that writes the same channels is suspended, and the previous
   * settings are remembered so stopping the tracker gives the user back the
   * demo they had configured. Without this the tracked expression fights the
   * tour, and the camera-following gaze fights the tracked one.
   */
  beginFaceTracking() {
    if (this._preTrackingState) return;
    this._preTrackingState = {
      eyesFollowCamera: this.eyesFollowCamera,
      headFollowsCamera: this.headFollowsCamera,
      idleSway: this.idleSway,
      pulseEnabled: this.pulseEnabled,
    };
    this.setExpressionTour(false);
    this.setIdentityMorph(false);
    this.setPulseEnabled(false);
    this.eyesFollowCamera = false;
    this.headFollowsCamera = false;
    this.idleSway = false;
    this.faceTracking = true;
  }

  /** Restores the drivers suspended by `beginFaceTracking`. */
  endFaceTracking() {
    this.faceTracking = false;
    const previous = this._preTrackingState;
    if (!previous) return;
    this._preTrackingState = null;
    this.eyesFollowCamera = previous.eyesFollowCamera;
    this.headFollowsCamera = previous.headFollowsCamera;
    this.idleSway = previous.idleSway;
    this.setPulseEnabled(previous.pulseEnabled);
    // The tracker leaves the head wherever the last solved frame put it.
    this.model.resetPose();
    this._smoothedRotations.fill(0);
    this.onModelChanged?.();
  }

  /**
   * Drives the head from one solved frame.
   *
   * Written straight into the model rather than through the blend path: this
   * runs at camera rate, and a crossfade would lag every frame behind by its
   * own duration.
   *
   * @param {{expression: ?Float32Array, headRotation: ?Float32Array,
   *     gaze: ?{x: number, y: number}}} solution Channels to apply; a null
   *     channel is left alone.
   */
  applyTrackedFace({expression, headRotation, gaze}) {
    const model = this.model;
    if (expression) {
      this._exprFade = null;
      this.tour = null;
      model.setExpressionVector(expression);
    }
    if (headRotation) {
      model.setJointRotation(
        HEAD_JOINT,
        headRotation[0],
        headRotation[1],
        headRotation[2]
      );
    }
    if (gaze) {
      // The camera-following gaze writes the same two joints every frame, so
      // leaving it on would silently undo the tracked one. Turning it off is
      // visible: the View tab's toggle is refreshed from the scene each frame.
      this.eyesFollowCamera = false;
      // Same convention as `_updateGaze`: the eye's forward is +z, so a target
      // to its +x is a rotation about +y and one above it is about -x.
      for (const joint of EYE_JOINTS) {
        model.setJointRotation(joint, -gaze.y, gaze.x, 0);
      }
      this._smoothedRotations.set(model.rotations);
    }
    // Notifying per frame would re-sync every built parameter slider — up to
    // 636 of them — at camera rate. The sliders are a readout here, not a
    // control, so they are refreshed a few times a second instead.
    const now = performance.now();
    if (now - this._lastTrackedNotify > TRACKED_SYNC_INTERVAL_MS) {
      this._lastTrackedNotify = now;
      this.onModelChanged?.();
    }
  }

  setExpressionTour(enabled) {
    this.tour = enabled ? {phase: 'fade', t: 0, classIndex: 0} : null;
    if (enabled) {
      this._startTourStep(0);
    } else {
      this._emitStatus('');
    }
  }

  setIdentityMorph(enabled) {
    this.morph = enabled ? {phase: 'fade', t: 0} : null;
    if (enabled) {
      this.model.beginIdentityBlend(this.samplers.randomIdentity(1));
    }
  }

  setPulse(kind, index) {
    this.pulse = {kind, index, base: this._paramValue(kind, index)};
    this._pulseTime = 0;
  }

  setPulseEnabled(enabled) {
    if (!enabled && this.pulse) {
      this._setParamValue(this.pulse.kind, this.pulse.index, this.pulse.base);
      this.onModelChanged?.();
    }
    this.pulseEnabled = enabled;
    this._pulseTime = 0;
    if (enabled && this.pulse) {
      this.pulse.base = this._paramValue(this.pulse.kind, this.pulse.index);
    }
  }

  _paramValue(kind, index) {
    return kind === 'identity'
      ? this.model.identity[index]
      : this.model.expression[index];
  }

  _setParamValue(kind, index, value) {
    if (kind === 'identity') this.model.setIdentityParam(index, value);
    else this.model.setExpressionParam(index, value);
  }

  _startTourStep(classIndex) {
    const target = this.samplers.sampleExpression(classIndex, 0.85);
    this.model.beginExpressionBlend(target);
    this.tour = {phase: 'fade', t: 0, classIndex};
    const label = this.samplers.expressionClasses[classIndex].replace(
      /_/g,
      ' '
    );
    this._emitStatus(`expression tour — ${label}`);
  }

  _updateTour(dt) {
    const tour = this.tour;
    tour.t += dt;
    if (tour.phase === 'fade') {
      const t = Math.min(tour.t / TOUR_FADE_SECONDS, 1);
      this.model.setExpressionBlend(smoothstep(t));
      if (t >= 1) {
        tour.phase = 'hold';
        tour.t = 0;
      }
    } else if (tour.t >= TOUR_HOLD_SECONDS) {
      const next =
        (tour.classIndex + 1) % this.samplers.expressionClasses.length;
      this._startTourStep(next);
    }
  }

  _updateMorph(dt) {
    const morph = this.morph;
    morph.t += dt;
    if (morph.phase === 'fade') {
      const t = Math.min(morph.t / MORPH_FADE_SECONDS, 1);
      this.model.setIdentityBlend(smoothstep(t));
      if (t >= 1) {
        morph.phase = 'hold';
        morph.t = 0;
      }
    } else if (morph.t >= MORPH_HOLD_SECONDS) {
      this.model.beginIdentityBlend(this.samplers.randomIdentity(1));
      morph.phase = 'fade';
      morph.t = 0;
    }
  }

  _updatePulse(dt) {
    if (!this.pulseEnabled || !this.pulse) return;
    this._pulseTime += dt;
    const value = this.pulse.base + 2.3 * Math.sin(this._pulseTime * 2.6);
    this._setParamValue(this.pulse.kind, this.pulse.index, value);
  }

  _updateGaze(dt) {
    const camera = xb.core?.camera;
    if (!camera) return;
    const model = this.model;
    const target = this._tmpTarget ?? (this._tmpTarget = new THREE.Vector3());
    camera.getWorldPosition(target);
    this.anchor.worldToLocal(target);

    const setLook = (jointIndex, parentIndex, maxAngle, rate) => {
      const jw = model.jointsWorld;
      const jx = jw[jointIndex * 3];
      const jy = jw[jointIndex * 3 + 1];
      const jz = jw[jointIndex * 3 + 2];
      let dx = target.x - jx;
      let dy = target.y - jy;
      let dz = target.z - jz;
      const length = Math.hypot(dx, dy, dz) || 1;
      dx /= length;
      dy /= length;
      dz /= length;
      // Direction in the parent joint's frame (rows of R^T are columns of R).
      const parentRotation = model.getJointWorldRotation(parentIndex);
      const lx =
        parentRotation[0] * dx +
        parentRotation[3] * dy +
        parentRotation[6] * dz;
      const ly =
        parentRotation[1] * dx +
        parentRotation[4] * dy +
        parentRotation[7] * dz;
      const lz =
        parentRotation[2] * dx +
        parentRotation[5] * dy +
        parentRotation[8] * dz;
      // Rotation taking +z to (lx, ly, lz): axis = z × d, angle = atan2.
      let axisX = -ly;
      let axisY = lx;
      const sinAngle = Math.hypot(axisX, axisY);
      let angle = Math.atan2(sinAngle, lz);
      if (sinAngle > 1e-6) {
        axisX /= sinAngle;
        axisY /= sinAngle;
      } else {
        axisX = 0;
        axisY = 0;
        angle = 0;
      }
      angle = Math.min(angle, maxAngle);
      const targetRx = axisX * angle;
      const targetRy = axisY * angle;
      const blend = 1 - Math.exp(-rate * dt);
      const o = jointIndex * 3;
      const smoothed = this._smoothedRotations;
      smoothed[o] += (targetRx - smoothed[o]) * blend;
      smoothed[o + 1] += (targetRy - smoothed[o + 1]) * blend;
      smoothed[o + 2] += (0 - smoothed[o + 2]) * blend;
      model.setJointRotation(jointIndex, smoothed[o], smoothed[o + 1], 0);
    };

    if (this.headFollowsCamera) setLook(1, 0, 0.42, 4);
    if (this.eyesFollowCamera) {
      setLook(2, 1, 0.55, 12);
      setLook(3, 1, 0.55, 12);
    }
  }

  _updateIdleSway(time) {
    const sway = 0.05;
    this.model.setJointRotation(
      0,
      Math.sin(time * 0.53) * sway * 0.6,
      Math.sin(time * 0.31) * sway,
      Math.sin(time * 0.43) * sway * 0.35
    );
  }

  update() {
    const dt =
      Math.min(xb.core?.timer?.getDelta?.() ?? 0.016, 0.1) *
        this.animationSpeed || 0.016;
    this._time += dt;

    if (this.turntable) this.anchor.rotation.y += dt * 0.6;
    if (this.tour) this._updateTour(dt);
    if (this.morph) this._updateMorph(dt);
    if (this._idFade) {
      this._idFade.t += dt / 1.1;
      this.model.setIdentityBlend(smoothstep(Math.min(this._idFade.t, 1)));
      if (this._idFade.t >= 1) this._idFade = null;
    }
    if (this._exprFade) {
      this._exprFade.t += dt / 0.7;
      this.model.setExpressionBlend(smoothstep(Math.min(this._exprFade.t, 1)));
      if (this._exprFade.t >= 1) this._exprFade = null;
    }
    this._updatePulse(dt);
    if (this.idleSway) this._updateIdleSway(this._time);
    if (this.eyesFollowCamera || this.headFollowsCamera) this._updateGaze(dt);
    // After the drivers above, so a tracked face wins any channel they share.
    this.faceFitter?.tick();

    this.spatialUI?.update();
    if (this.model.dirty) this._refreshGeometry();
  }

  _refreshGeometry() {
    const start = performance.now();
    this.model.computeVertices(this.positionAttribute.array);
    this.positionAttribute.needsUpdate = true;
    this.geometry.computeVertexNormals();
    this.geometry.boundingSphere = null;
    if (this.landmarkMesh.visible) this._updateLandmarks();
    if (this.skeletonGroup.visible) this._updateSkeleton();
    this.lastComputeMs = performance.now() - start;
  }

  _updateLandmarks() {
    const count = this.model.computeLandmarks(
      this.positionAttribute.array,
      this.landmarkPoints
    );
    const matrix = this._tmpMatrix ?? (this._tmpMatrix = new THREE.Matrix4());
    for (let l = 0; l < count; ++l) {
      matrix.makeTranslation(
        this.landmarkPoints[l * 3],
        this.landmarkPoints[l * 3 + 1],
        this.landmarkPoints[l * 3 + 2]
      );
      this.landmarkMesh.setMatrixAt(l, matrix);
    }
    this.landmarkMesh.instanceMatrix.needsUpdate = true;
  }

  _updateSkeleton() {
    const model = this.model;
    const joints = model.jointsWorld;
    const matrix = this._tmpMatrix ?? (this._tmpMatrix = new THREE.Matrix4());
    for (let j = 0; j < model.numJoints; ++j) {
      matrix.makeTranslation(
        joints[j * 3],
        joints[j * 3 + 1],
        joints[j * 3 + 2]
      );
      this.jointMesh.setMatrixAt(j, matrix);
    }
    this.jointMesh.instanceMatrix.needsUpdate = true;
    const bones = this.boneAttribute.array;
    let b = 0;
    for (let j = 1; j < model.numJoints; ++j) {
      const p = model.jointParents[j];
      bones[b++] = joints[p * 3];
      bones[b++] = joints[p * 3 + 1];
      bones[b++] = joints[p * 3 + 2];
      bones[b++] = joints[j * 3];
      bones[b++] = joints[j * 3 + 1];
      bones[b++] = joints[j * 3 + 2];
    }
    this.boneAttribute.needsUpdate = true;
  }

  exportOBJ() {
    const positions = this.positionAttribute.array;
    const normals = this.geometry.getAttribute('normal').array;
    const triangles = this.model.triangles;
    const lines = ['# GNM Head — exported from the XR Blocks GNM demo'];
    for (let v = 0; v < positions.length; v += 3) {
      lines.push(
        `v ${positions[v].toFixed(6)} ${positions[v + 1].toFixed(6)} ` +
          `${positions[v + 2].toFixed(6)}`
      );
    }
    for (let v = 0; v < normals.length; v += 3) {
      lines.push(
        `vn ${normals[v].toFixed(4)} ${normals[v + 1].toFixed(4)} ` +
          `${normals[v + 2].toFixed(4)}`
      );
    }
    for (let t = 0; t < triangles.length; t += 3) {
      const a = triangles[t] + 1;
      const b = triangles[t + 1] + 1;
      const c = triangles[t + 2] + 1;
      lines.push(`f ${a}//${a} ${b}//${b} ${c}//${c}`);
    }
    return lines.join('\n');
  }

  get jointLabels() {
    return JOINT_LABELS;
  }
}

function smoothstep(t) {
  return t * t * (3 - 2 * t);
}
