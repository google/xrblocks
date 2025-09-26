import * as THREE from 'three';
import * as xb from 'xrblocks';

//
// Unique name for objects
//
let globalIndex = 0;

class AnimationItemView {
  constructor(options, objectView, modelView, isDebug = false) {
    this.options = {...options};
    this.objectView = objectView;
    this.modelView = modelView;
    this.isDebug = isDebug;
    this.isReady = false;
    this.isPlaying = false;
    this.animationStartTime = performance.now();
    this.enableDebugIfNeeded();
  }

  enableDebugIfNeeded() {
    if (this.isDebug) {
      return;
    }

    this.uniqueId = globalIndex++;

    this.name = 'GLTF_MODEL_VIEW_' + this.uniqueId;

    //
    // Uses to measure models load time
    //
    console.time(this.name);

    // disable auto-start for animation

    // name for debug messages
    this.modelView.name = 'ModelViewer-' + this.uniqueId;

    // Init ObjectViewer (wrapper for the ModelViewer)

    // objectView.visible = false;
    this.objectView.name = 'ObjectView-' + this.uniqueId;
  }

  printItemInfo() {
    if (!this.isDebug) return;

    this.printInfo(this.modelView);
    this.printInfo(this.objectView);
  }

  printInfo(model) {
    if (!model) {
      console.warn('Model is null or undefined.');
      return;
    }

    console.log(`--- Model Information: ${model.name || 'Unnamed Model'} ---`);

    // Position
    console.log(
        'Position:', model.position.x.toFixed(2), model.position.y.toFixed(2),
        model.position.z.toFixed(2));

    // Scale
    console.log(
        'Scale:', model.scale.x.toFixed(5), model.scale.y.toFixed(5),
        model.scale.z.toFixed(5));

    // Size (Bounding Box)
    const boundingBox = new THREE.Box3().setFromObject(model);
    const size = new THREE.Vector3();
    boundingBox.getSize(size);
    console.log(
        'Size (Width x Height x Depth):',
        `${size.x.toFixed(2)} x ${size.y.toFixed(2)} x ${size.z.toFixed(2)}`);

    console.log('------------------------------------------');
  }

  onSceneReady(data, scene) {
    this.isReady = true;
    //
    // Note: Pay attention that scale will be applied to position too
    //
    if (data.position) {
      this.modelView.position.copy(data.position);
    }

    //
    // Set 0 position for the scene
    //
    const scene_position = data.model.position || {x: 0, y: 0, z: 0};
    scene.position.copy(scene_position);

    //
    // Debug: print the model load time
    //
    if (this.isDebug) console.timeEnd(this.name);
  }

  //
  // update binded options
  //
  updateOptions(newOptions) {
    this.options = {...newOptions};
  }
}

export class AnimationHandler {
  constructor(data, isDebug = false) {
    this.data = data;
    this.isDebug = isDebug;
    this.animationViews = [];
  }

  init(core, panel, options = {}) {
    this.loadGltfModels(panel, this.data, options);
    for (let i = 0; i < this.animationViews.length; ++i) {
      const item = this.animationViews[i];
      core.scene.add(item.modelView);
    }
  }

  loadGltfModels(panel, data, options) {
    // Return the list
    let result = [];
    for (let i = 0; i < data.length; i++) {
      if (data[i].model) {
        //
        // Init model viewer
        //
        let objectView = new xb.View();
        // objectView.visible = false;
        const model = new xb.ModelViewer({});
        model.visible = false;
        model.startAnimationOnLoad = false;

        const animationItem =
            new AnimationItemView(options, objectView, model, this.isDebug);
        this.animationViews.push(animationItem);

        // Load model
        model.loadGLTFModel({
          data: data[i].model,
          setupRaycastCylinder: false,
          setupRaycastBox: true,
          renderer: xb.core.renderer,
          setupPlatform: false,
          onSceneLoaded: (scene) => {
            animationItem.onSceneReady(data[i], scene);
          }
        });
        // Make a scene hierarchy
        objectView.add(model);
        panel.add(objectView);
      }
    }
    panel.updateLayouts();
  }

  onBeforePlay() {
    // Empty
  }

  onBeforeUpdate() {}

  play(playbackTime = 1800) {
    if (this.isPlaying) {
      return;
    }

    this.isPlaying = true;

    this.animationDuration = playbackTime;

    // Override this method if needed
    this.onBeforePlay();

    for (let i = 0; i < this.animationViews.length; ++i) {
      const item = this.animationViews[i];
      // Assign core to model
      item.modelView.playClipAnimationOnce();

      // Print position + size
      item.printItemInfo();
    }
    // Make all objects visible
    this.setVisibility(true);

    //
    // NOTE: Increase timeout to hide animation later
    //       Entire animation ~6 seconds
    //

    setTimeout(() => {
      this.setVisibility(false);
      setTimeout(() => {
        this.isPlaying = false;
      }, 150);
    }, playbackTime);
  }

  setVisibility(visible) {
    for (let i = 0; i < this.animationViews.length; ++i) {
      const item = this.animationViews[i];
      item.modelView.visible = visible;
    }
  }
}
