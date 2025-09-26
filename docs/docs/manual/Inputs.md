---
sidebar_position: 4
---

## XRInput
The XRInput object available at `core.input` provides access to controllers and raycasting results.
Intersection results can be queries using the `intersectionsForController` property which maps controllers to raycast results.
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

* WebXR input sources - this includes hand and controllers in Android XR.
* `MouseController` - this becomes enabled in the simulator when User Mode is active.
* `GazeController` - this controller represents the center of the screen in Android XR.
