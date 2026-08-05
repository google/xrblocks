---
name: xb-ui
description: >-
  Build spatial UI in an XR Blocks app with the core `xb.SpatialPanel` system — a
  grid of rows and columns holding text, text buttons, icon buttons, and images,
  with a unified `onTriggered` select handler. Use for HUDs, menus, dialogs, and
  control panels when you want a lightweight, no-extra-dependency UI. For rich
  flexbox layouts with gradients, strokes, and shadows, use xb-uiblocks instead.
  Covers `addGrid`/`addRow`/`addCol`/`addText`/`addTextButton`/`addIconButton`,
  panel positioning, and the `enableUI()` setup.
---

# xb-ui: core spatial UI (`SpatialPanel`)

A `SpatialPanel` hosts a grid; rows and columns nest to lay out views. Lightweight and
dependency-free. (For gradients/shadows/flexbox fidelity, use [`xb-uiblocks`](../xb-uiblocks/SKILL.md).)
This is for rapid prototyping, if authoring advanced spatial UI, use `xb-uiblocks` skill.

## Setup

```js
const options = new xb.Options();
options.enableUI(); // spatial UI + reticles
xb.init(options);
```

## Build a panel

```js
class Menu extends xb.Script {
  init() {
    const panel = new xb.SpatialPanel({
      backgroundColor: '#1a1a1abb',
      width: 2.5,
      height: 1.5,
    });
    panel.position.set(0, xb.user.height, -xb.user.panelDistance);
    this.add(panel);

    const grid = panel.addGrid();

    // Rows take a `weight` = fraction of the parent's height.
    grid.addRow({weight: 0.6}).addText({
      text: 'Welcome to XR',
      fontColor: '#ffffff',
      fontSize: 0.08,
    });

    const controls = grid.addRow({weight: 0.4});

    // Columns take a `weight` = fraction of the row's width.
    const yes = controls.addCol({weight: 0.5}).addIconButton({
      text: 'check_circle', // Material icon name (fonts.google.com/icons)
      fontSize: 0.5,
    });
    const send = controls.addCol({weight: 0.5}).addTextButton({
      text: 'Send',
      fontColor: '#ffffff',
      backgroundColor: '#4285f4',
      fontSize: 0.24,
    });

    // onTriggered unifies click / pinch / touch on a button.
    yes.onTriggered = () => console.log('yes');
    send.onTriggered = () => console.log('send');

    panel.updateLayouts(); // call after building if you set positions manually
  }
}
```

## Cheatsheet

- **Panel**: `new xb.SpatialPanel({backgroundColor, width, height, useDefaultPosition})`;
  set `panel.position` and (for a manually placed root) `panel.isRoot = true`.
- **Containers**: `panel.addGrid()` → `grid.addRow({weight})` → `row.addCol({weight})`.
- **Views**: `.addText({text, fontColor, fontSize})`,
  `.addTextButton({text, fontColor, backgroundColor, fontSize})`,
  `.addIconButton({text: '<material_icon>', fontSize})`. Update text via `view.text = '…'`.
- **Scrolling text**: `new xb.ScrollingTroikaTextView({text, fontSize})` then `.addText(str)`.
- **Interactions**: assign `button.onTriggered = () => {…}`; colors are hex strings.

See `templates/1_ui`, `templates/6_ai`, and `samples/sound` for complete panels.
