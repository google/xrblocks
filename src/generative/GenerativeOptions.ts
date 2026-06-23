/**
 * Configuration for the {@link GenerativeObjects} subsystem, which turns a text
 * prompt into a placed, draggable object in the scene.
 */
export class GenerativeOptions {
  /** Whether generative objects are enabled. */
  enabled = false;

  /**
   * System instruction passed to the image model. The default steers the model
   * toward a single, centered subject on a plain background so the result reads
   * cleanly as a standalone object.
   */
  systemInstruction =
    'Generate a single, centered subject on a plain, solid white background. ' +
    'No text, no watermark, no border.';

  /** Distance in meters in front of the user to place a new object. */
  distance = 1.0;

  /** Largest dimension (meters) of a placed object; aspect ratio is preserved. */
  maxSize = 0.6;

  /**
   * Enables generative objects.
   * @returns The instance for chaining.
   */
  enable() {
    this.enabled = true;
    return this;
  }
}
