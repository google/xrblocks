---
name: xb-ui
description: >-
  Build flex-layout spatial UI with UICard, UIOverlay, UIPanel, UIText, UIImage,
  UIIcon, UIButton, and UISlider. Use for HUDs, menus, dialogs, and controls.
---

# xb-ui: spatial UI

XR Blocks provides one UI system from the main `xrblocks` export. It starts
with the engine and needs no addon registration.

## World-space card

```js
const card = new xb.UICard({
  size: {width: 0.6, height: 0.35},
  manipulation: true,
  edge: {scale: true},
  style: {
    flexDirection: 'column',
    gap: 16,
    backgroundColor: '#202124',
    borderRadius: 24,
  },
  children: [
    new xb.UIText({
      text: 'Welcome',
      style: {fontSize: 32, color: '#ffffff'},
    }),
    new xb.UIButton({
      label: 'Continue',
      onClick: () => console.log('continue'),
      style: {padding: 16, backgroundColor: '#4285f4'},
    }),
  ],
});

card.position.set(0, 1.4, -1);
xb.add(card);
```

Use `UIOverlay` instead of `UICard` for a view-space surface:

```js
const overlay = new xb.UIOverlay({
  style: {
    width: 420,
    position: 'absolute',
    left: '50%',
    bottom: 24,
    transform: {translateX: '-50%'},
  },
  children: [new xb.UIText({text: 'Ready'})],
});
```

Cards and overlays use the theme's `surface` appearance by default. Do not
wrap either root in a full-size painted panel. Set `appearance: 'none'` for a
transparent root. Use nested `UIPanel` elements only for neutral flex rows and
columns. All non-root UI elements must be under one card or overlay.

Styles support flex layout, spacing, text, borders, solid or gradient paint,
shadows, and `:hover`, `:active`, and `:disabled` states.

For transcripts or multilingual text, use `UIText` directly. It selects its
Unicode glyph renderer internally without replacing the mounted layout node.
Use `whiteSpace: 'pre-line'`, `verticalAlign: 'bottom'`, a fixed `height`, and
`overflow: 'hidden'` when the newest wrapped lines must remain visible.

After a mounted layout completes, call `xb.ui.validate(root)` to check for
overflow, clipped text, invalid layout, and overlay content outside the
viewport.

See `templates/1_ui` and `docs/docs/manual/UI.mdx` for complete examples.
