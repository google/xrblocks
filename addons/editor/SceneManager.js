import * as THREE from 'three';
import * as xb from 'xrblocks';

const MODEL_TARGET_SIZE = 0.75;
// Every fresh spawn (no explicit transform override) lands this far in
// front of wherever the camera currently is, at a fixed height -- always
// visible to the user regardless of where they've walked to. Duplicates
// from the picker will overlap, which is an accepted trade-off for not
// crowding the scene with an auto-cascading layout.
const SPAWN_DISTANCE = 1.3;
const SPAWN_HEIGHT = 0.45;
/**
 * Owns every spawned model instance in the scene: loading, placement,
 * lookup, and disposal. Each spawn is an independent xb.ModelViewer with
 * its own transform, so the same source file can be loaded multiple times.
 */
class SceneManager extends xb.Script {
    constructor({ modelsDir = './Models/', commandHistory = null, } = {}) {
        super();
        this.instances = new Map();
        this.nextId = 1;
        // Runtime on/off for the simulator-room occlusion shader (see
        // addOcclusionToShader below and options.depth.* in main.js). Every
        // loaded model gets the shader patched in regardless, so this just
        // flips ModelViewer's occlusionEnabled uniform -- cheap to toggle
        // live, unlike the shader patching itself. Off by default.
        this.occlusionEnabled = false;
        this.modelsDir = modelsDir;
        this.commandHistory = commandHistory;
    }
    async spawn(fileName, { transform = null, state = null, skipHistory = false } = {}) {
        const id = this.nextId++;
        const viewer = new xb.ModelViewer({
            castShadow: false,
            receiveShadow: false,
        });
        // ModelViewer marks itself draggable by default; disable it so
        // DragManager never intercepts clicks meant for the transform gizmo.
        viewer.draggable = false;
        viewer.position.copy(this.getSpawnPosition());
        viewer.userData.instanceId = id;
        viewer.userData.sourceFile = fileName;
        this.add(viewer);
        try {
            await viewer.loadGLTFModel({
                data: { path: this.modelsDir, model: fileName },
                renderer: xb.core.renderer,
                // ModelViewer's own raycast() override only tests specific special
                // children (rotationRaycastMesh/platform/controlBar), not the
                // loaded mesh directly -- setupRaycastBox gives it a single cheap
                // invisible AABB proxy (sized to viewer.bbox, the same box the
                // selection highlight and gizmo pivot already use) as that raycast
                // target, instead of either the redundant hover-fade platform or
                // raycastToChildren's much more expensive per-triangle mesh test.
                setupPlatform: false,
                setupRaycastCylinder: false,
                setupRaycastBox: true,
                // Patches the loaded materials' shaders to sample the simulator's
                // synthetic room-depth texture (see options.depth.* in main.js),
                // so objects are actually hidden behind walls/furniture instead
                // of drawing through them. Forces material.transparent = true as
                // a side effect (ModelViewer's own behavior, not ours).
                addOcclusionToShader: true,
            });
        }
        catch (error) {
            console.error(`[SceneManager] Failed to load ${fileName}:`, error);
            this.remove(viewer);
            xb.uninitScript(viewer);
            return null;
        }
        // loadGLTFModel unconditionally marks the loaded content ROTATING for
        // ModelViewer's own drag affordance; override it so it never fights the
        // custom transform gizmo built on top of this registry.
        if (viewer.modelScene) {
            viewer.modelScene.draggingMode =
                xb.DragMode.DO_NOT_DRAG;
        }
        viewer.setOcclusionEnabled(this.occlusionEnabled);
        this.fitViewer(viewer);
        // The auto-fit scale above normalizes wildly different raw model sizes
        // to a consistent on-screen footprint, but it makes viewer.scale itself
        // a non-intuitive "1.0" for the user (e.g. 0.75 for a model that's
        // already about the target size). baseScale is that normalization
        // factor, captured once at spawn; the gizmo/inspector treat it as the
        // user-facing scale's baseline ("1.0" == as-spawned), not the absolute
        // viewer.scale.
        const instance = {
            id,
            fileName,
            viewer,
            baseScale: viewer.scale.clone(),
            customName: state?.customName ?? null,
            locked: state?.locked ?? false,
        };
        if (transform) {
            if (transform.position)
                viewer.position.copy(transform.position);
            if (transform.scale)
                viewer.scale.copy(transform.scale);
            if (transform.quaternion && viewer.modelScene) {
                viewer.modelScene.quaternion.copy(transform.quaternion);
            }
        }
        if (state?.visible === false) {
            viewer.visible = false;
        }
        this.instances.set(id, instance);
        if (!skipHistory && this.commandHistory) {
            // The id changes across redo (each redo re-spawns from scratch), so
            // undo/redo close over a mutable holder rather than the original id
            // directly -- otherwise a redo-then-undo would try to remove an id
            // that's already gone.
            const ref = { instanceId: id };
            const snapshotTransform = {
                position: instance.viewer.position.clone(),
                scale: instance.viewer.scale.clone(),
                quaternion: instance.viewer.modelScene?.quaternion.clone(),
            };
            const snapshotState = {
                customName: instance.customName,
                locked: instance.locked,
                visible: instance.viewer.visible,
            };
            this.commandHistory.push({
                undo: () => this.removeInstance(ref.instanceId, { skipHistory: true }),
                redo: async () => {
                    const respawned = await this.spawn(fileName, {
                        transform: snapshotTransform,
                        state: snapshotState,
                        skipHistory: true,
                    });
                    ref.instanceId = respawned?.id ?? ref.instanceId;
                },
            });
        }
        return instance;
    }
    removeInstance(id, { skipHistory = false } = {}) {
        const instance = this.instances.get(id);
        if (!instance)
            return;
        if (!skipHistory && this.commandHistory) {
            const snapshotTransform = {
                position: instance.viewer.position.clone(),
                scale: instance.viewer.scale.clone(),
                quaternion: instance.viewer.modelScene?.quaternion.clone(),
            };
            const snapshotState = {
                customName: instance.customName,
                locked: instance.locked,
                visible: instance.viewer.visible,
            };
            const fileName = instance.fileName;
            const ref = { instanceId: null };
            this.commandHistory.push({
                undo: async () => {
                    const respawned = await this.spawn(fileName, {
                        transform: snapshotTransform,
                        state: snapshotState,
                        skipHistory: true,
                    });
                    ref.instanceId = respawned?.id ?? null;
                },
                redo: () => {
                    if (ref.instanceId != null)
                        this.removeInstance(ref.instanceId, { skipHistory: true });
                },
            });
        }
        xb.uninitScript(instance.viewer);
        this.remove(instance.viewer);
        this.disposeObject(instance.viewer);
        this.instances.delete(id);
    }
    removeAllInstances() {
        for (const id of [...this.instances.keys()]) {
            // Clear All is not itself undoable -- avoids flooding the undo
            // stack with one entry per cleared object.
            this.removeInstance(id, { skipHistory: true });
        }
    }
    has(id) {
        return this.instances.has(id);
    }
    // ModelViewer patches each material's occlusion uniform lazily, via
    // onBeforeCompile -- which only fires on that material's first actual
    // shader compile (first render), not synchronously during
    // loadGLTFModel(). That callback also hardcodes the uniform to `true`
    // regardless of what we'd asked for, so a single setOcclusionEnabled()
    // call right after spawn (before anything has rendered) is a silent
    // no-op, and the object then always renders with occlusion on
    // regardless of the panel toggle. Re-asserting every frame is cheap
    // (idempotent uniform writes) and guarantees our setting wins once the
    // shader actually exists, regardless of when that compile happens.
    update() {
        for (const instance of this.instances.values()) {
            instance.viewer.setOcclusionEnabled(this.occlusionEnabled);
        }
    }
    /** Toggles simulator-room occlusion for every current instance, and for
     * every future spawn until toggled again. */
    setOcclusionEnabled(enabled) {
        this.occlusionEnabled = enabled;
        for (const instance of this.instances.values()) {
            instance.viewer.setOcclusionEnabled(enabled);
        }
    }
    list() {
        return [...this.instances.values()];
    }
    /** Walks up from a raycast hit to find which spawned instance owns it. */
    getInstanceForObject(object) {
        let current = object;
        while (current) {
            if (current.userData?.instanceId != null) {
                return this.instances.get(current.userData.instanceId);
            }
            current = current.parent;
        }
        return undefined;
    }
    /** In front of the camera's current position and horizontal facing
     * direction, at a fixed height. Pitch (looking up/down) is ignored so
     * spawning while looking at the floor/ceiling doesn't place the object
     * far below/above the user. */
    getSpawnPosition() {
        const cameraPosition = new THREE.Vector3();
        xb.core.camera.getWorldPosition(cameraPosition);
        const forward = new THREE.Vector3();
        xb.core.camera.getWorldDirection(forward);
        forward.y = 0;
        if (forward.lengthSq() < 1e-6)
            forward.set(0, 0, -1);
        forward.normalize();
        return new THREE.Vector3(cameraPosition.x + forward.x * SPAWN_DISTANCE, SPAWN_HEIGHT, cameraPosition.z + forward.z * SPAWN_DISTANCE);
    }
    fitViewer(viewer) {
        const size = new THREE.Vector3();
        viewer.bbox.getSize(size);
        const maxDim = Math.max(size.x, size.y, size.z);
        if (maxDim > 0) {
            viewer.scale.setScalar(MODEL_TARGET_SIZE / maxDim);
        }
    }
    disposeObject(object) {
        object.traverse((child) => {
            const mesh = child;
            if (mesh.geometry)
                mesh.geometry.dispose?.();
            const materials = Array.isArray(mesh.material)
                ? mesh.material
                : mesh.material
                    ? [mesh.material]
                    : [];
            for (const material of materials) {
                for (const value of Object.values(material)) {
                    if (value?.isTexture)
                        value.dispose();
                }
                material.dispose?.();
            }
        });
    }
}

export { SceneManager };
