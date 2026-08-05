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
    if (this.model) this.model.rotation.y += this.speed * deltaTime;
  }
}
