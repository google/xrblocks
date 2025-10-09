---
sidebar_position: 4
---

## Input
The [`Input`](/api/classes/Input) object available at `xb.core.input` provides access to controllers and raycasting results.
Intersection results can be queries using the [`intersectionsForController`](/api/classes/Input#intersectionsforcontroller) property which maps controllers to raycast results.
Raycast results are automatically updated when the controller begins selecting.

For example, to detect which item is selected:
```js
export class ItemSelectionScript extends xb.Script {
  onSelectStart(event) {
    const controller = event.target;
    const intersections = xb.core.input.intersectionsForController(controller);
    if (intersections.length > 0) {
        console.log("Item selected:", intersections[0].object);
    }
  }
}
```

When a controller begins selecting, XRInput also sets `controller.userData.selected` to `true`.
This can be used to loop over controllers which are selecting.
For example:
```js
export class ItemSelectionScript extends xb.Script {
  update() {
    const controllers = xb.core.input.controllers;
    for (const controller of controllers) {
      if (controller.userData.selected) {
          handleController(controller);
      }
    }
  }
}
```

## Controllers

XR Blocks currently includes the following controllers:

* [WebXR input sources](https://developer.mozilla.org/en-US/docs/Web/API/WebXR_Device_API/Inputs) - this includes hand and controllers in Android XR.
* [`MouseController`](/api/classes/MouseController) - this becomes enabled in the simulator when User Mode is active.
* [`GazeController`](/api/classes/GazeController) - this controller represents the center of the screen in Android XR.
