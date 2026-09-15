# Spatial UI lab

A gallery of four application compositions built from the current XR Blocks UI primitives. It demonstrates scrolling and plain-text editing without introducing dropdowns, toggles, a second UI renderer, or an AI backend.

## Run

Run `npm run build:sdk`, then `npm run serve`. Open `http://127.0.0.1:8080/demos/spatial_ui_lab/?formFactor=desktop` for the desktop simulator. On an XR device, open the demo without forcing desktop mode. Add `&overlay=1` for the view-space variant.

The world-space card is placed once in front of the viewer after the simulator starts or the first valid XR pose arrives. It then stays fixed in the scene instead of following head movement; its edge still supports normal manipulation. Placement is session-local, not a persistent WebXR anchor saved across reloads. Entering a new XR session places the card in front of the viewer again. The explicit `overlay=1` variant remains view-space UI.

The desktop example narrows the simulator camera's field of view so the text is readable on an ordinary monitor, and widens it while the keyboard is open; it does not change the headset's projection.

## Examples

| Example      | What to try                                                                                                                                       |
| ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| Conversation | Scroll the message history, choose a starting point, enter multiple lines, and send a message locally.                                            |
| Library      | Filter twelve UI patterns while preserving search focus, inspect a result, and select/copy its read-only description.                             |
| Notes        | Switch between meeting notes, a checklist, and a multilingual preset. Select across wrapped lines and compare editable versus read-only behavior. |
| Inputs       | Compare editable, length-limited, read-only, and disabled fields. Tab to a multiline field inside a scrollable form and review the draft locally. |

Use `?example=library`, `?example=notes`, or `?example=inputs` to open a particular composition directly. Combine this with `formFactor=desktop` and `debug=1` when inspecting the demo in a browser.

Add `capture=1` to omit the reticle from screenshots. The normal interactive view retains its targeting feedback.

The shared spatial keyboard follows the focused field. Enter inserts a newline in multiline fields; Ctrl/Command+Enter submits the local conversation. Submission does not call an AI provider. The note and form actions keep data only in this page; reloading starts over.

The Library is deliberately a finite retained list, not a virtualization implementation. Its search field remains mounted while result rows change. Navigation between examples retains the public UI objects and their values, while hidden fields release focus.

## Runtime limits

Editable text loads a private canvas-based presentation and uses system fonts, without additional dependencies, font downloads, or workers. Glyph availability and appearance depend on the device. Native keyboard invocation, clipboard access, and IME behavior depend on the browser and XR runtime.

### Meta Quest keyboard limitation

Quest Browser may repeatedly open or close its system keyboard while the in-panel spatial keyboard is being used. Native-keyboard suppression is best-effort, not a guarantee of reliable coexistence. Prefer the Quest system keyboard and leave the panel keyboard closed when the two conflict.

The controls remain available for explicit testing; the demo does not automatically detect or disable a headset's keyboard. The panel keyboard can still be used in the desktop simulator and in environments without a competing system keyboard.

For a shorter, single-purpose starting point, see [`samples/spatial_forms/`](../../samples/spatial_forms/). The canonical component contracts are in [Spatial UI](../../docs/docs/manual/UI.mdx).
