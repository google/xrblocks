/** Injects the editor's shared stylesheet into the page exactly once,
 * regardless of how many editor panels/instances end up calling this --
 * safe to call from every panel's constructor. */
export declare function injectEditorStyles(): void;
