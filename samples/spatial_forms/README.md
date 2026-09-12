# Spatial forms

A local conversation/notes panel that combines `UIScrollView`, single-line and multiline `UITextInput`, existing buttons, and the optional virtual keyboard. It does not contact an AI provider or request microphone access.

For a larger gallery with conversation, library search, notes, and field-state examples, see [`demos/spatial_ui_lab/`](../../demos/spatial_ui_lab/).

Run `npm run build:sdk`, then `npm run serve`. Open `http://127.0.0.1:8080/samples/spatial_forms/?formFactor=desktop` for the simulator, or open the sample on the intended XR device. Add `&overlay=1` on desktop to use a view-space overlay instead of the movable card.

The world-space variant uses the existing `FollowHead` and `FaceCamera` scripts to keep the card readable near the viewer. Normal manipulation suspends and rebases those scripts, so moving the card does not fight its placement behavior.

Scroll with the mouse wheel, drag ordinary history content, or use its scrollbar. A short press/release still activates a history button. A drag must not also activate it. Wheel input at a scroll boundary must not resize the surrounding card.

Select either field to edit it. The optional keyboard follows the field that received focus. Enter inserts a newline in the multiline composer; Ctrl/Command+Enter or Send appends the note to the local history. Native clipboard and IME behavior depend on the browser. An operating-system keyboard is not guaranteed to open in immersive WebXR.

Editable text loads a private canvas-based presentation and uses system fonts, like the existing Unicode UI fallback. No additional dependency, font download, worker, or import-map entry is required. The renderer uses the same Three.js instance as XR Blocks. Unicode glyph availability and appearance depend on the device's fonts.

Try resizing the card, switching focus between the fields, scrolling while the composer is focused, entering multiple wrapped lines, and reopening the virtual keyboard. The ordinary history remains a finite retained UI tree; this sample is not a virtualized list implementation.
