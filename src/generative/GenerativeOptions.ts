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

  /**
   * Place new objects where the user is looking hits the real-world depth mesh
   * (so they sit on your table/floor), falling back to {@link distance} in front
   * of the camera when there is no surface hit. Requires depth to be enabled.
   */
  groundOnSurface = true;

  /** Largest dimension (meters) of a placed object; aspect ratio is preserved. */
  maxSize = 0.6;

  /**
   * Whether generated objects continuously turn to face the user (billboard).
   * Keeps the flat cutout from ever looking paper-thin from the side.
   */
  billboard = true;

  /**
   * Experimental: build the object as a 2.5D relief instead of a flat cutout.
   * A densely subdivided plane is displaced by the generated image's
   * brightness (via a three.js displacement + bump map), giving the subject
   * real, shaded surface relief. Approximate (brightness is not true depth) and
   * requires a light in the scene. Best viewed with {@link billboard} off.
   */
  relief = false;

  /** Relief displacement depth in meters (when {@link relief} is on). */
  reliefStrength = 0.08;

  /** Plane subdivisions per side used to build the relief mesh. */
  reliefSegments = 96;

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
