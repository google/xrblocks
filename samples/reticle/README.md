# Reticle Sample

## XR Blocks 2.0

```js
import {ExitButton} from '...';
import {xrExitButton, xrStats} from '...';
// you can also import {xrCore}

// Example code for operating a reticle in XR:
// WebXR, mobile, and desktop simulated.
// in XR, if depth wasn't enabled, reticle should be bounded to a sphere.
class ReticleScript extends Script {
  init() {
    // xb.add(this);
    super();

    this.billboards = new THREE.Group();
    this.billboards.add(...this.controllers.map(() => new TextBillboard()));
  }

  /**
   * Moves painter to the pivot position of the current controller.
   */
  onSelectStart(event) {
    const controller = event.target;
    const id = controller.userData.id;
    const billboard = this.billboards.children[id];

    billboard.visible = false;
  }

  /**
   * Moves painter to the pivot position of the current controller.
   */
  onSelecting(event) {
    const controller = event.target;
    const id = controller.userData.id;
    const billboard = this.billboards.children[id];

    billboard.updateText(
        `Distance: ${intersections[0].distance.toFixed(2)} m\n` +
        `Height: ${reticleHeight.toFixed(2)} m`);
  }

  onSelectEnd(event) {
    billboard.visible = false;
  }
};

```

