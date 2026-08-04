# Interaction Playground

This demo is the manual test scene for the interaction and UI refactor. Serve
the repository and open:

`http://127.0.0.1:8080/demos/interaction_playground/`

The scene covers:

- Default and explicit translate, rotate, and scale configurations.
- Owner and child manipulation handles.
- `preventDefault()` during manipulation start.
- Select, hover, long-select, touch, grab, and manipulation callbacks.
- Surface, target, hidden, disabled, and pass-through reticle cases.
- `UICard`, `UIPanel`, `UIButton`, `UIText`, `UIIcon`, and `UIImage`.
- Fill, border, flex layout, UI clicks, and UI long-select.
- `FaceCamera` on UI and `FollowHead`, `FollowObject`, and
  `VisibilityTransition` on ordinary 3D objects.
- Transform-script suspension and rebasing while an object is manipulated.
- Depth sensing for physical or simulated environment reticles.

Use the mouse wheel over a manipulable object to test simulator scaling. In
spatial input, hold a scale-enabled object with one source and select with a
second free source to test two-source scaling.

Hold the gold object or the **Click or hold** UI button for at least 0.75
seconds to test long-select. Use the XR control card to reset the scene or
toggle the 3D visibility sample.
