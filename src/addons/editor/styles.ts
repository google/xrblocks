const STYLE_ELEMENT_ID = 'xrblocks-editor-styles';

// Ported verbatim from the desktop/simulator-only 2D overlay UI originally
// developed in playground/spatial-agent/model-viewer/index.html. Plain HTML
// on top of the canvas rather than a 3D SpatialPanel -- gives real typed
// number inputs and sidesteps SpatialPanel's font-sizing quirks.
const CSS = `
.xr-panel {
  position: fixed;
  z-index: 10;
  display: flex;
  flex-direction: column;
  gap: 10px;
  background: rgba(17, 24, 39, 0.55);
  backdrop-filter: blur(4px);
  padding: 14px 18px;
  border-radius: 12px;
  font-family: system-ui, sans-serif;
  color: #eee;
}
#xrblocks-editor-left-column {
  position: fixed;
  z-index: 10;
  top: 20px;
  left: 20px;
  display: flex;
  flex-direction: column;
  gap: 16px;
}
/* Nested inside the left column's own fixed positioning, so these two
   panels flow normally underneath one another instead of each being
   independently pinned to a viewport edge -- that's what keeps the
   hierarchy panel docked directly under the picker regardless of the
   picker's actual (content-dependent) height. */
#xrblocks-editor-left-column .xr-panel {
  position: static;
}
#xrblocks-editor-model-picker {
  min-width: 220px;
}
#xrblocks-editor-inspector {
  top: 20px;
  right: 20px;
  min-width: 220px;
}
#xrblocks-editor-scene {
  bottom: 24px;
  right: 20px;
  min-width: 260px;
}
#xrblocks-editor-hierarchy {
  min-width: 220px;
  max-width: 260px;
}
.xrblocks-editor-hierarchy-list {
  display: flex;
  flex-direction: column;
  gap: 4px;
  /* Fixed height for ~10 rows (28px row + 4px gap each), scrolls beyond
     that instead of growing the panel unboundedly. */
  height: 320px;
  overflow-y: auto;
}
.xrblocks-editor-hierarchy-row {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 4px 8px;
  border-radius: 6px;
  background: #1f2937;
  cursor: pointer;
}
.xrblocks-editor-hierarchy-row:hover {
  background: #273449;
}
.xrblocks-editor-hierarchy-row.selected {
  background: #facc15;
}
.xrblocks-editor-hierarchy-row.selected .xrblocks-editor-hierarchy-label {
  color: #111827;
}
.xrblocks-editor-hierarchy-label {
  flex: 1;
  min-width: 0;
  color: #cbd5e1;
  font-size: 13px;
  text-align: left;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.xrblocks-editor-hierarchy-rename-input {
  flex: 1;
  min-width: 0;
  padding: 1px 4px;
  border-radius: 4px;
  border: 1px solid #3b82f6;
  background: #0b1220;
  color: white;
  font-size: 13px;
}
/* Scoped under .xr-panel (2 classes) rather than a bare single class so
   this reliably outweighs the shared ".xr-panel button" rule's
   padding/font-size in the cascade -- a bare single-class selector was
   silently losing that specificity fight, which is why the button
   content never actually centered. */
.xr-panel .xrblocks-editor-icon-btn {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 18px;
  height: 18px;
  padding: 0;
  border-radius: 4px;
  border: 1px solid #3a4757;
  background: #263041;
  color: #94a3b8;
  font-size: 9px;
  line-height: 1;
  cursor: pointer;
}
.xrblocks-editor-icon-btn.active {
  background: #0f766e;
  border-color: #0f766e;
  color: #eee;
}
.xrblocks-editor-icon-btn.warn {
  background: #b91c1c;
  border-color: #b91c1c;
  color: #fff;
}
.xrblocks-editor-hierarchy-empty {
  font-size: 12px;
  color: #64748b;
  text-align: center;
  padding: 6px 0;
}
.xr-panel .title {
  font-size: 16px;
  font-weight: 600;
  text-align: center;
}
.xr-panel .row {
  display: flex;
  gap: 8px;
  align-items: center;
  justify-content: center;
}
.xr-panel .row.fields {
  justify-content: space-between;
}
.xr-panel .field {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
}
.xr-panel label {
  font-size: 11px;
  color: #94a3b8;
}
.xr-panel button {
  padding: 5px 10px;
  border-radius: 7px;
  border: 1px solid #444;
  background: #2563eb;
  color: white;
  cursor: pointer;
  font-size: 12px;
}
.xr-panel button:hover {
  background: #3b82f6;
}
.xr-panel button.danger {
  background: #b91c1c;
}
.xr-panel button.danger:hover {
  background: #dc2626;
}
.xr-panel button.accent {
  background: #0f766e;
}
.xr-panel button.accent:hover {
  background: #0d9488;
}
.xr-panel input[type='number'] {
  width: 60px;
  padding: 6px;
  border-radius: 6px;
  border: 1px solid #444;
  background: #1f2937;
  color: white;
  font-size: 13px;
}
.xr-panel .xrblocks-editor-name {
  max-width: 200px;
  text-align: center;
  font-size: 13px;
  color: #cbd5e1;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.xr-panel .status {
  font-size: 12px;
  color: #94a3b8;
  text-align: center;
}
.xr-panel .sectionLabel {
  font-size: 11px;
  color: #94a3b8;
  text-align: center;
  margin-top: 4px;
}
.xrblocks-editor-preview-canvas {
  width: 110px;
  height: 110px;
  align-self: center;
  border-radius: 8px;
  background: #0b1220;
  border: 1px solid #334155;
}
`;

/** Injects the editor's shared stylesheet into the page exactly once,
 * regardless of how many editor panels/instances end up calling this --
 * safe to call from every panel's constructor. */
export function injectEditorStyles(): void {
  if (document.getElementById(STYLE_ELEMENT_ID)) return;
  const style = document.createElement('style');
  style.id = STYLE_ELEMENT_ID;
  style.textContent = CSS;
  document.head.appendChild(style);
}
