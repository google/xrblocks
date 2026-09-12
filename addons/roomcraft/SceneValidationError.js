/** Invalid authored data, distinct from provider, conflict, or runtime failures. */
class SceneValidationError extends Error {
    constructor(message, options) {
        super(message, options);
        this.name = 'SceneValidationError';
    }
}

export { SceneValidationError };
