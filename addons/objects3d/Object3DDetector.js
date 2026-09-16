import * as THREE from 'three';
import { enableAcceleratedRaycast, Script, core, getDeviceCameraWorldFromView, getCameraParametersSnapshot } from 'xrblocks';
import { Detected3DObject } from './Detected3DObject.js';
import { sampleDepthInMaskAcrossFrames, anchorFromBboxCenter } from './geometry/DepthSampling.js';
import { buildFrozenCamera } from './geometry/FrozenCamera.js';
import { PoseRing } from './geometry/PoseRing.js';
import { RoomFrameAccumulator, estimateRoomYawFromMesh, yawRelativeToRoom } from './geometry/RoomFrame.js';
import { unionDetections, snapBoxToFloor, fuseIntoBoxes } from './geometry/Fusion.js';
import { radiusFromBbox, rejectByAnchor, rejectByY, rejectByAnchorDepth, fitYawOBB } from './geometry/ObbFitting.js';
import { isSurfaceLabel, categorize, isTinyFlatLabel } from './labels/Categories.js';
import { getSam, samEncodeSnapshot, samMaskFromBbox } from './masks/SamMask.js';
import { segmenterMaskFromSnapshot } from './masks/SegmenterMask.js';
import { rebuildBoxGroupGeometry, CAT_COLOR, buildBoxGroup } from './visuals/BoxGroup.js';
import './geometry/YawEstimation.js';
import './masks/SamDevice.js';

/**
 * Reusable 3-D object-detection Script addon.
 *
 * `Object3DDetector` wraps the full pipeline in a reusable {@link Script}:
 * snap camera + depth mesh, run 2-D detection, obtain
 * per-object segmentation masks, raycast depth samples into world space, fit an
 * oriented bounding box (OBB), fuse across views, and optionally show debug
 * wireframe boxes.
 */
const DEPTH_SAMPLE_GRID_SIZE = 10;
const DEPTH_SAMPLE_FRAME_COUNT = 3;
const MAX_CENTER_HORIZONTAL_DISTANCE_M = 6;
const MIN_CENTER_HEIGHT_M = -1;
const MAX_CENTER_HEIGHT_M = 5;
const MIN_POINTS_BY_CATEGORY = {
    small: 4,
    light: 8,
    flat: 8,
    furniture: 20,
};
const MAX_BOX_WIDTH_M = 4;
const MAX_BOX_HEIGHT_M = 3;
const MAX_BOX_DEPTH_M = 4;
const MIN_DEGENERATE_HORIZONTAL_SIZE_M = 0.5;
const MIN_DEGENERATE_HEIGHT_RATIO = 0.1;
// Kick off the three-mesh-bvh dynamic import at module load so it is ready
// well before the first detect() call.
const _bvhReady = enableAcceleratedRaycast().catch(() => false);
/**
 * The 3-D object-detection pipeline as a reusable {@link Script}. See the
 * `objects_3d` demo for a worked integration. Attach it to the scene before
 * `xb.init()`, then
 * call `await detector.detect()` to populate `detector.results`.
 *
 * ```ts
 * import {Object3DDetector} from 'xrblocks/addons/objects3d';
 * const detector = new Object3DDetector({showDebugBoxes: true});
 * xb.add(detector);
 * xb.init(options);
 * // …later…
 * const objects = await detector.detect();
 * ```
 */
