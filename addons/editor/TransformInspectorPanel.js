import * as THREE from 'three';
import * as xb from 'xrblocks';
import { el } from './dom.js';
import { injectEditorStyles } from './styles.js';

const MIN_SCALE_COMPONENT = 0.02;
const POSITION_EPSILON = 1e-3;
const ROTATION_EPSILON_DEG = 0.05;
const SCALE_EPSILON = 1e-3;
const DUPLICATE_OFFSET = new THREE.Vector3(0.15, 0, 0.15);
const AXES = ['x', 'y', 'z'];
function buildField(idPrefix, label, step, min) {
    const input = el('input', { type: 'number', step, id: idPrefix });
    if (min !== undefined)
        input.min = min;
    const field = el('div', { className: 'field' }, el('label', { htmlFor: idPrefix, textContent: label }), input);
    return { input, field };
}
/**
 * Numeric position/rotation/scale readout+editor for the current
 * selection (single or multi). Desktop/simulator-only 2D HTML overlay
 * (self-contained: builds and injects its own DOM/CSS) rather than a 3D
 * SpatialPanel -- gives real typed number inputs instead of stepper
 * buttons. Still an xb.Script purely to get a free per-frame update()
 * tick; it has no 3D presence.
 *
 * With multiple objects selected, a field shows a value only if every
 * selected object agrees on it (within a small epsilon); otherwise it's
 * blanked with a "Mixed" placeholder, Blender/Unity-style. Committing a
 * value in any field applies it as an absolute value to every selected
 * object at once, as a single batched undo step.
 *
 * Rotation is displayed/edited via Euler degrees for readability, but the
 * gizmo itself (TransformGizmo) always drives objects via quaternions --
 * Euler here is just a convenience readout, and can show axis-coupling
 * artifacts if you mix field edits with gizmo drags on other axes.
 */
