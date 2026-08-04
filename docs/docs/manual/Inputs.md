---
sidebar_position: 5
title: Input & Controllers
---

## Input

The [`Input`](/api/classes/Input) object at `xb.core.input` provides access to
controllers. The interaction system delivers raycast targets through object
selection and hover callbacks.

For example, to detect which item is selected:

```js
export class ItemSelectionScript extends xb.Script {
  onObjectSelectStart(event) {
    console.log('Item selected:', event.target);
    console.log('Selected by:', event.source.controller);
    return true;
  }
}
```

When a controller begins selecting, `Input` also sets
`controller.userData.selected` to `true`.
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

- [WebXR input sources](https://developer.mozilla.org/en-US/docs/Web/API/WebXR_Device_API/Inputs) - this includes hand and controllers in Android XR.
- [`MouseController`](/api/classes/MouseController) - this becomes enabled in the simulator when User Mode is active.
- [`GazeController`](/api/classes/GazeController) - this controller represents the center of the screen in Android XR.
