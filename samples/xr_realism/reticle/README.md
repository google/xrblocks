# Reticle Sample

This sample demonstrates how to use the built-in reticle and interact with the physical environment mapping (depth mesh) using WebXR input.

When a user points at a detected surface and holds trigger, pinch, or click, a raycast is performed against the depth mesh. A spatial UI card appears at the intersection point and shows the live distance and world-space height. Releasing the input leaves the measurement in place.

## Key Features

- **Built-in Reticle**: Projects each enabled reticle onto the spatial depth mesh with `options.reticles.projectOnDepthMesh = true`.
- **Environment Interaction**: Reads the current depth-mesh hit from `event.intersection` during selection.
- **Dynamic UI**: Spawns a world-space `xb.UICard` with `xb.FaceCamera` and updates it at the physical intersection point.
- **Instructions**: Uses an `xb.UIOverlay` to explain the interaction in XR and the desktop simulator.
