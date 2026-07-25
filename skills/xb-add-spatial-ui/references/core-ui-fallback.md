# Core spatial UI fallback

Read this file only after recording the concrete constraint that prevents
UIBlocks from serving the surface.

Core UI is a lightweight grid hierarchy exported from `xrblocks`. Enable it,
create a `SpatialPanel`, and compose grid rows and columns:

```js
class LegacyMenu extends xb.Script {
  init() {
    const panel = new xb.SpatialPanel({
      backgroundColor: '#1a1a1abb',
      width: 2.5,
      height: 1.5,
    });
    panel.position.set(0, xb.user.height, -xb.user.panelDistance);
    this.add(panel);

    const grid = panel.addGrid();
    grid.addRow({weight: 0.6}).addText({
      text: 'Welcome',
      fontColor: '#ffffff',
      fontSize: 0.08,
    });

    const controls = grid.addRow({weight: 0.4});
    const action = controls.addCol({weight: 1}).addTextButton({
      text: 'Continue',
      fontColor: '#ffffff',
      backgroundColor: '#4285f4',
      fontSize: 0.24,
    });
    action.onTriggered = () => setMode('ready');
    panel.updateLayouts();
  }
}

const options = new xb.Options();
options.enableUI();
xb.add(new LegacyMenu());
await xb.init(options);
```

The hierarchy is `SpatialPanel -> Grid -> Row -> Col -> View`. Useful view
builders are `addText`, `addTextButton`, `addIconButton`, and `addImage` where
supported by the surrounding type. `onTriggered` unifies selection on button
views. Keep this fallback surface internally core UI; keep any separate
UIBlocks surface internally UIBlocks.

Document every button's desktop and XR input plus intended state change. Include
the panel's physical dimensions, layout weights, text scale, and position in the
user handoff.
