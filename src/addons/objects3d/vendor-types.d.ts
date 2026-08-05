/**
 * Ambient stub for `@huggingface/transformers`.
 *
 * The package is loaded at runtime via the page importmap; it is NOT installed
 * in node_modules (it is listed as external in rollup.config.js). These stubs
 * give TypeScript enough information to compile dynamic `import()` calls
 * without needing the package to be installed.
 */
declare module '@huggingface/transformers' {
  export const SamModel: {
    from_pretrained(
      id: string,
      opts?: Record<string, unknown>
    ): Promise<unknown>;
  };
  export const AutoProcessor: {
    from_pretrained(id: string): Promise<unknown>;
  };
  export const RawImage: {
    fromCanvas(canvas: HTMLCanvasElement): Promise<unknown>;
  };
  export const env: {allowLocalModels: boolean};
}
