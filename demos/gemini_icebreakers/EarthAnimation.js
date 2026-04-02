/**
 * Animates the earth model.
 */
export class EarthAnimation {
  model = null;
  speed = 0.2;

  setModel(model) {
    this.model = model;
  }

  update(deltaTime) {
    const gltfScene = this?.model?.gltf?.scene;
    if (gltfScene) {
      gltfScene.rotation.y += this.speed * deltaTime;
    }
  }
}
