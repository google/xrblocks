import * as THREE from 'three';
import * as xb from 'xrblocks';

/**
 * A basic example of using the XR Blocks SDK's world component to detect
 * objects in the real world using Gemini.
 */
class MainScript extends xb.Script {
  init() {
    this.add(new THREE.HemisphereLight(0xffffff, 0x666666, /*intensity=*/ 3));
  }

  /**
   * Runs object detection on select (click in simulator, pinch in XR device).
   * The results of the detection are automatically handled by the
   * ObjectDetector, which will create debug visuals for each detected object.
   * This behavior is enabled when `showDebugVisualizations` is set to true.
   * @param {XRInputSourceEvent} event event.target holds controller or hand
   * data.
   */
  async onSelectEnd() {
    console.log('Running object detection...');
    const detectedObjects = await xb.world.objects.runDetection();

    // `detectedObjects` is an array of THREE.Object3D instances, each
    // representing a detected object. These objects contain the 3D world
    // position and other metadata returned by the detection model.
    if (detectedObjects.length > 0) {
      console.log('Detected objects:', detectedObjects);
    } else {
      console.log('No objects detected.');
    }
  }
}

document.addEventListener('DOMContentLoaded', function() {
  const options = new xb.Options();

  // AI is required for the object detection backend. Please set your
  options.enableAI();

  // Enable the environment camera to provide the video feed to the AI module.
  options.enableCamera('environment');

  // Depth is required to project the 2D detections from the AI module into 3D.
  options.enableDepth();

  // Enable the object detection feature and its debug visualizations.
  options.world.enableObjectDetection();
  options.world.objects.showDebugVisualizations = true;

  xb.add(new MainScript());
  xb.init(options);
});
