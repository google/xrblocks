# Virtual keyboard addon

The virtual keyboard addon provides an embeddable QWERTY `Keyboard` for the
built-in XR Blocks spatial UI. It supports Shift, Caps Lock, Backspace, Tab,
Space, Enter, and paired number-row symbols.

`Keyboard` is a `UIPanel`, not a world-space root. Add it below one `UICard` or
`UIOverlay`.

```js
import * as xb from 'xrblocks';
import {Keyboard} from 'xrblocks/addons/virtualkeyboard/Keyboard.js';

const draft = new xb.UIText({text: '', style: {fontSize: 22}});
const keyboard = new Keyboard({
  value: '',
  onValueChange: (value) => (draft.text = value),
  onSubmit: (value) => console.log('Submitted:', value),
});

const card = new xb.UICard({
  size: {width: 0.9, height: 0.5},
  style: {flexDirection: 'column', gap: 12, padding: 20},
  children: [draft, keyboard],
});
card.position.set(0, 1.2, -1);
xb.add(card);
```

## Interface

Bind the keyboard to a `UITextInput` when an application needs native caret, selection, and multiline editing:

```js
const field = new xb.UITextInput({
  ariaLabel: 'Message',
  multiline: true,
  style: {height: 120},
});
const keyboard = new Keyboard({input: field});
card.add(field, keyboard);
```

The field is the authoritative value in bound mode. Keys replace its current selection, Backspace deletes a complete grapheme, and Enter follows the field's single-line or multiline behavior. Keyboard interaction preserves field focus. Read `field.ready` before programmatic editing; `keyboard.pressKey()` returns false while the field is not ready or disabled.

Use `new Keyboard({input: field, open: false})` for an initially hidden panel, then set `keyboard.open = true` or `false` to show or hide it. A connected, visible keyboard requests suppression of the browser's software keyboard for its bound field. Closing, detaching, disposing, or rebinding the keyboard releases that request. Changes to inherited visibility and ancestor visibility are also reconciled on the normal script update.

Suppression uses `inputmode="none"`, the manual virtual-keyboard policy where supported, and `navigator.virtualKeyboard.hide()` when available. Native input/textarea editing is not made read-only. Browser support for software-keyboard hints varies; device testing is still required.

**Known Meta Quest limitation:** the system keyboard can still reopen or close as focus changes during use of the panel keyboard. Prefer the Quest system keyboard and keep the panel keyboard closed when they conflict. Suppression requests are not a guarantee of coexistence, and the addon does not automatically detect whether a platform keyboard is available.

Reassign `keyboard.input` from a field's `onFocus` callback to share one keyboard across fields. Set it to `undefined` to return to standalone mode. `keyboard.value` reads the bound field, and `setValue()` updates it without emitting a user-input callback. In bound mode, use the field's `onInput` and `onSubmit` callbacks instead of the keyboard's standalone callbacks.

Text fields load a private canvas-based presentation on demand and use system fonts. The standalone keyboard does not load it, and no additional dependency, font download, or worker is required. See the [spatial forms sample](../../../samples/spatial_forms/) for the complete import map and a two-field workflow.

- `value` returns the current text.
- `setValue(value)` updates the text without calling `onValueChange`.
- `pressKey(key)` applies a supported `KeyboardEvent.key` value and returns
  whether it was handled. This is useful for automation and tests.
- `onValueChange` runs once after a text mutation.
- `onSubmit` runs when Enter is pressed.

The parent `UICard` owns world placement, manipulation, and visibility. The
keyboard owns its layout and input state.

## Sample

Run `npm run build:sdk`, serve the repository, and open
`src/addons/virtualkeyboard/samples/`. The sample displays one movable card and
updates its text as you press the keyboard keys.
