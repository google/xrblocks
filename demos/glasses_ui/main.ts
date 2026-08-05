import 'xrblocks/addons/simulator/SimulatorAddons.js';

import * as uikit from '@pmndrs/uikit';
import * as THREE from 'three';
import * as xb from 'xrblocks';
import {SystemUI} from 'xrblocks/addons/glasses/ui/SystemUI.js';
import {CardStack} from 'xrblocks/addons/glasses/ui/CardStack.js';
import {CardManager} from 'xrblocks/addons/glasses/ui/CardManager.js';
import {GlassesRenderer} from 'xrblocks/addons/glasses/ui/GlassesRenderer.js';
import {GlassesModelManager} from 'xrblocks/addons/glasses/ui/GlassesModelManager.js';

// prettier-ignore
const EMOJIS = ['🚀', '😂', '🔥', '💡', '🎉', '🤖', '✨', '🦖', '🍕', '🌍', '🍔', '👾', '🎨', '🎸', '🎲', '🥑'];

class GlassesUISample extends xb.Script {
  private runningInXr = false;
  private systemUiGroup = new THREE.Group();
  private systemUi!: SystemUI;
  private glassesModelManager = new GlassesModelManager();
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

    this.add(this.glassesModelManager);
    this.add(this.cardManager);

    this.createNewCard();
  }

  override onSelectStart() {
    this.createNewCard();
  }

  private createNewCard() {
    this.cardNumber++;
    const {cardBodySignal, cardTitleSignal} = this.cardManager.createNewCard();
    const randomEmoji1 = EMOJIS[Math.floor(Math.random() * EMOJIS.length)];
    const randomEmoji2 = EMOJIS[Math.floor(Math.random() * EMOJIS.length)];
    cardTitleSignal.value = `Card ${this.cardNumber} ${randomEmoji1}`;
    cardBodySignal.value = `This is \ncard ${this.cardNumber} ${randomEmoji2}.`;
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
  options.simulator.handPosePanel.enabled = false;
  options.simulator.renderToRenderTexture = false;
  options.uikit.enable(uikit);
  xb.add(new GlassesUISample());
  await xb.init(options);
});
