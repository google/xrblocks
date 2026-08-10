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
