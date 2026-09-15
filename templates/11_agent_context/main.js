import * as THREE from 'three';
import * as xb from 'xrblocks';

class ContextScene extends xb.Script {
  busy = false;

  init() {
    this.add(new THREE.HemisphereLight(0xffffff, 0x222233, 2));
    for (const [name, x, color] of [
      ['Amber object', -0.3, 0xffaa22],
      ['Blue object', 0, 0x4e8cff],
      ['Green object', 0.3, 0x50cf8a],
    ]) {
      const object = new THREE.Mesh(
        new THREE.BoxGeometry(0.18, 0.18, 0.18),
        new THREE.MeshStandardMaterial({color})
      );
      object.name = name;
      object.position.set(x, 1.4, -1);
      this.add(object);
    }
  }

  async onSelectEnd() {
    if (this.busy) return;
    this.busy = true;
    try {
      console.log('Capturing agent context…');
      const context = await xb.core.context.scene.runContextDetection({
        semanticTree: true,
        visibleObjects: true,
        setOfMark: true,
      });
      console.log('Agent context', context);

      const response = await xb.ai.query({
        prompt:
          'Describe this XR scene in one short sentence using the supplied ' +
          `agent context:\n${JSON.stringify({
            visibleObjects: context.visibleObjects,
            marks: context.setOfMark?.marks,
          })}`,
      });
      console.log('Agent response', response?.text ?? response);
    } catch (error) {
      console.error('Agent context failed', error);
    } finally {
      this.busy = false;
    }
  }

  dispose() {
    this.traverse((object) => {
      object.geometry?.dispose();
      object.material?.dispose();
    });
  }
}

const options = new xb.Options().enableContext().enableAI();
options.ai.promptForApiKey = true;
options.xrButton.showEnterSimulatorButton = true;
options.xrButton.appTitle = 'Agent context';
options.xrButton.appDescription =
  'Enter an API key, then let Gemini inspect the named scene objects.';

document.addEventListener('DOMContentLoaded', async () => {
  xb.add(new ContextScene());
  await xb.init(options);
});
