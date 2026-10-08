import {YamnetExtractor} from '../../build/addons/interactive-ml/Yamnet.js';
let extractor;
let loading;
self.onmessage = async ({data}) => {
  try {
    loading ??= (async () => {
      const tf = await import(
        'https://cdn.jsdelivr.net/npm/@tensorflow/tfjs@4.22.0/+esm'
      );
      let accelerated = false;
      try {
        accelerated = await tf.setBackend('webgl');
      } catch {          
          console.error("Worker has no usable GPU context.");
      }
      if (!accelerated) await tf.setBackend('cpu');
      await tf.ready();
      extractor = await YamnetExtractor.load(tf);
      return tf.getBackend();
    })();
    const backend = await loading;
    const features = data.clip ? await extractor.extract(data.clip) : undefined;
    self.postMessage({features, backend});
  } catch (error) {
    self.postMessage({error: error.message});
  }
};
