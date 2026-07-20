import * as xb from 'xrblocks';
import { el } from './dom.js';
import { injectEditorStyles } from './styles.js';

const NAME_EXTENSION = /\.(glb|gltf)$/i;
/**
 * Basic outliner: one row per live scene instance, self-contained 2D HTML
 * overlay (builds and injects its own DOM/CSS).
 *
 * Row click selects (replacing the current selection); Shift+click reads
 * the DOM MouseEvent's own shiftKey directly to add/remove from the
 * selection -- unlike 3D-scene clicks (SelectionManager tracks shiftHeld
 * itself there, since SelectEvent carries no modifier info), a real
 * click event already has this for free.
 *
 * Each row also has a persisted visibility toggle, a session-only lock
 * toggle (SelectionManager excludes locked
 * instances from both 3D-click and hierarchy-row selection), and
 * double-click-to-edit the manifest's semantic label. Locks do not enter the
 * manifest or undo stack.
 *
 * Rows are only rebuilt when the instance set actually changes (id list
 * comparison) to avoid recreating DOM nodes every frame; per-row state
 * (selected class, visibility/lock button state, label text) is
 * refreshed every frame so the list stays in sync with 3D-click,
 * gizmo-driven selection, and direct instance mutation alike.
 */
class HierarchyPanel extends xb.Script {
    constructor(sceneManager, selectionManager, { parent = document.body } = {}) {
        super();
        this.rowsById = new Map();
        this.lastIdsKey = null;
        this.sceneManager = sceneManager;
        this.selectionManager = selectionManager;
        injectEditorStyles();
        this.listEl = el('div', { className: 'xrblocks-editor-hierarchy-list' });
        this.root = el('div', { id: 'xrblocks-editor-hierarchy', className: 'xr-panel' }, el('div', { className: 'title', textContent: 'Hierarchy' }), this.listEl);
        parent.appendChild(this.root);
    }
    update() {
        const list = this.sceneManager.list();
        const idsKey = list.map((instance) => instance.id).join(',');
        const countByFileName = this.computeFileNameCounts(list);
        if (idsKey !== this.lastIdsKey) {
            this.rebuildRows(list);
            this.lastIdsKey = idsKey;
        }
        this.syncRows(countByFileName);
    }
    computeFileNameCounts(list) {
        const counts = new Map();
        for (const instance of list) {
            counts.set(instance.fileName, (counts.get(instance.fileName) ?? 0) + 1);
        }
        return counts;
    }
    /** The manifest label wins, then the stable id, then the asset filename. */
    computeLabel(instance, countByFileName) {
        if (instance.definition.label)
            return instance.definition.label;
        if (instance.id)
            return instance.id;
        const baseName = instance.fileName.replace(NAME_EXTENSION, '');
        return (countByFileName.get(instance.fileName) ?? 0) > 1
            ? `${baseName} #${instance.id}`
            : baseName;
    }
    rebuildRows(list) {
        this.listEl.innerHTML = '';
        this.rowsById.clear();
        if (list.length === 0) {
            const empty = el('div', {
                className: 'xrblocks-editor-hierarchy-empty',
                textContent: '(no objects)',
            });
            this.listEl.appendChild(empty);
            return;
        }
        for (const instance of list) {
            const row = el('div', { className: 'xrblocks-editor-hierarchy-row' });
            row.addEventListener('click', (event) => {
                if (instance.locked)
                    return;
                this.selectionManager.select(instance, { additive: event.shiftKey });
            });
            const visBtn = el('button', {
                type: 'button',
                className: 'xrblocks-editor-icon-btn',
                textContent: 'V',
            });
            visBtn.addEventListener('click', (event) => {
                event.stopPropagation();
                void this.sceneManager.setVisible(instance, !instance.object.visible);
            });
            const lockBtn = el('button', {
                type: 'button',
                className: 'xrblocks-editor-icon-btn',
                textContent: 'L',
            });
            lockBtn.addEventListener('click', (event) => {
                event.stopPropagation();
                instance.locked = !instance.locked;
            });
            const labelEl = el('span', {
                className: 'xrblocks-editor-hierarchy-label',
            });
            labelEl.addEventListener('dblclick', (event) => {
                event.stopPropagation();
                this.beginRename(instance, labelEl);
            });
            row.append(visBtn, lockBtn, labelEl);
            this.listEl.appendChild(row);
            this.rowsById.set(instance.id, {
                row,
                instance,
                labelEl,
                visBtn,
                lockBtn,
                editing: false,
            });
        }
    }
    beginRename(instance, labelEl) {
        const entry = this.rowsById.get(instance.id);
        if (entry)
            entry.editing = true;
        const input = el('input', {
            type: 'text',
            className: 'xrblocks-editor-hierarchy-rename-input',
            value: instance.definition.label ?? '',
        });
        input.addEventListener('click', (event) => event.stopPropagation());
        const finish = () => {
            if (entry)
                entry.editing = false;
            // Detach listeners before removal -- replaceWith() triggers a blur
            // as a side effect of pulling focus away, which would otherwise
            // re-enter commit() a second time.
            input.removeEventListener('blur', commit);
            input.removeEventListener('keydown', onInputKeyDown);
            input.replaceWith(labelEl);
        };
        const commit = () => {
            const trimmed = input.value.trim();
            void this.sceneManager.setLabel(instance, trimmed.length > 0 ? trimmed : null);
            finish();
        };
        const onInputKeyDown = (event) => {
            if (event.key === 'Enter') {
                input.blur(); // triggers the blur listener -> commit()
            }
            else if (event.key === 'Escape') {
                finish();
            }
        };
        input.addEventListener('blur', commit);
        input.addEventListener('keydown', onInputKeyDown);
        labelEl.replaceWith(input);
        input.focus();
        input.select();
    }
    syncRows(countByFileName) {
        for (const entry of this.rowsById.values()) {
            const { row, instance, labelEl, visBtn, lockBtn } = entry;
            row.classList.toggle('selected', this.selectionManager.isSelected(instance));
            if (!entry.editing) {
                const label = this.computeLabel(instance, countByFileName);
                if (labelEl.textContent !== label) {
                    labelEl.textContent = label;
                    labelEl.title = label;
                }
            }
            visBtn.classList.toggle('active', instance.object.visible);
            visBtn.title = instance.object.visible ? 'Hide' : 'Show';
            lockBtn.classList.toggle('warn', instance.locked);
            lockBtn.title = instance.locked ? 'Unlock' : 'Lock';
        }
    }
}

export { HierarchyPanel };
