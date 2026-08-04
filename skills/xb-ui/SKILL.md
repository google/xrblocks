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
    padding: 24,
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

Use `UIOverlay` instead of `UICard` for view-space content. Use nested
`UIPanel` elements for flex rows and columns. All non-root UI elements must be
under one card or overlay.

Styles support flex layout, spacing, text, borders, solid or gradient paint,
shadows, and `:hover`, `:active`, and `:disabled` states.

See `templates/1_ui` and `docs/docs/manual/UI.mdx` for complete examples.
