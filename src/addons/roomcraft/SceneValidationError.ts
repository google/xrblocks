/** Invalid authored data, distinct from provider, conflict, or runtime failures. */
export class SceneValidationError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = 'SceneValidationError';
  }
}