class TransformInspectorPanel extends xb.Script {
    constructor(selectionManager, sceneManager, commandHistory = null, { parent = document.body } = {}) {
        super();
        this.selectionManager = selectionManager;
        this.sceneManager = sceneManager;
        this.commandHistory = commandHistory;
        injectEditorStyles();
        this.nameLabel = el('div', {
            className: 'title',
            textContent: 'No selection',
        });
        this.spaceButton = el('button', { className: 'accent' });
        this.spaceButton.addEventListener('click', () => this.toggleSpace());
        const posX = buildField('posX', 'X', '0.01');
        const posY = buildField('posY', 'Y', '0.01');
        const posZ = buildField('posZ', 'Z', '0.01');
        const rotX = buildField('rotX', 'X', '1');
        const rotY = buildField('rotY', 'Y', '1');
        const rotZ = buildField('rotZ', 'Z', '1');
        const scaleX = buildField('scaleX', 'X', '0.05', '0.02');
        const scaleY = buildField('scaleY', 'Y', '0.05', '0.02');
        const scaleZ = buildField('scaleZ', 'Z', '0.05', '0.02');
        this.positionInputs = { x: posX.input, y: posY.input, z: posZ.input };
        this.rotationInputs = { x: rotX.input, y: rotY.input, z: rotZ.input };
        this.scaleInputs = { x: scaleX.input, y: scaleY.input, z: scaleZ.input };
        for (const axis of AXES) {
            this.wireInput(this.positionInputs[axis], () => this.applyPosition(axis));
            this.wireInput(this.rotationInputs[axis], () => this.applyRotation(axis));
            this.wireInput(this.scaleInputs[axis], () => this.applyScale(axis));
        }
        const duplicateBtn = el('button', {
            className: 'accent',
            textContent: 'Duplicate',
        });
        const deleteBtn = el('button', {
            className: 'danger',
            textContent: 'Delete',
        });
        duplicateBtn.addEventListener('click', () => this.duplicateSelected());
        deleteBtn.addEventListener('click', () => this.deleteSelected());
        this.root = el('div', { id: 'xrblocks-editor-inspector', className: 'xr-panel' }, this.nameLabel, el('div', { className: 'row' }, this.spaceButton), el('div', { className: 'sectionLabel', textContent: 'Position (m)' }), el('div', { className: 'row fields' }, posX.field, posY.field, posZ.field), el('div', { className: 'sectionLabel', textContent: 'Rotation (deg)' }), el('div', { className: 'row fields' }, rotX.field, rotY.field, rotZ.field), el('div', {
            className: 'sectionLabel',
            textContent: 'Scale (× as-spawned)',
        }), el('div', { className: 'row fields' }, scaleX.field, scaleY.field, scaleZ.field), el('div', { className: 'row' }, duplicateBtn, deleteBtn));
        this.root.style.display = 'none';
        parent.appendChild(this.root);
        this.updateSpaceButton();
    }
    toggleSpace() {
        this.selectionManager.space =
            this.selectionManager.space === 'world' ? 'local' : 'world';
        this.updateSpaceButton();
    }
    updateSpaceButton() {
        const space = this.selectionManager.space;
        this.spaceButton.textContent = `Space: ${space === 'local' ? 'Local' : 'World'}`;
    }
    wireInput(input, apply) {
        input.addEventListener('change', apply);
        input.addEventListener('keydown', (event) => {
            if (event.key === 'Enter')
                input.blur();
        });
    }
    update() {
        this.refresh();
    }
    // Delete/Backspace aren't in xb.Keycodes, so these use the raw
    // event.code values directly.
    onKeyDown(event) {
        if (!this.selectionManager.editorActive)
            return;
        const targetTag = event.target?.tagName;
        if (targetTag === 'INPUT' || targetTag === 'TEXTAREA')
            return;
        if (event.code === 'Delete' || event.code === 'Backspace') {
            this.deleteSelected();
        }
    }
    applyPosition(axis) {
        const list = this.selectionManager.selectedList();
        if (list.length === 0)
            return;
        const value = parseFloat(this.positionInputs[axis].value);
        if (!Number.isFinite(value))
            return;
        const commands = [];
        for (const instance of list) {
            const viewer = instance.viewer;
            const before = viewer.position.clone();
            viewer.position[axis] = value;
            const after = viewer.position.clone();
            if (!before.equals(after)) {
                commands.push({
                    undo: () => void viewer.position.copy(before),
                    redo: () => void viewer.position.copy(after),
                });
            }
        }
        this.commandHistory?.pushBatch(commands);
    }
    applyRotation(axis) {
        const list = this.selectionManager.selectedList();
        if (list.length === 0)
            return;
        const value = parseFloat(this.rotationInputs[axis].value);
        if (!Number.isFinite(value))
            return;
        const commands = [];
        for (const instance of list) {
            const content = instance.viewer.modelScene;
            if (!content)
                continue;
            const before = content.quaternion.clone();
            const euler = new THREE.Euler().setFromQuaternion(content.quaternion, 'XYZ');
            euler[axis] = THREE.MathUtils.degToRad(value);
            content.quaternion.setFromEuler(euler);
            const after = content.quaternion.clone();
            if (!before.equals(after)) {
                commands.push({
                    undo: () => void content.quaternion.copy(before),
                    redo: () => void content.quaternion.copy(after),
                });
            }
        }
        this.commandHistory?.pushBatch(commands);
    }
    applyScale(axis) {
        const list = this.selectionManager.selectedList();
        if (list.length === 0)
            return;
        const value = parseFloat(this.scaleInputs[axis].value);
        if (!Number.isFinite(value))
            return;
        // The field shows a multiplier relative to each instance's own
        // auto-fit baseline (1.0 == as-spawned), not the raw viewer.scale --
        // see baseScale in SceneManager.spawn().
        const multiplier = Math.max(MIN_SCALE_COMPONENT, value);
        const commands = [];
        for (const instance of list) {
            const viewer = instance.viewer;
            const before = viewer.scale.clone();
            viewer.scale[axis] = multiplier * instance.baseScale[axis];
            const after = viewer.scale.clone();
            if (!before.equals(after)) {
                commands.push({
                    undo: () => void viewer.scale.copy(before),
                    redo: () => void viewer.scale.copy(after),
                });
            }
        }
        this.commandHistory?.pushBatch(commands);
    }
    async duplicateSelected() {
        const list = this.selectionManager.selectedList();
        if (list.length === 0)
            return;
        const commands = [];
        const duplicates = [];
        for (const instance of list) {
            const viewer = instance.viewer;
            const content = viewer.modelScene;
            const fileName = instance.fileName;
            // Small offset so each copy isn't sitting exactly inside its
            // original.
            const snapshotTransform = {
                position: viewer.position.clone().add(DUPLICATE_OFFSET),
                scale: viewer.scale.clone(),
                quaternion: content?.quaternion.clone(),
            };
            // instance.locked is always false here -- locked instances can
            // never be selected in the first place (see SelectionManager) -- but
            // included for consistency with visible/customName.
            const snapshotState = {
                customName: instance.customName,
                locked: instance.locked,
                visible: viewer.visible,
            };
            // skipHistory + a manually-built command here (rather than relying
            // on SceneManager.spawn()'s own auto-pushed command) so N duplicates
            // combine into a single undo step via pushBatch instead of N
            // separate ones.
            const duplicate = await this.sceneManager.spawn(fileName, {
                transform: snapshotTransform,
                state: snapshotState,
                skipHistory: true,
            });
            if (!duplicate)
                continue;
            duplicates.push(duplicate);
            // redo re-spawns from scratch and gets a new id each time, so undo
            // and redo close over a mutable holder rather than the id directly
            // -- same pattern as SceneManager.spawn()'s own undo/redo.
            const ref = { instanceId: duplicate.id };
            commands.push({
                undo: () => this.sceneManager.removeInstance(ref.instanceId, { skipHistory: true }),
                redo: async () => {
                    const respawned = await this.sceneManager.spawn(fileName, {
                        transform: snapshotTransform,
                        state: snapshotState,
                        skipHistory: true,
                    });
                    ref.instanceId = respawned?.id ?? ref.instanceId;
                },
            });
        }
        this.commandHistory?.pushBatch(commands);
        if (duplicates.length > 0) {
            this.selectionManager.select(duplicates[0]);
            for (let i = 1; i < duplicates.length; i++) {
                this.selectionManager.select(duplicates[i], { additive: true });
            }
        }
    }
    deleteSelected() {
        const list = this.selectionManager.selectedList();
        if (list.length === 0)
            return;
        const commands = [];
        for (const instance of list) {
            const viewer = instance.viewer;
            const content = viewer.modelScene;
            const fileName = instance.fileName;
            const snapshotTransform = {
                position: viewer.position.clone(),
                scale: viewer.scale.clone(),
                quaternion: content?.quaternion.clone(),
            };
            const snapshotState = {
                customName: instance.customName,
                locked: instance.locked,
                visible: viewer.visible,
            };
            const ref = { instanceId: null };
            commands.push({
                undo: async () => {
                    const respawned = await this.sceneManager.spawn(fileName, {
                        transform: snapshotTransform,
                        state: snapshotState,
                        skipHistory: true,
                    });
                    ref.instanceId = respawned?.id ?? null;
                },
                redo: () => {
                    if (ref.instanceId != null) {
                        this.sceneManager.removeInstance(ref.instanceId, {
                            skipHistory: true,
                        });
                    }
                },
            });
            this.sceneManager.removeInstance(instance.id, { skipHistory: true });
        }
        this.commandHistory?.pushBatch(commands);
        this.selectionManager.clearSelection();
    }
    /** Writes one axis-triple of values into `inputs`, blanking any field
     * the selection doesn't agree on (within `epsilon`) with a "Mixed"
     * placeholder instead. Skips a field the user is actively typing into,
     * or the live per-frame refresh would overwrite keystrokes mid-edit. */
    setFieldValues(inputs, valuesByAxis, decimals, epsilon) {
        for (const axis of AXES) {
            const input = inputs[axis];
            if (document.activeElement === input)
                continue;
            const values = valuesByAxis[axis];
            if (values.length === 0)
                continue;
            const first = values[0];
            const mixed = values.some((value) => Math.abs(value - first) > epsilon);
            if (mixed) {
                input.value = '';
                input.placeholder = 'Mixed';
            }
            else {
                input.placeholder = '';
                input.value = first.toFixed(decimals);
            }
        }
    }
    refresh() {
        const list = this.selectionManager.selectedList();
        this.root.style.display = list.length > 0 ? 'flex' : 'none';
        if (list.length === 0)
            return;
        this.nameLabel.textContent =
            list.length === 1
                ? (list[0].customName ?? list[0].fileName)
                : `${list.length} objects selected`;
        const positionByAxis = { x: [], y: [], z: [] };
        const rotationByAxis = { x: [], y: [], z: [] };
        const scaleByAxis = { x: [], y: [], z: [] };
        for (const instance of list) {
            const position = instance.viewer.position;
            positionByAxis.x.push(position.x);
            positionByAxis.y.push(position.y);
            positionByAxis.z.push(position.z);
            const content = instance.viewer.modelScene;
            if (content) {
                const euler = new THREE.Euler().setFromQuaternion(content.quaternion, 'XYZ');
                rotationByAxis.x.push(THREE.MathUtils.radToDeg(euler.x));
                rotationByAxis.y.push(THREE.MathUtils.radToDeg(euler.y));
                rotationByAxis.z.push(THREE.MathUtils.radToDeg(euler.z));
            }
            const scale = instance.viewer.scale;
            const baseScale = instance.baseScale;
            scaleByAxis.x.push(scale.x / baseScale.x);
            scaleByAxis.y.push(scale.y / baseScale.y);
            scaleByAxis.z.push(scale.z / baseScale.z);
        }
        this.setFieldValues(this.positionInputs, positionByAxis, 2, POSITION_EPSILON);
        this.setFieldValues(this.rotationInputs, rotationByAxis, 0, ROTATION_EPSILON_DEG);
        this.setFieldValues(this.scaleInputs, scaleByAxis, 2, SCALE_EPSILON);
    }
}

export { TransformInspectorPanel };
