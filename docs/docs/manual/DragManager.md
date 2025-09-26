---
sidebar_position: 11
title: Drag Manager
---

The `DragManager` class provides interactions for `ModelViewer` objects and is loaded at `core.dragManager`.

## Interactions

### Translation

Translation is initiated by selecting the platform of the model viewer object and moving or rotating the hand or controller.
During translation, the rotation of the object stays the same.

### Rotation

Rotation is initiated by selecting the invisible bounding cylinder of bounding box of the object and moving the hand or controller.
Only the yaw of the model is rotated.

In the simulator, the rotation is based on the direction of the `MouseController` as the position of the `MouseController` is constrained to the camera position.

### Scaling

Scaling is initiated by selecting the object with both hands or controllers.
While selecting, the scale of the model will be set based on the distance between both controllers.

## Usage

The Drag Manager can also be used with custom objects beyond Model Viewer.

To allow a custom object to be used with drag manager, add a `draggable` property to the object to allow it to be detected by DragManager.
Then add children with a `draggingMode` property set to one of the following values:

1. `DragManager.TRANSLATING`
2. `DragManager.ROTATING`

When selecting one of the children with one of the above values, the object with `draggable` property will begin translating or rotating.
