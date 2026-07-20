import * as THREE from 'three';
import * as xb from 'xrblocks';

const MODEL_TARGET_SIZE = 0.75;
const SPAWN_DISTANCE = 1.3;
const SPAWN_HEIGHT = 0.45;
/**
 * Thin editor adapter over the active simulator environment. The simulator
 * owns loading, disposal, physics, sensing, and object identity; this class
 * only adds editor state and undoable authoring operations.
 */
class SceneManager extends xb.Script {
    constructor({ modelsDir = './Models/', commandHistory = null, } = {}) {
        super();
        this.instances = new Map();
        this.onEnvironmentChange = null;
        this.modelsDir = modelsDir;
        this.commandHistory = commandHistory;
    }
    init() {
        this.simulatorObjects = xb.core.simulator.objects;
        this.syncEnvironment(true);
    }
    update() {
        this.syncEnvironment();
    }
    syncEnvironment(initial = false) {
        if (!this.simulatorObjects)
            return;
        const nextManifest = xb.core.simulator.activeEnvironmentManifest;
        const environmentChanged = nextManifest !== this.manifest;
        if (environmentChanged) {
            this.manifest = nextManifest;
            this.instances.clear();
        }
        const records = this.simulatorObjects
            .get()
            .filter((record) => !!record.definition.assetPath);
        const liveIds = new Set(records.map((record) => record.id));
        for (const id of this.instances.keys()) {
            if (!liveIds.has(id))
                this.instances.delete(id);
        }
        for (const record of records) {
            const existing = this.instances.get(record.id);
            if (existing?.object === record.object) {
                existing.definition = record.definition;
                existing.assetPath = record.definition.assetPath;
                existing.fileName = this.fileNameFor(record.definition.assetPath);
                continue;
            }
            this.instances.set(record.id, {
                id: record.id,
                fileName: this.fileNameFor(record.definition.assetPath),
                assetPath: record.definition.assetPath,
                object: record.object,
                definition: record.definition,
                locked: false,
            });
        }
        if (environmentChanged && !initial)
            this.onEnvironmentChange?.();
    }
    async spawn(fileName, { transform = null, state = null, id, skipHistory = false } = {}) {
        if (!this.simulatorObjects)
            return null;
        const assetPath = new URL(fileName, new URL(this.modelsDir, document.baseURI)).href;
        let createdId;
        try {
            const [record] = await this.simulatorObjects.addObjects([
                {
                    id,
                    assetPath,
                    visible: state?.visible,
                    detectObject: state?.detectObject,
                    label: state?.label ?? undefined,
                    data: state?.data,
                    physics: state?.physics,
                },
            ]);
            createdId = record.id;
            const instance = {
                id: record.id,
                fileName: this.fileNameFor(assetPath),
                assetPath,
                object: record.object,
                definition: record.definition,
                locked: state?.locked ?? false,
            };
            this.instances.set(instance.id, instance);
            if (transform) {
                if (transform.position)
                    instance.object.position.copy(transform.position);
                if (transform.quaternion)
                    instance.object.quaternion.copy(transform.quaternion);
                if (transform.scale)
                    instance.object.scale.copy(transform.scale);
            }
            else {
                this.placeInFrontOfCamera(instance.object);
                this.fitObject(instance.object);
            }
            await this.commitInstances([instance]);
            if (!skipHistory && this.commandHistory) {
                const snapshot = this.snapshot(instance);
                const ref = { id: instance.id };
                this.commandHistory.push({
                    undo: () => this.removeInstance(ref.id, { skipHistory: true }),
                    redo: async () => {
                        const restored = await this.restore(snapshot);
                        ref.id = restored?.id ?? ref.id;
                    },
                });
            }
            return instance;
        }
        catch (error) {
            if (createdId) {
                this.simulatorObjects.removeObjects([createdId]);
                this.instances.delete(createdId);
            }
            console.error(`[SceneManager] Failed to spawn ${fileName}:`, error);
            return null;
        }
    }
    async commitInstances(instances) {
        if (!this.simulatorObjects || instances.length === 0)
            return;
        await this.simulatorObjects.updateObjects(instances.map((instance) => ({
            id: instance.id,
            position: instance.object.position.toArray(),
            quaternion: instance.object.quaternion.toArray(),
            scale: instance.object.scale.toArray(),
            visible: instance.object.visible,
            label: instance.definition.label ?? null,
        })));
    }
    async setLabel(instance, label) {
        if (!this.simulatorObjects)
            return;
        const [record] = await this.simulatorObjects.updateObjects([
            { id: instance.id, label },
        ]);
        instance.definition = record.definition;
    }
    async setVisible(instance, visible) {
        if (!this.simulatorObjects)
            return;
        const [record] = await this.simulatorObjects.updateObjects([
            { id: instance.id, visible },
        ]);
        instance.definition = record.definition;
    }
    removeInstance(id, { skipHistory = false } = {}) {
        const instance = this.instances.get(id);
        if (!instance || !this.simulatorObjects)
            return;
        const snapshot = this.snapshot(instance);
        if (!skipHistory && this.commandHistory) {
            const ref = { id: null };
            this.commandHistory.push({
                undo: async () => {
                    const restored = await this.restore(snapshot);
                    ref.id = restored?.id ?? null;
                },
                redo: () => {
                    if (ref.id)
                        this.removeInstance(ref.id, { skipHistory: true });
                },
            });
        }
        this.simulatorObjects.removeObjects([id]);
        this.instances.delete(id);
    }
    has(id) {
        return this.instances.has(id);
    }
    list() {
        return [...this.instances.values()];
    }
    getInstanceForObject(object) {
        for (let current = object; current; current = current.parent) {
            for (const instance of this.instances.values()) {
                if (instance.object === current)
                    return instance;
            }
        }
        return undefined;
    }
    getSpawnWorldPosition() {
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
    placeInFrontOfCamera(object) {
        const position = this.getSpawnWorldPosition();
        object.parent?.worldToLocal(position);
        object.position.copy(position);
    }
    fitObject(object) {
        object.updateWorldMatrix(true, true);
        const size = new THREE.Box3()
            .setFromObject(object)
            .getSize(new THREE.Vector3());
        const maxDim = Math.max(size.x, size.y, size.z);
        if (maxDim > 0)
            object.scale.multiplyScalar(MODEL_TARGET_SIZE / maxDim);
    }
    snapshot(instance) {
        return {
            id: instance.id,
            fileName: instance.assetPath,
            transform: {
                position: instance.object.position.clone(),
                quaternion: instance.object.quaternion.clone(),
                scale: instance.object.scale.clone(),
            },
            state: {
                label: instance.definition.label ?? null,
                locked: instance.locked,
                visible: instance.object.visible,
                detectObject: instance.definition.detectObject,
                data: instance.definition.data,
                physics: instance.definition.physics,
            },
        };
    }
    restore(snapshot) {
        return this.spawn(snapshot.fileName, {
            id: snapshot.id,
            transform: snapshot.transform,
            state: snapshot.state,
            skipHistory: true,
        });
    }
    fileNameFor(assetPath) {
        try {
            return decodeURIComponent(new URL(assetPath, document.baseURI).pathname.split('/').pop() ??
                assetPath);
        }
        catch {
            return assetPath;
        }
    }
}

export { SceneManager };
