import 'xrblocks/addons/simulator/SimulatorAddons.js';

import {reversePainterSortStable} from '@pmndrs/uikit';
import * as THREE from 'three';
import * as xb from 'xrblocks';
import {SystemUI} from 'xrblocks/addons/glasses/ui/SystemUI.js';
import {CardStack} from 'xrblocks/addons/glasses/ui/CardStack.js';
import {CardManager} from 'xrblocks/addons/glasses/ui/CardManager.js';
import {GlassesRenderer} from 'xrblocks/addons/glasses/ui/GlassesRenderer.js';

class GlassesUISample extends xb.Script {
  private runningInXr = false;
  private systemUiGroup = new THREE.Group();
  private systemUi!: SystemUI;

  private glassesRenderer?: GlassesRenderer;

  // Card Display.
  private cardManager = new CardManager();
  private cardNumber = 0;

  override async init() {
    this.systemUi = new SystemUI(/*sizeX=*/ 1, /*sizeY=*/ 1);
    this.glassesRenderer = new GlassesRenderer(this.systemUi);
    this.systemUiGroup.add(this.glassesRenderer);
    this.systemUiGroup.position.set(0, 0, -1);
    xb.core.camera.add(this.systemUiGroup);
    xb.core.renderSceneOverride = this.renderSceneOverride;

    this.systemUi.canvas.add(
      new CardStack({
        scrollPosition: this.cardManager.scrollPosition,
        cards: this.cardManager.cards,
      })
    );

    this.add(this.cardManager);

    this.createNewCard();
  }

  override onSelectStart() {
    this.createNewCard();
  }

  private createNewCard() {
    this.cardNumber++;
    const {cardBodySignal, cardTitleSignal} = this.cardManager.createNewCard();
    cardTitleSignal.value = `Card ${this.cardNumber}`;
    cardBodySignal.value = `This is card ${this.cardNumber}.`;
  }

  private onRightXrCamera(rightCamera: THREE.Camera) {
    this.runningInXr = true;
    xb.add(rightCamera);
    this.systemUiGroup.position.set(0, 0, -2);
  }

  override update() {
    this.systemUi.update(xb.getDeltaTime());
    const rightCamera = xb.getXrCameraRight();
    if (rightCamera && !this.runningInXr) {
      this.onRightXrCamera(rightCamera);
    }
  }

  private renderSceneOverride = (
    renderer: THREE.WebGLRenderer,
    scene: THREE.Scene,
    camera: THREE.Camera
  ) => {
    this.glassesRenderer!.render(renderer);
    renderer.render(scene, camera);
  };
}

document.addEventListener('DOMContentLoaded', async () => {
  const options = new xb.Options();
  options.camera.near = 0.001;
  options.reticles.enabled = false;
  options.simulator.instructions.enabled = false;
  options.simulator.handPosePanel.enabled = false;
  options.simulator.modeIndicator.enabled = false;
  options.simulator.renderToRenderTexture = false;
  xb.add(new GlassesUISample());
  await xb.init(options);
  // Setup for @pmndrs/uikit.
  const renderer = xb.core.renderer;
  renderer.localClippingEnabled = true;
  renderer.setTransparentSort(reversePainterSortStable);
});
