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
   * Whether generated objects continuously turn to face the user (billboard).
   * Keeps the flat cutout from ever looking paper-thin from the side.
   */
  billboard = true;

  /**
   * Whether to key out the (plain) background of the generated image so the
   * subject reads as a clean cutout instead of a flat card. Requires a browser
   * 2D canvas; ignored in non-browser environments.
   */
  removeBackground = true;

  /**
   * Enables generative objects.
   * @returns The instance for chaining.
   */
  enable() {
    this.enabled = true;
    return this;
  }
}