class Object3DDetector extends Script {
    /**
     * @param options - Configuration options.
     */
    constructor(options = {}) {
        super();
        this._results = [];
        this._detectInFlight = false;
        // ~1.3 s of pose history at 90 fps, enough to cover passthrough video
        // pipeline latency when pairing a capture with its capture-time pose.
        this._poseRing = new PoseRing(120);
        this._roomFrame = new RoomFrameAccumulator();
        this._diagnostics = null;
        this._opts = {
            detectBackend: options.detectBackend ?? 'gemini',
            maskBackend: options.maskBackend ?? 'slimsam',
            fuseAcrossViews: options.fuseAcrossViews ?? true,
            showDebugBoxes: options.showDebugBoxes ?? false,
            maxRayDistance: options.maxRayDistance ?? 12,
            sceneBounds: {
                maxXZ: options.sceneBounds?.maxXZ ?? MAX_CENTER_HORIZONTAL_DISTANCE_M,
                minY: options.sceneBounds?.minY ?? MIN_CENTER_HEIGHT_M,
                maxY: options.sceneBounds?.maxY ?? MAX_CENTER_HEIGHT_M,
            },
            roomHalf: options.roomHalf ?? 3,
            cameraRotationOffset: {
                yaw: options.cameraRotationOffset?.yaw ?? 0,
                pitch: options.cameraRotationOffset?.pitch ?? 0,
                roll: options.cameraRotationOffset?.roll ?? 0,
            },
            orientation: {
                mode: options.orientation?.mode ?? 'roomFrame',
                roomYaw: options.orientation?.roomYaw ?? null,
                roomYawConfidence: options.orientation?.roomYawConfidence ?? 0,
                snapToleranceRad: options.orientation?.snapToleranceRad ?? (12 * Math.PI) / 180,
                minYawConfidence: options.orientation?.minYawConfidence ?? 0.35,
            },
        };
    }
    /**
     * Record the device-camera pose every frame so {@link detect} can pair a
     * captured video frame with the pose at the frame's `captureTime` — the
     * passthrough video lags head tracking, so the pose at snapshot time is
     * newer than the snapshot's pixels.
     */
    update() {
        const deviceCamera = core.deviceCamera;
        if (!deviceCamera || deviceCamera.simulatorCamera)
            return;
        // `core.renderer` may be a WebGPURenderer, whose XR manager types
        // `getCamera()` as a plain ArrayCamera; the device-camera helpers want the
        // WebXR-specific shape (same cast as PlanarVST).
        const xrCameras = core.renderer?.xr?.getCamera?.();
        if (!xrCameras?.cameras?.length)
            return;
        try {
            this._poseRing.push(performance.now(), getDeviceCameraWorldFromView(core.camera, xrCameras, deviceCamera, this._targetDevice()));
        }
        catch (_e) {
            // Pose momentarily unavailable; skip this frame.
        }
    }
    /** Currently fitted {@link Detected3DObject} instances from the last
     * (or accumulated) detect run. */
    get results() {
        return this._results;
    }
    /**
     * Diagnostics from the most recent {@link detect} call, or `null` before
     * the first one. See {@link Object3DDetectorDiagnostics}.
     */
    get diagnostics() {
        return this._diagnostics;
    }
    /** Poses currently held in the capture-time pose history ring. */
    get poseRingSize() {
        return this._poseRing.size;
    }
    /** Extra rotation applied to the device-camera pose, in radians. */
    get cameraRotationOffset() {
        return { ...this._opts.cameraRotationOffset };
    }
    /**
     * Adjust the camera rotation offset between detections, so a calibration
     * error can be nulled out interactively instead of by reloading. Omitted
     * components are left unchanged.
     */
    setCameraRotationOffset(offset) {
        const current = this._opts.cameraRotationOffset;
        current.yaw = offset.yaw ?? current.yaw;
        current.pitch = offset.pitch ?? current.pitch;
        current.roll = offset.roll ?? current.roll;
    }
    /** The orientation policy currently in force. */
    get orientationMode() {
        return this._opts.orientation.mode;
    }
    /**
     * Switch orientation policy between detections, so the modes can be
     * A/B compared on device without reloading.
     */
    setOrientationMode(mode) {
        this._opts.orientation.mode = mode;
    }
    /** The room frame accumulated so far, or `null` before any usable estimate. */
    get roomFrame() {
        return this._roomFrame.current;
    }
    /**
     * Discard the accumulated room frame. Call this after the user recenters or
     * moves to a different space; {@link clearDetections} does it too.
     */
    resetRoomFrame() {
        this._roomFrame.reset();
    }
    /**
     * Remove all existing results and their debug visuals from the scene.
     * Call this to reset the detector before a new area scan.
     */
    clearDetections() {
        for (const obj of this._results) {
            if (obj.boxGroup) {
                obj.boxGroup.traverse((o) => {
                    const mesh = o;
                    if (mesh.geometry)
                        mesh.geometry.dispose();
                    const mat = mesh.material;
                    if (mat) {
                        if (Array.isArray(mat))
                            mat.forEach((m) => m.dispose?.());
                        else
                            mat.dispose?.();
                    }
                });
                this.remove(obj.boxGroup);
            }
            this.remove(obj);
        }
        this._results = [];
        this._roomFrame.reset();
    }
    /**
     * Run the full detection + OBB-fitting pipeline and return the list of
     * fitted {@link Detected3DObject} instances.
     *
     * The call:
     * 1. Captures a camera snapshot and freezes both the camera matrix and the
     *    depth mesh at that instant.
     * 2. Runs 2-D object detection (Gemini / MediaPipe / both).
     * 3. For each detection, obtains a per-object segmentation mask (SAM /
     *    MediaPipe segmenter).
     * 4. Raycasts depth samples through the frozen mask into world space.
     * 5. Fits an oriented bounding box using a per-category strategy.
     * 6. Fuses the result into any matching existing box from a prior call.
     *
     * @returns Resolved list of fitted {@link Detected3DObject} instances,
     *   or the unchanged current results on re-entry / missing subsystems.
     */
    async detect() {
        if (!core.world?.objects) {
            console.warn('[Object3DDetector] object detection subsystem not available');
            return this._results;
        }
        const worldObjects = core.world.objects;
        const deviceCamera = core.deviceCamera;
        if (this._detectInFlight) {
            console.info('[Object3DDetector] detect already in flight, ignoring re-entry');
            return this._results;
        }
        this._detectInFlight = true;
        const t0 = performance.now();
        const diag = {
            startedAtMs: t0,
            frameLatencyMs: null,
            poseMatchErrorMs: null,
            poseRingSize: this._poseRing.size,
            usedDeviceCameraModel: false,
            cameraFovDeg: 0,
            cameraAspect: 0,
            cameraRotationOffsetDeg: {
                yaw: THREE.MathUtils.radToDeg(this._opts.cameraRotationOffset.yaw),
                pitch: THREE.MathUtils.radToDeg(this._opts.cameraRotationOffset.pitch),
                roll: THREE.MathUtils.radToDeg(this._opts.cameraRotationOffset.roll),
            },
            snapshotWidth: 0,
            snapshotHeight: 0,
            depthRemapIsIdentity: null,
            depthVsEyeRotationDeg: null,
            depthMeshVertices: null,
            detections2d: 0,
            fitted3d: 0,
            rejections: {},
            timings: {
                freshFrameWait: 0,
                snapshot: 0,
                depthMeshSnapshot: 0,
                detect2d: 0,
                masksAndFit: 0,
                total: 0,
            },
            error: null,
            orientationMode: this._opts.orientation.mode,
            roomYawDeg: null,
            roomYawConfidence: null,
            roomFrameSupportM2: null,
            yawStats: [],
        };
        const bail = (message) => {
            console.warn(`[Object3DDetector] ${message}`);
            diag.error = message;
            diag.timings.total = performance.now() - t0;
            this._diagnostics = diag;
            this._detectInFlight = false;
            return this._results;
        };
        if (!deviceCamera) {
            return bail('device camera not available');
        }
        // Wait for a fresh video frame before snapshotting: inside an immersive
        // session the hidden <video> element can be throttled, so getSnapshot
        // would otherwise read a frame captured seconds ago from a different
        // head pose — every box from that capture then lands rotated by the
        // intervening head motion. The frame's captureTime also lets us pick the
        // pose the head actually had when the pixels were captured.
        let captureTimeMs = null;
        try {
            const meta = await deviceCamera.waitForFreshFrame?.();
            if (meta) {
                captureTimeMs = meta.captureTime ?? meta.receiveTime ?? null;
                if (captureTimeMs !== null) {
                    diag.frameLatencyMs = performance.now() - captureTimeMs;
                }
            }
        }
        catch (_e) {
            // Freshness signal is best-effort only.
        }
        const tAfterWait = performance.now();
        diag.timings.freshFrameWait = tAfterWait - t0;
        // Wrap the whole body so the in-flight guard is always cleared even if the
        // setup below (canvas / camera clone / bvh / depth snapshot) throws; one
        // failure must not wedge the detector permanently.
        try {
            // Capture one snapshot frame that will be shared for detection + SAM.
            let snapImageData = null;
            try {
                snapImageData =
                    deviceCamera.getSnapshot({ outputFormat: 'imageData' }) ?? null;
            }
            catch (_e) {
                snapImageData = null;
            }
            if (!snapImageData) {
                return bail('no camera frame available');
            }
            diag.snapshotWidth = snapImageData.width;
            diag.snapshotHeight = snapImageData.height;
            // Derive base64 from the same ImageData to avoid a second video-frame read.
            const b64Canvas = document.createElement('canvas');
            b64Canvas.width = snapImageData.width;
            b64Canvas.height = snapImageData.height;
            b64Canvas.getContext('2d').putImageData(snapImageData, 0, 0);
            const snapBase64 = b64Canvas.toDataURL('image/jpeg', 0.9);
            // Freeze the camera model at snapshot time so raycasts align with the
            // snapshot pixels. The RGB frame comes from the physical passthrough
            // camera, whose intrinsics and pose differ from the XR render camera
            // (e.g. on Galaxy XR: ~48° vertical FOV near the right eye, versus the
            // ~90°+ union frustum between the eyes), so build the frozen camera from
            // the SDK's device-camera model. In the simulator both models coincide.
            const snapAspect = snapImageData.width / snapImageData.height;
            const deviceCam = this._buildDeviceFrozenCamera(snapAspect, captureTimeMs, diag);
            const frozenCam = deviceCam ?? this._buildRenderFrozenCamera(snapAspect);
            diag.usedDeviceCameraModel = deviceCam !== null;
            diag.cameraFovDeg = frozenCam.fov;
            diag.cameraAspect = frozenCam.aspect;
            this._collectDepthDiagnostics(diag);
            const tAfterSnapshot = performance.now();
            diag.timings.snapshot = tAfterSnapshot - tAfterWait;
            // Wait for the BVH patch before building the per-press bounds tree.
            await _bvhReady;
            // Clone and index the depth mesh.
            const frozenDepthMesh = this._snapshotDepthMesh();
            if (!frozenDepthMesh) {
                return bail('no depth mesh available');
            }
            diag.depthMeshVertices =
                frozenDepthMesh.geometry.attributes['position']?.count ?? null;
            // Estimate the room's dominant wall direction from this capture's depth
            // mesh, so ill-determined object yaws fall back to the room's axes rather
            // than to wherever the user happened to be facing at session start.
            try {
                this._roomFrame.push(estimateRoomYawFromMesh(frozenDepthMesh, {
                    viewerPosition: frozenCam.position,
                }));
            }
            catch (_e) {
                // Room estimation is an optimisation; fitting still works without it.
            }
            const roomFrame = this._roomFrame.current;
            if (roomFrame) {
                diag.roomYawDeg = THREE.MathUtils.radToDeg(roomFrame.yaw);
                diag.roomYawConfidence = roomFrame.confidence;
                diag.roomFrameSupportM2 = roomFrame.supportArea;
            }
            const orientation = {
                ...this._opts.orientation,
                roomYaw: roomFrame?.yaw ?? this._opts.orientation.roomYaw,
                roomYawConfidence: roomFrame?.confidence ?? this._opts.orientation.roomYawConfidence,
            };
            const tAfterDepthMesh = performance.now();
            diag.timings.depthMeshSnapshot = tAfterDepthMesh - tAfterSnapshot;
            const detectionSnapshot = {
                base64: snapBase64,
                imageData: snapImageData,
            };
            // Start SAM init + encode in parallel with 2-D detection.
            let samPrep = null;
            if (this._opts.maskBackend === 'slimsam') {
                samPrep = (async () => {
                    await getSam();
                    return samEncodeSnapshot(snapImageData);
                })();
                samPrep.catch(() => { });
            }
            try {
                // 2-D detection.
                let detected;
                try {
                    if (this._opts.detectBackend === 'both') {
                        // Submit both now so their queued runs retain the same frame pose.
                        const [mp, gm] = await Promise.all([
                            worldObjects.runDetection({
                                backend: 'mediapipe',
                                snapshot: detectionSnapshot,
                            }),
                            worldObjects.runDetection({
                                backend: 'gemini',
                                snapshot: detectionSnapshot,
                            }),
                        ]);
                        detected = unionDetections(mp, gm);
                    }
                    else {
                        detected = await worldObjects.runDetection({
                            backend: this._opts.detectBackend,
                            snapshot: detectionSnapshot,
                        });
                    }
                }
                catch (e) {
                    console.warn('[Object3DDetector] runDetection threw', e);
                    diag.error = `runDetection threw: ${e?.message ?? e}`;
                    return this._results;
                }
                finally {
                    diag.timings.detect2d = performance.now() - tAfterDepthMesh;
                }
                diag.detections2d = detected.length;
                if (!detected.length) {
                    console.info('[Object3DDetector] nothing detected');
                    return this._results;
                }
                // Await the SAM encoder that ran in parallel with detection.
                let samState = null;
                if (this._opts.maskBackend === 'slimsam' && samPrep) {
                    try {
                        samState = await samPrep;
                    }
                    catch (e) {
                        console.warn('[Object3DDetector] SAM encoder failed', e);
                        diag.error = `SAM encoder failed: ${e?.message ?? e}`;
                        return this._results;
                    }
                }
                const tAfterDetect2d = performance.now();
                const floorY = this._estimateFloorY();
                // Pipeline per-object work: mask decode (serial on GPU via samSerialize)
                // overlaps with depth raycasts for the previous object.
                const snapshot = snapImageData;
                const processOne = async (obj) => {
                    try {
                        if (isSurfaceLabel(obj.label))
                            return null;
                        const box2d = obj.detection2DBoundingBox;
                        let mask;
                        try {
                            mask =
                                this._opts.maskBackend === 'slimsam' && samState
                                    ? await samMaskFromBbox(samState, box2d)
                                    : await segmenterMaskFromSnapshot(snapshot, box2d);
                        }
                        catch (e) {
                            console.warn('[Object3DDetector] mask failed for', obj.label, e);
                            return null;
                        }
                        if (!mask)
                            return null;
                        const { points: raw } = await sampleDepthInMaskAcrossFrames(mask, box2d, DEPTH_SAMPLE_GRID_SIZE, DEPTH_SAMPLE_FRAME_COUNT, frozenCam, frozenDepthMesh, snapAspect, this._opts.maxRayDistance);
                        mask.close();
                        const anchor = anchorFromBboxCenter(box2d, frozenCam, frozenDepthMesh, snapAspect) ??
                            obj.position ??
                            null;
                        const category = categorize(obj.label);
                        let points;
                        if (category === 'flat') {
                            points = raw;
                        }
                        else if (category === 'small') {
                            const r = radiusFromBbox(box2d, frozenCam, anchor, {
                                pad: 1.1,
                                minR: 0.12,
                                maxR: 0.3,
                                fallback: 0.25,
                            });
                            points = rejectByAnchor(raw, anchor, r);
                        }
                        else if (category === 'light') {
                            const r = radiusFromBbox(box2d, frozenCam, anchor, {
                                pad: 1.2,
                                minR: 0.2,
                                maxR: 0.7,
                                fallback: 0.5,
                            });
                            points = rejectByY(rejectByAnchor(raw, anchor, r), 0.15);
                        }
                        else {
                            const r = radiusFromBbox(box2d, frozenCam, anchor, {
                                pad: 1.3,
                                minR: 0.4,
                                maxR: 2.0,
                                fallback: 1.0,
                            });
                            const depthFiltered = rejectByAnchorDepth(raw, frozenCam, anchor, r);
                            points = rejectByAnchor(depthFiltered, anchor, r);
                        }
                        const obb = fitYawOBB(points, {
                            category,
                            camera: frozenCam,
                            anchor,
                            box2d,
                            tinyFlat: isTinyFlatLabel(obj.label),
                            roomHalf: this._opts.roomHalf,
                            orientation,
                        });
                        if (!obb)
                            return null;
                        if (category === 'furniture' || category === 'small') {
                            snapBoxToFloor(obb, floorY);
                        }
                        const c = obb.center;
                        const bounds = this._opts.sceneBounds;
                        const farFromRoom = Math.abs(c.x) > bounds.maxXZ ||
                            Math.abs(c.z) > bounds.maxXZ ||
                            c.y < bounds.minY ||
                            c.y > bounds.maxY;
                        const minPoints = MIN_POINTS_BY_CATEGORY[category];
                        const tinyFlat = isTinyFlatLabel(obj.label);
                        const tooFewPoints = !tinyFlat && points.length < minPoints;
                        const oversize = obb.size.x > MAX_BOX_WIDTH_M ||
                            obb.size.y > MAX_BOX_HEIGHT_M ||
                            obb.size.z > MAX_BOX_DEPTH_M;
                        const horizMax = Math.max(obb.size.x, obb.size.z);
                        const degenerate = category !== 'flat' &&
                            horizMax > MIN_DEGENERATE_HORIZONTAL_SIZE_M &&
                            obb.size.y / horizMax < MIN_DEGENERATE_HEIGHT_RATIO;
                        if (farFromRoom || tooFewPoints || oversize || degenerate) {
                            console.warn('[Object3DDetector] reject', obj.label, {
                                farFromRoom,
                                tooFewPoints,
                                oversize,
                                degenerate,
                                kept: points.length,
                            });
                            for (const [reason, hit] of [
                                ['farFromRoom', farFromRoom],
                                ['tooFewPoints', tooFewPoints],
                                ['oversize', oversize],
                                ['degenerate', degenerate],
                            ]) {
                                if (hit)
                                    diag.rejections[reason] = (diag.rejections[reason] ?? 0) + 1;
                            }
                            return null;
                        }
                        return { obb, label: obj.label || 'object', category };
                    }
                    catch (e) {
                        console.warn('[Object3DDetector] pipeline error for', obj.label, e?.message ?? String(e));
                        return null;
                    }
                };
                const pipelineResults = await Promise.all(detected.map(processOne));
                diag.timings.masksAndFit = performance.now() - tAfterDetect2d;
                diag.fitted3d = pipelineResults.filter((r) => r?.obb).length;
                for (const r of pipelineResults) {
                    if (!r?.obb)
                        continue;
                    diag.yawStats.push({
                        label: r.label,
                        category: r.category,
                        yawDeg: THREE.MathUtils.radToDeg(r.obb.angle),
                        roomRelativeYawDeg: THREE.MathUtils.radToDeg(yawRelativeToRoom(r.obb.angle, roomFrame)),
                        confidence: r.obb.yawConfidence ?? 0,
                        method: r.obb.yawMethod ?? 'unknown',
                    });
                }
                // Serial fuse + add pass (fuseIntoBoxes mutates _results).
                for (const r of pipelineResults) {
                    if (!r || !r.obb)
                        continue;
                    const internalObb = r.obb;
                    if (this._opts.fuseAcrossViews) {
                        const matched = fuseIntoBoxes(this._results, internalObb, r.category, r.label);
                        if (matched) {
                            const obj = matched;
                            obj.syncFromInternalObb({
                                center: obj._fusionCenter,
                                size: obj._fusionSize,
                                angle: obj._fusionAngle,
                            });
                            if (this._opts.showDebugBoxes && obj.boxGroup) {
                                rebuildBoxGroupGeometry(obj.boxGroup, {
                                    center: obj._fusionCenter,
                                    size: obj._fusionSize,
                                    angle: obj._fusionAngle,
                                });
                            }
                            continue;
                        }
                    }
                    const newObj = new Detected3DObject(r.label, r.category, internalObb);
                    if (this._opts.showDebugBoxes) {
                        const color = CAT_COLOR[r.category] ?? 0x4cd964;
                        const grp = buildBoxGroup(internalObb, r.label, color);
                        newObj.boxGroup = grp;
                        this.add(grp);
                    }
                    this._results.push(newObj);
                    this.add(newObj);
                }
                return this._results;
            }
            finally {
                if (frozenDepthMesh.geometry) {
                    const geom = frozenDepthMesh.geometry;
                    geom.disposeBoundsTree?.();
                    geom.dispose();
                }
                frozenDepthMesh.material?.dispose?.();
                diag.timings.total = performance.now() - t0;
                this._diagnostics = diag;
                this._detectInFlight = false;
            }
        }
        finally {
            this._detectInFlight = false;
        }
    }
    /**
     * Build the frozen camera from the SDK's device-camera model (physical
     * passthrough intrinsics + pose on device; render-camera-derived square
     * crop in the simulator). Returns `null` when no camera parameters are
     * available yet (e.g. before init or outside an XR session).
     */
    _buildDeviceFrozenCamera(snapAspect, captureTimeMs = null, diag) {
        const deviceCamera = core.deviceCamera;
        if (!deviceCamera)
            return null;
        try {
            const params = getCameraParametersSnapshot(core.camera, core.renderer.xr.getCamera(), deviceCamera, this._targetDevice());
            if (!params)
                return null;
            let worldFromView = params.worldFromView;
            // Prefer the pose the head had when the video frame was actually
            // captured over the pose at detect() time — the passthrough video lags
            // tracking, so during head motion the two differ.
            if (captureTimeMs !== null && !deviceCamera.simulatorCamera) {
                const historical = this._poseRing.lookup(captureTimeMs);
                if (historical) {
                    worldFromView = historical.clone();
                    if (diag) {
                        diag.poseMatchErrorMs = this._poseRing.matchErrorMs(captureTimeMs);
                    }
                }
            }
            const off = this._opts.cameraRotationOffset;
            if (off.yaw !== 0 || off.pitch !== 0 || off.roll !== 0) {
                // Post-multiplying applies the correction in the camera's own view
                // space, on top of the SDK's estimated extrinsics.
                worldFromView = worldFromView
                    .clone()
                    .multiply(new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(off.pitch, off.yaw, off.roll, 'YXZ')));
            }
            return buildFrozenCamera({
                worldFromView,
                clipFromView: params.clipFromView,
                viewFromClip: params.viewFromClip,
                snapAspect,
            });
        }
        catch (_e) {
            return null;
        }
    }
    _targetDevice() {
        return core.world?.objects?.targetDevice ?? 'galaxyxr';
    }
    /**
     * Records how the depth system is configured on this device — whether the
     * platform reports a depth-camera pose rotated away from the render view,
     * and whether the view→depth-buffer UV remap is non-trivial. A large
     * rotation with `matchDepthView: false` means the depth mesh itself — the
     * surface every detection ray lands on — is the thing to scrutinise when
     * boxes come back coherently rotated.
     */
    _collectDepthDiagnostics(diag) {
        const depth = core.depth;
        if (!depth || core.deviceCamera?.simulatorCamera)
            return;
        try {
            const norm = depth.normDepthBufferFromNormViewMatrices?.[0];
            if (norm) {
                const identity = new THREE.Matrix4();
                diag.depthRemapIsIdentity = norm.elements.every((v, i) => Math.abs(v - identity.elements[i]) <= 1e-6);
            }
            const eye = core.renderer.xr.getCamera()?.cameras?.[0];
            const depthRotation = depth.depthCameraRotations?.[0];
            if (eye && depthRotation) {
                const eyeRotation = new THREE.Quaternion().setFromRotationMatrix(eye.matrixWorld);
                diag.depthVsEyeRotationDeg = THREE.MathUtils.radToDeg(eyeRotation.angleTo(depthRotation));
            }
        }
        catch (_e) {
            // Diagnostics only.
        }
    }
    /**
     * Legacy fallback: freeze a clone of the render camera. Only correct when
     * the snapshot was rendered from that camera (simulator / non-XR); kept as
     * a fallback for callers without device-camera parameters.
     */
    _buildRenderFrozenCamera(snapAspect) {
        const liveCam = core.camera;
        const frozenCam = liveCam.clone();
        frozenCam.matrixAutoUpdate = false;
        liveCam.updateMatrixWorld();
        frozenCam.matrix.copy(liveCam.matrix);
        frozenCam.matrixWorld.copy(liveCam.matrixWorld);
        frozenCam.matrixWorldInverse.copy(liveCam.matrixWorld).invert();
        frozenCam.projectionMatrix.copy(liveCam.projectionMatrix);
        frozenCam.projectionMatrixInverse.copy(liveCam.projectionMatrixInverse);
        frozenCam.position.copy(liveCam.position);
        frozenCam.quaternion.copy(liveCam.quaternion);
        frozenCam.userData = { ...frozenCam.userData, snapAspect };
        return frozenCam;
    }
    /** Clone the live depth mesh into a static snapshot. */
    _snapshotDepthMesh() {
        const depth = core.depth;
        const live = depth?.depthMesh;
        if (!live || !live.geometry)
            return null;
        // The full-resolution geometry is only rebuilt per-frame when
        // options.depth.depthMesh.updateFullResolutionGeometry is set (default
        // false), so force a rebuild from the cached CPU depth to avoid cloning
        // a stale mesh.
        depth.updateFullResolutionDepthMesh();
        const clonedGeom = live.geometry.clone();
        clonedGeom.computeBoundingSphere();
        clonedGeom.computeBoundingBox();
        const geomWithBvh = clonedGeom;
        geomWithBvh.computeBoundsTree?.();
        const snap = new THREE.Mesh(clonedGeom, new THREE.MeshBasicMaterial({ visible: false }));
        live.getWorldPosition(snap.position);
        live.getWorldQuaternion(snap.quaternion);
        live.getWorldScale(snap.scale);
        snap.updateMatrixWorld(true);
        return snap;
    }
    /** Estimate the floor Y from the live depth mesh (5th-percentile of vertex Y). */
    _estimateFloorY() {
        const mesh = core.depth?.depthMesh;
        if (!mesh?.geometry)
            return null;
        const pos = mesh.geometry.attributes['position'];
        if (!pos || !pos.count)
            return null;
        mesh.updateMatrixWorld();
        const ys = [];
        const p = new THREE.Vector3();
        const stride = Math.max(1, Math.floor(pos.count / 4000));
        for (let i = 0; i < pos.count; i += stride) {
            p.fromBufferAttribute(pos, i).applyMatrix4(mesh.matrixWorld);
            if (Number.isFinite(p.y))
                ys.push(p.y);
        }
        if (ys.length < 10)
            return null;
        ys.sort((a, b) => a - b);
        return ys[Math.floor(ys.length * 0.05)];
    }
}

export { Object3DDetector };
