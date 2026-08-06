import * as xb from 'xrblocks';

class SceneUnderstanding extends xb.Script {
  onXRSessionStarted() {
    void this.scan();
  }

  onSimulatorStarted() {
    void this.scan();
  }

  async scan() {
    console.log('Scanning scene…');
    try {
      const objects = await xb.world.objects.runDetection();
      console.log(`Found ${objects.length} objects.`, objects);
      console.table(objects.map(({label}) => ({label})));
    } catch (error) {
      console.error('Scene scan failed.', error);
    }
  }
}

const options = new xb.Options();
options.enableCamera('environment');
options.enableDepth();
options.enableObjectDetection();
options.world.objects.backendConfig.activeBackend = 'mediapipe';
options.world.objects.simulatorOverride = true;
options.world.objects.showDebugVisualizations = new URLSearchParams(
  window.location.search
).has('debug');

xb.add(new SceneUnderstanding());
await xb.init(options);
