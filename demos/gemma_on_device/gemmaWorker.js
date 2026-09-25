const RUNTIME_URL =
  'https://esm.sh/@litert-lm/core@0.17.1?deps=@litertjs/wasm-utils@2.0.0&bundle';
const WASM_URL = 'https://cdn.jsdelivr.net/npm/@litert-lm/core@0.17.1/wasm/';

// Keep this a classic worker: the runtime's WASM loader uses importScripts.
const runtime = import('./GemmaRuntime.js').then(
  ({GemmaRuntime}) =>
    new GemmaRuntime({
      loadRuntime: () => {
        self.Module = {locateFile: (name) => new URL(name, WASM_URL).href};
        return import(RUNTIME_URL);
      },
      openModel: async () =>
        (await import('./modelStore.js')).openCachedModel(),
      postMessage: (message) => self.postMessage(message),
      close: () => self.close(),
    })
);

self.onmessage = ({data}) => {
  runtime
    .then((controller) => controller.handle(data))
    .catch((error) => {
      self.postMessage({
        type: 'error',
        id: data?.id,
        name: error?.name ?? 'Error',
        message: error?.message ?? String(error),
        fatal: true,
      });
    });
};
