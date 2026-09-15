// Workers do not inherit the document's import map.
import * as transformers from 'https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.0.0/dist/transformers.js';
import {createSamRuntime} from './SamRuntime.js';

const runtime = createSamRuntime({transformers, gpu: self.navigator.gpu});
let queue = Promise.resolve();
self.onmessage = ({data}) => {
  queue = queue.then(async () => {
    try {
      let result;
      if (data.type === 'encode') {
        await runtime.encode(data);
      } else if (data.type === 'mask') {
        result = await runtime.mask(data);
      } else if (data.type === 'dispose') {
        await runtime.dispose();
      } else {
        throw new Error(`Unknown SAM worker request: ${data.type}`);
      }
      self.postMessage(
        {id: data.id, result},
        result?.data ? [result.data.buffer] : []
      );
    } catch (error) {
      try {
        await runtime.dispose();
      } catch (cleanupError) {
        console.warn('[objects_3d] SAM worker disposal failed', cleanupError);
      }
      self.postMessage({
        id: data.id,
        error: error.message || String(error),
        disposed: true,
      });
    }
  });
};
